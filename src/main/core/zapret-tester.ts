import { spawn, ChildProcess } from 'child_process'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { BrowserWindow } from 'electron'
import { dataDir, zapretBundleDir } from '../utils/dirs'
import {
  ensureWinDivertReady,
  getZapretStatus,
  isWinwsRunning,
  killWinws,
  listStrategies,
  materializeZapretRuntime,
  startZapret,
  withZapretLock
} from './zapret'
import { getAppConfig, patchAppConfig } from '../config'
import { ALWAYS_APPLY_SERVICE_IDS, SERVICE_RULES } from './service-catalog'

const DEFAULT_HTTP_TARGETS: Array<{ label: string; target: string }> = [
  { label: 'Discord', target: 'https://discord.com' },
  { label: 'Discord Gateway', target: 'https://gateway.discord.gg' },
  { label: 'Discord CDN', target: 'https://cdn.discordapp.com' },
  { label: 'Discord Updates', target: 'https://updates.discord.com' },
  { label: 'YouTube', target: 'https://www.youtube.com' },
  { label: 'YouTube Short', target: 'https://youtu.be' },
  { label: 'YouTube Image', target: 'https://i.ytimg.com' },
  { label: 'Google', target: 'https://www.google.com' },
  { label: 'Cloudflare', target: 'https://www.cloudflare.com' },
  { label: 'Cloudflare DNS', target: 'PING:1.1.1.1' }
]

const PROBE_TIMEOUT_MS = 4000
const STRATEGY_WARMUP_MS = 3200
const STRATEGY_BOOT_TIMEOUT_MS = 5500
const PASS_THRESHOLD = 0.5
const RESULTS_FILENAME = 'zapret-test-results.json'

export interface StrategyTestResult {
  passed: boolean
  okCount: number
  totalCount: number
  score: number
  tested: true
  failedTargets?: string[]
  blockedTargets?: string[]
}

export interface StrategyTestReport {
  ranAt: number
  durationMs: number
  bundleVersion?: string
  results: Record<string, StrategyTestResult>
  bestStrategy?: string
}

export interface SettingsBenchmarkResult {
  ipsetMode: 'loaded' | 'none' | 'any'
  gameFilterMode: 'disabled' | 'tcpudp' | 'tcp' | 'udp'
  okCount: number
  totalCount: number
  score: number
}

export interface SettingsBenchmarkReport {
  ranAt: number
  strategy: string
  bestIpsetMode: 'loaded' | 'none' | 'any'
  bestGameFilterMode: 'disabled' | 'tcpudp' | 'tcp' | 'udp'
  bestScore: number
  combinations: SettingsBenchmarkResult[]
}

interface TestProgress {
  phase: 'starting' | 'testing' | 'completed' | 'error' | 'idle'
  current?: number
  total?: number
  strategy?: string
  report?: StrategyTestReport
  message?: string
}

let runningPromise: Promise<StrategyTestReport> | null = null
let cancelRequested = false
let cachedReport: StrategyTestReport | null = null

function resultsPath(): string {
  return path.join(dataDir(), RESULTS_FILENAME)
}

export function getStrategyTestResults(): StrategyTestReport | null {
  if (cachedReport) return cachedReport
  try {
    const p = resultsPath()
    if (!existsSync(p)) return null
    const raw = readFileSync(p, 'utf8')
    const parsed = JSON.parse(raw) as StrategyTestReport
    if (parsed && typeof parsed.ranAt === 'number' && parsed.results) {
      cachedReport = parsed
      return parsed
    }
    return null
  } catch {
    return null
  }
}

function saveReport(report: StrategyTestReport): void {
  try {
    writeFileSync(resultsPath(), JSON.stringify(report, null, 2), 'utf8')
    cachedReport = report
  } catch (e) {
    console.warn('[zapret-tester] save report failed:', e)
  }
}

function broadcast(channel: string, payload: TestProgress): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function loadTestTargets(): Promise<Array<{ label: string; target: string }>> {
  const cfg = await getAppConfig().catch(() => null)
  const selectedIds = new Set<string>([
    ...ALWAYS_APPLY_SERVICE_IDS,
    ...(cfg?.zapret?.selectedServices ?? [])
  ])

  const targets: Array<{ label: string; target: string }> = []
  const seen = new Set<string>()

  const addTarget = (label: string, target: string): void => {
    const key = target.trim().toLowerCase()
    if (!key || seen.has(key)) return
    seen.add(key)
    targets.push({ label: label.trim() || target.trim(), target: target.trim() })
  }

  // 1. Add targets from selected service rules
  for (const id of selectedIds) {
    const rule = SERVICE_RULES[id]
    if (!rule?.testTargets) continue
    for (const t of rule.testTargets) {
      addTarget(t.label, t.target)
    }
  }

  // 2. Parse utils/targets.txt if present and targets list is small
  const targetsTxt = path.join(zapretBundleDir(), 'utils', 'targets.txt')
  if (existsSync(targetsTxt) && targets.length < 6) {
    try {
      const lines = readFileSync(targetsTxt, 'utf8').split(/\r?\n/)
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx > 0) {
          const label = trimmed.slice(0, eqIdx).trim()
          const val = trimmed.slice(eqIdx + 1).trim().replace(/^"|"$/g, '')
          if (val) addTarget(label, val)
        }
      }
    } catch {
      /* noop */
    }
  }

  if (targets.length === 0) {
    for (const d of DEFAULT_HTTP_TARGETS) addTarget(d.label, d.target)
  }

  return targets
}

interface ProbeResult {
  label: string
  target: string
  ok: boolean
  blocked?: boolean
  status?: number
  ms: number
  error?: string
}

function pingHost(host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn('ping.exe', ['-n', '1', '-w', '1500', host], { windowsHide: true })
    p.on('exit', (code) => resolve(code === 0))
    p.on('error', () => resolve(false))
  })
}

async function probeOne(item: { label: string; target: string }): Promise<ProbeResult> {
  const t0 = Date.now()
  if (item.target.toUpperCase().startsWith('PING:')) {
    const host = item.target.slice(5).trim()
    const ok = await pingHost(host)
    return {
      label: item.label,
      target: item.target,
      ok,
      ms: Date.now() - t0
    }
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS)
  try {
    const res = await fetch(item.target, {
      method: 'HEAD',
      redirect: 'manual',
      signal: ctrl.signal,
      headers: { Connection: 'close' }
    })
    const blocked = res.status === 451
    return {
      label: item.label,
      target: item.target,
      ok: !blocked && res.status >= 200 && res.status < 600,
      blocked,
      status: res.status,
      ms: Date.now() - t0
    }
  } catch (e) {
    return {
      label: item.label,
      target: item.target,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      ms: Date.now() - t0
    }
  } finally {
    clearTimeout(timer)
  }
}

async function probeAll(targets: Array<{ label: string; target: string }>): Promise<ProbeResult[]> {
  return Promise.all(targets.map(probeOne))
}

async function killChildTree(pid: number | undefined): Promise<void> {
  if (!pid) return
  await new Promise<void>((r) => {
    const p = spawn('taskkill.exe', ['/F', '/T', '/PID', String(pid)], { windowsHide: true })
    p.on('exit', () => r())
    p.on('error', () => r())
  })
}

async function spawnStrategy(batPath: string): Promise<ChildProcess> {
  const dir = zapretBundleDir()
  const c = spawn('cmd.exe', ['/c', batPath], {
    cwd: dir,
    windowsHide: true,
    detached: false,
    env: {
      ...process.env,
      NO_UPDATE_CHECK: '1'
    }
  })
  c.stdout?.on('data', () => void 0)
  c.stderr?.on('data', () => void 0)
  c.on('error', () => void 0)
  return c
}

async function testOneStrategy(
  batPath: string,
  targets: Array<{ label: string; target: string }>
): Promise<{
  okCount: number
  totalCount: number
  score: number
  passed: boolean
  failedTargets: string[]
  blockedTargets: string[]
}> {
  await killWinws()
  await sleep(200)

  try {
    ensureWinDivertReady()
  } catch {
    /* best effort */
  }

  const child = await spawnStrategy(batPath)
  try {
    const deadline = Date.now() + STRATEGY_BOOT_TIMEOUT_MS
    let booted = false
    while (Date.now() < deadline) {
      if (await isWinwsRunning()) {
        booted = true
        break
      }
      if (child.exitCode !== null) break
      await sleep(150)
    }
    if (!booted) {
      return {
        okCount: 0,
        totalCount: targets.length,
        score: 0,
        passed: false,
        failedTargets: targets.map((t) => t.label),
        blockedTargets: []
      }
    }

    await sleep(STRATEGY_WARMUP_MS)

    const results = await probeAll(targets)
    const okCount = results.filter((r) => r.ok).length
    const failedTargets = results.filter((r) => !r.ok && !r.blocked).map((r) => r.label)
    const blockedTargets = results.filter((r) => r.blocked).map((r) => r.label)
    const totalCount = results.length
    const score = totalCount === 0 ? 0 : okCount / totalCount
    return {
      okCount,
      totalCount,
      score,
      passed: score >= PASS_THRESHOLD,
      failedTargets,
      blockedTargets
    }
  } finally {
    await killWinws()
    await killChildTree(child.pid)
    await sleep(300)
  }
}

export function cancelStrategyTests(): void {
  cancelRequested = true
}

export function runStrategyTests(): Promise<StrategyTestReport> {
  if (runningPromise) return runningPromise
  cancelRequested = false

  runningPromise = (async () => {
    const startedAt = Date.now()
    await materializeZapretRuntime().catch(() => void 0)

    const strategies = await listStrategies()
    const total = strategies.length
    if (total === 0) {
      const empty: StrategyTestReport = {
        ranAt: startedAt,
        durationMs: 0,
        results: {}
      }
      saveReport(empty)
      broadcast('zapret:testProgress', { phase: 'completed', report: empty })
      return empty
    }

    const targets = await loadTestTargets()
    const cfg = await getAppConfig().catch(() => null)
    const wasRunning = getZapretStatus().state === 'running'

    broadcast('zapret:testProgress', {
      phase: 'starting',
      total,
      current: 0
    })

    const results: Record<string, StrategyTestResult> = {}
    let bestStrategy: string | undefined
    let bestScore = -1
    let testError: Error | null = null

    try {
      await withZapretLock(async () => {
        if (wasRunning) await killWinws()
        await sleep(400)

        for (let i = 0; i < strategies.length; i++) {
          if (cancelRequested) break
          const s = strategies[i]
          broadcast('zapret:testProgress', {
            phase: 'testing',
            current: i + 1,
            total,
            strategy: s.file
          })
          const batPath = path.join(zapretBundleDir(), s.file)
          if (!existsSync(batPath)) {
            results[s.file] = {
              tested: true,
              passed: false,
              okCount: 0,
              totalCount: targets.length,
              score: 0
            }
            continue
          }
          try {
            const r = await testOneStrategy(batPath, targets)
            results[s.file] = { tested: true, ...r }
            if (r.passed && r.score > bestScore) {
              bestScore = r.score
              bestStrategy = s.file
            }
          } catch (e) {
            console.warn(`[zapret-tester] ${s.file} threw:`, e)
            results[s.file] = {
              tested: true,
              passed: false,
              okCount: 0,
              totalCount: targets.length,
              score: 0
            }
          }
        }
      })
    } catch (e) {
      testError = e instanceof Error ? e : new Error(String(e))
    }

    const report: StrategyTestReport = {
      ranAt: startedAt,
      durationMs: Date.now() - startedAt,
      bundleVersion: cfg?.zapret?.installedVersion,
      results,
      bestStrategy
    }
    saveReport(report)

    if (wasRunning) {
      try {
        await startZapret()
      } catch {
        /* surfaced via status */
      }
    }

    if (testError) {
      broadcast('zapret:testProgress', {
        phase: 'error',
        message: testError.message,
        report
      })
    } else {
      broadcast('zapret:testProgress', { phase: 'completed', report })
    }
    return report
  })()

  runningPromise.finally(() => {
    runningPromise = null
  })

  return runningPromise
}

/**
 * Benchmark combinations of ipsetMode ('loaded' | 'none' | 'any') and
 * gameFilterMode ('disabled' | 'tcpudp') for the active strategy and auto-apply the winner.
 */
export async function runSettingsBenchmark(): Promise<SettingsBenchmarkReport> {
  const cfg = await getAppConfig()
  const strategies = await listStrategies()
  const activeStrategy = cfg.zapret?.activeStrategy || strategies[0]?.file || 'general.bat'
  const batPath = path.join(zapretBundleDir(), activeStrategy)
  if (!existsSync(batPath)) {
    throw new Error(`Стратегия ${activeStrategy} не найдена`)
  }

  const targets = await loadTestTargets()
  const wasRunning = getZapretStatus().state === 'running'

  const combos: Array<{
    ipsetMode: 'loaded' | 'none' | 'any'
    gameFilterMode: 'disabled' | 'tcpudp'
  }> = [
    { ipsetMode: 'loaded', gameFilterMode: 'disabled' },
    { ipsetMode: 'loaded', gameFilterMode: 'tcpudp' },
    { ipsetMode: 'none', gameFilterMode: 'disabled' },
    { ipsetMode: 'any', gameFilterMode: 'tcpudp' }
  ]

  const combinations: SettingsBenchmarkResult[] = []
  let bestIpsetMode: 'loaded' | 'none' | 'any' = cfg.zapret?.ipsetMode ?? 'loaded'
  let bestGameFilterMode: 'disabled' | 'tcpudp' | 'tcp' | 'udp' =
    cfg.zapret?.gameFilterMode ?? 'disabled'
  let bestScore = -1

  await withZapretLock(async () => {
    if (wasRunning) await killWinws()
    await sleep(300)

    for (const c of combos) {
      await materializeZapretRuntime({
        ipsetMode: c.ipsetMode,
        gameFilterMode: c.gameFilterMode
      })
      const r = await testOneStrategy(batPath, targets)
      combinations.push({
        ipsetMode: c.ipsetMode,
        gameFilterMode: c.gameFilterMode,
        okCount: r.okCount,
        totalCount: r.totalCount,
        score: r.score
      })
      if (r.score > bestScore) {
        bestScore = r.score
        bestIpsetMode = c.ipsetMode
        bestGameFilterMode = c.gameFilterMode
      }
    }
  })

  // Apply winning settings
  await patchAppConfig({
    zapret: {
      ...(cfg.zapret as ZapretConfig),
      ipsetMode: bestIpsetMode,
      gameFilterMode: bestGameFilterMode,
      gameFilter: bestGameFilterMode !== 'disabled'
    }
  })
  await materializeZapretRuntime()

  if (wasRunning) {
    try {
      await startZapret()
    } catch {
      /* noop */
    }
  }

  return {
    ranAt: Date.now(),
    strategy: activeStrategy,
    bestIpsetMode,
    bestGameFilterMode,
    bestScore: Math.max(0, bestScore),
    combinations
  }
}

export function isStrategyTestRunning(): boolean {
  return runningPromise !== null
}
