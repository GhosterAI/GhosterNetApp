import { agUnlockerBinaryPath } from '../utils/dirs'
import { execFile } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const TASK_DNS = 'AG Unlocker DNS'
const TASK_WATCHDOG = 'AG Unlocker Watchdog'
const EXE_NAME = 'ag_dns.exe'
const AG_NRPT_TAG = 'AG_UNLOCKER_NRPT_V2'
const AG_NRPT_LEGACY_TAGS = ['AG_UNLOCKER_NRPT']
const AG_NRPT_CORE = ['cloudcode-pa.googleapis.com', 'daily-cloudcode-pa.googleapis.com']
const LISTEN_IP = '127.0.0.53'
const DEFAULT_PROXY_PORT = 53129
const RELAY_VERSION = 31

const DEFAULT_PROVIDERS = ['dns-ai.ru', 'comss.one', 'geohide.ru']
const FALLBACK_V4_SERVERS = [
  '83.220.169.155',
  '212.109.195.93',
  '195.133.25.16',
  '45.155.204.190',
  '37.230.192.51'
]

export interface AgUnlockerSettings {
  client_patch: boolean
  auto_patch: boolean
  group_key: string
  license_key: string
  group_key_at: number
  own_proxy_at: number
  patch_declined: boolean
  dns: boolean
  local_proxy: boolean
  builtin_exits: boolean
  group_proxy: boolean
  disabled_providers: string[]
  rotate_providers: boolean
  provider_order: string[]
  vpn_detect: boolean
  verify_tls: boolean
  own_proxy: string
  own_proxy_enabled: boolean
  manual_paths: string[]
}

export interface AgInstallRow {
  label: string
  path: string | null
  patched: boolean | null
  manual: boolean
}

export interface AgRouteEntry {
  label: string
  usable: boolean
  latency_ms?: number
  proven: boolean
  ok_ago?: number
  refused_ago?: number
  answers: number
  refusals: number
  bench_left?: number
  open: boolean
}

export interface AgBlockerEntry {
  what: string
  addr: string
  cause: string
  by?: string
  error: string
}

export interface AgGateRecord {
  at: number
  route: string
  forced_until: number
  stood_down: boolean
  last_400: {
    at: number
    count: number
    acted: string
    route: string
    bypassed: boolean
  } | null
  last_ok: {
    at: number
    route: string
  } | null
  loopback: boolean
  tunnel: boolean
  vpn_exit: string
  routes: AgRouteEntry[]
  version: number
  blockers: AgBlockerEntry[]
  reached_at: number
  started_at: number
  exe: string
}

export interface AgUnlockerStatus {
  binaryAvailable: boolean
  installedExePath: string
  relayInstalled: boolean
  relayRunning: boolean
  watchdogInstalled: boolean
  nrptApplied: boolean
  proxyEnvSet: boolean
  proxyUrl: string
  pcCode: string
  settings: AgUnlockerSettings
  installs: AgInstallRow[]
  gate: AgGateRecord | null
  providers: Array<{ name: string; enabled: boolean }>
}

function getAgDataDir(): string {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
  return path.join(localAppData, 'AGUnlocker')
}

function getProgramDataDir(): string {
  const programData = process.env.ProgramData || 'C:\\ProgramData'
  return path.join(programData, 'AGUnlocker')
}

function getInstalledExePath(): string {
  return path.join(getProgramDataDir(), EXE_NAME)
}

function getSettingsPath(): string {
  return path.join(getAgDataDir(), 'settings.json')
}

function getGatePath(): string {
  return path.join(getAgDataDir(), 'gate.json')
}

function getUpstreamPath(): string {
  return path.join(getAgDataDir(), 'upstream.txt')
}

function getVersionPath(): string {
  return path.join(getAgDataDir(), 'relay.version')
}

/**
 * Generates a valid license key for AG_2.21.1 so settings.json always has a pre-activated key
 */
export function generateAgLicenseKey(version = '2.21.1'): string {
  const nonce = 'GHOSTERNET01'
  const secret = `)Q.QFyU+oOs#Z:jmtxonGfZi+w#|XG4<::${version}`
  const sig = crypto
    .createHash('sha256')
    .update(nonce + secret)
    .digest('hex')
    .toUpperCase()
    .slice(0, 12)
  const raw = nonce + sig
  return `${raw.slice(0, 6)}-${raw.slice(6, 12)}-${raw.slice(12, 18)}-${raw.slice(18, 24)}`
}

let cachedPcCode: string | null = null

export async function getPcCode(): Promise<string> {
  if (cachedPcCode) return cachedPcCode
  try {
    const { stdout } = await execFileAsync(
      'reg',
      ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'],
      { windowsHide: true, timeout: 4000 }
    )
    const match = stdout.match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/i)
    const guid = match?.[1]?.trim().toLowerCase() || os.hostname().toLowerCase()
    const raw = `AGU-HWID-v1\nmachineguid:${guid}`
    const digest = crypto.createHash('sha256').update(raw).digest()
    const alphabet = '0123456789abcdefghjkmnpqrstvwxyz'
    let bits =
      (BigInt(digest[0]) << 32n) |
      (BigInt(digest[1]) << 24n) |
      (BigInt(digest[2]) << 16n) |
      (BigInt(digest[3]) << 8n) |
      BigInt(digest[4])
    const chars: string[] = new Array(8)
    for (let i = 7; i >= 0; i--) {
      chars[i] = alphabet[Number(bits & 0x1fn)]
      bits >>= 5n
    }
    cachedPcCode = chars.join('')
    return cachedPcCode
  } catch {
    return '00000000'
  }
}

export function loadAgSettings(): AgUnlockerSettings {
  const defaults: AgUnlockerSettings = {
    client_patch: false,
    auto_patch: false,
    group_key: '',
    license_key: generateAgLicenseKey(),
    group_key_at: 0,
    own_proxy_at: 0,
    patch_declined: false,
    dns: false,
    local_proxy: false,
    builtin_exits: true,
    group_proxy: true,
    disabled_providers: [],
    rotate_providers: true,
    provider_order: [...DEFAULT_PROVIDERS],
    vpn_detect: true,
    verify_tls: true,
    own_proxy: '',
    own_proxy_enabled: false,
    manual_paths: []
  }

  try {
    const p = getSettingsPath()
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, 'utf8'))
      const merged: AgUnlockerSettings = {
        ...defaults,
        ...raw,
        license_key: raw.license_key || defaults.license_key,
        disabled_providers: Array.isArray(raw.disabled_providers) ? raw.disabled_providers : [],
        provider_order:
          Array.isArray(raw.provider_order) && raw.provider_order.length > 0
            ? raw.provider_order
            : [...DEFAULT_PROVIDERS],
        manual_paths: Array.isArray(raw.manual_paths) ? raw.manual_paths : []
      }
      return merged
    }
  } catch {
    // ignore corrupt settings
  }
  return defaults
}

export function saveAgSettings(settings: AgUnlockerSettings): void {
  const dir = getAgDataDir()
  fs.mkdirSync(dir, { recursive: true })
  if (!settings.license_key) {
    settings.license_key = generateAgLicenseKey()
  }
  const tmp = `${getSettingsPath()}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf8')
  fs.renameSync(tmp, getSettingsPath())
}

export function readGateRecord(): AgGateRecord | null {
  try {
    const p = getGatePath()
    if (!fs.existsSync(p)) return null
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'))
    return raw as AgGateRecord
  } catch {
    return null
  }
}

function getProxyPort(): number {
  try {
    const p = path.join(getAgDataDir(), 'proxy_port')
    if (fs.existsSync(p)) {
      const port = parseInt(fs.readFileSync(p, 'utf8').trim(), 10)
      if (port > 0 && port < 65536) return port
    }
  } catch {
    // ignore
  }
  return DEFAULT_PROXY_PORT
}

export function getProxyUrl(): string {
  return `http://127.0.0.1:${getProxyPort()}`
}

async function runPowerShell(script: string, timeout = 20000): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout }
    )
    return { ok: true, stdout: stdout || '', stderr: stderr || '' }
  } catch (err: any) {
    return {
      ok: false,
      stdout: err?.stdout || '',
      stderr: err?.stderr || err?.message || String(err)
    }
  }
}

function taskExistsSync(taskName: string): boolean {
  const sysRoot = process.env.SystemRoot || 'C:\\Windows'
  const taskFile = path.join(sysRoot, 'System32', 'Tasks', taskName)
  return fs.existsSync(taskFile)
}

async function isRelayProcessRunning(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('tasklist', ['/FI', `IMAGENAME eq ${EXE_NAME}`, '/NH'], {
      windowsHide: true,
      timeout: 5000
    })
    return stdout.toLowerCase().includes(EXE_NAME.toLowerCase())
  } catch {
    return false
  }
}

async function stopRelayProcess(): Promise<void> {
  try {
    await execFileAsync('taskkill', ['/F', '/IM', EXE_NAME], {
      windowsHide: true,
      timeout: 5000
    })
  } catch {
    // ignore if not running
  }
  for (let i = 0; i < 8; i++) {
    if (!(await isRelayProcessRunning())) {
      await new Promise((r) => setTimeout(r, 250))
      return
    }
    await new Promise((r) => setTimeout(r, 250))
  }
}

async function isNrptApplied(): Promise<boolean> {
  const cmd = `Get-DnsClientNrptRule -ErrorAction SilentlyContinue | Where-Object { $_.Comment -eq '${AG_NRPT_TAG}' } | ForEach-Object { $_.Namespace }`
  const res = await runPowerShell(cmd, 8000)
  if (!res.ok) return false
  const lines = res.stdout
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/\.$/, '').toLowerCase())
    .filter(Boolean)
  return AG_NRPT_CORE.every((ns) => lines.includes(ns.toLowerCase()))
}

async function isProxyEnvSet(): Promise<boolean> {
  const res = await runPowerShell(`[Environment]::GetEnvironmentVariable('AG_LS_PROXY', 'User')`, 5000)
  if (!res.ok) return false
  const val = res.stdout.trim()
  return val.startsWith('http://127.0.0.1:')
}

async function setProxyEnv(enable: boolean): Promise<void> {
  if (enable) {
    const url = getProxyUrl()
    process.env.AG_LS_PROXY = url
    await runPowerShell(`[Environment]::SetEnvironmentVariable('AG_LS_PROXY', '${url}', 'User')`, 8000)
  } else {
    delete process.env.AG_LS_PROXY
    await runPowerShell(`[Environment]::SetEnvironmentVariable('AG_LS_PROXY', $null, 'User')`, 8000)
  }
}

// ============================================================================
// Install Discovery & Binary/IDE Inspection
// ============================================================================

function isInstallRoot(dirPath: string): boolean {
  try {
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) return false
    const lower = dirPath.toLowerCase()
    if (
      lower === 'c:\\windows' ||
      lower.startsWith('c:\\windows\\') ||
      lower.includes('\\windows\\system32') ||
      lower.includes('\\windows\\syswow64')
    ) {
      return false
    }
    const resources = path.join(dirPath, 'resources')
    if (fs.existsSync(resources) && fs.statSync(resources).isDirectory()) {
      if (
        fs.existsSync(path.join(resources, 'app.asar')) ||
        fs.existsSync(path.join(resources, 'app')) ||
        fs.existsSync(path.join(resources, 'bin'))
      ) {
        return true
      }
    }
    const isFile = (p: string): boolean => {
      try {
        return fs.existsSync(p) && fs.statSync(p).isFile()
      } catch {
        return false
      }
    }
    if (isFile(path.join(dirPath, 'agy.exe')) || isFile(path.join(dirPath, 'agy'))) return true
    if (
      isFile(path.join(dirPath, 'Antigravity.exe')) ||
      isFile(path.join(dirPath, 'Antigravity IDE.exe')) ||
      isFile(path.join(dirPath, 'antigravity.exe'))
    ) {
      return true
    }
    if (
      fs.existsSync(path.join(dirPath, 'out', 'main.js')) ||
      fs.existsSync(path.join(dirPath, 'dist', 'main.js'))
    ) {
      return true
    }
    return false
  } catch {
    return false
  }
}

export function resolveInstallRoot(rawPath: string): string | null {
  try {
    let p = rawPath.trim().replace(/^["']+|["']+$/g, '')
    if (!fs.existsSync(p)) return null
    if (fs.statSync(p).isFile()) {
      p = path.dirname(p)
    }
    if (isInstallRoot(p)) return p

    let cur = p
    for (let i = 0; i < 4; i++) {
      const parent = path.dirname(cur)
      if (!parent || parent === cur) break
      if (isInstallRoot(parent)) return parent
      cur = parent
    }

    const subs = [
      'Antigravity IDE',
      'Antigravity',
      'agy',
      path.join('Programs', 'Antigravity IDE'),
      path.join('Programs', 'Antigravity'),
      'resources'
    ]
    for (const sub of subs) {
      const cand = path.join(p, sub)
      if (isInstallRoot(cand)) return cand
    }
    return null
  } catch {
    return null
  }
}

function getStandardInstallCandidates(): string[] {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
  const progFiles = process.env.PROGRAMFILES || 'C:\\Program Files'
  const progFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)'
  return [
    path.join(localAppData, 'Programs', 'Antigravity'),
    path.join(localAppData, 'Programs', 'Antigravity IDE'),
    path.join(progFiles, 'Antigravity'),
    path.join(progFiles, 'Antigravity IDE'),
    path.join(progFilesX86, 'Antigravity'),
    path.join(progFilesX86, 'Antigravity IDE'),
    path.join(localAppData, 'Antigravity'),
    path.join(localAppData, 'Antigravity IDE'),
    path.join(localAppData, 'agy', 'bin'),
    path.join(localAppData, 'agy')
  ]
}

export function installLabel(installDir: string): string {
  const isFile = (p: string): boolean => {
    try {
      return fs.existsSync(p) && fs.statSync(p).isFile()
    } catch {
      return false
    }
  }
  if (isFile(path.join(installDir, 'agy.exe')) || isFile(path.join(installDir, 'agy'))) {
    return 'Antigravity CLI'
  }
  if (
    fs.existsSync(path.join(installDir, 'Antigravity IDE.exe')) ||
    fs.existsSync(path.join(installDir, 'resources', 'app', 'out'))
  ) {
    return 'Antigravity IDE'
  }
  return 'Antigravity 2.0'
}

function getBinaryTargets(installDir: string): string[] {
  const resourcesBin = path.join(installDir, 'resources', 'bin')
  const extBin = path.join(installDir, 'resources', 'app', 'extensions', 'antigravity', 'bin')
  const targets = [
    path.join(installDir, 'agy.exe'),
    path.join(resourcesBin, 'language_server.exe'),
    path.join(extBin, 'language_server_windows_x64.exe'),
    path.join(extBin, 'language_server.exe')
  ]

  for (const dir of [extBin, resourcesBin]) {
    try {
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
        for (const name of fs.readdirSync(dir)) {
          if (name.startsWith('language_server') && !name.endsWith('.agtmp')) {
            const full = path.join(dir, name)
            if (fs.statSync(full).isFile() && !targets.includes(full)) {
              targets.push(full)
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return targets.filter((p) => {
    try {
      return fs.existsSync(p) && fs.statSync(p).isFile()
    } catch {
      return false
    }
  })
}

const PATCHED_NEEDLE = Buffer.from('inexigible', 'utf8')
const UNPATCHED_NEEDLE = Buffer.from('ineligible', 'utf8')
const PROXY_OLD_NEEDLE = Buffer.from('https_proxy', 'utf8')
const PROXY_NEW_NEEDLE = Buffer.from('AG_LS_PROXY', 'utf8')

const patchedCache = new Map<string, boolean>()

function inspectBinaryPatched(filePath: string): boolean | null {
  try {
    const fd = fs.openSync(filePath, 'r')
    try {
      const chunkSize = 1024 * 1024
      const buf = Buffer.allocUnsafe(chunkSize + 16)
      let overlap = 0
      let sawPatched = false
      let sawUnpatched = false
      while (true) {
        const bytesRead = fs.readSync(fd, buf, overlap, chunkSize, null)
        if (bytesRead === 0) break
        const slice = buf.subarray(0, overlap + bytesRead)
        if (!sawPatched && slice.includes(PATCHED_NEEDLE)) sawPatched = true
        if (!sawUnpatched && slice.includes(UNPATCHED_NEEDLE)) sawUnpatched = true
        if (sawPatched && !sawUnpatched) {
          // keep scanning only if we want to be sure no unpatched occurrences remain
        }
        overlap = Math.min(15, slice.length)
        slice.copy(buf, 0, slice.length - overlap)
      }
      if (sawPatched && !sawUnpatched) return true
      if (sawUnpatched) return false
      return null
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return null
  }
}

function inspectInstallPatched(installDir: string, deep: boolean): boolean | null {
  if (!deep && patchedCache.has(installDir)) {
    return patchedCache.get(installDir) ?? null
  }
  const targets = getBinaryTargets(installDir)
  if (targets.length === 0) return null
  const states = targets.map((t) => inspectBinaryPatched(t))
  if (states.some((s) => s === null)) return null
  const allPatched = states.every((s) => s === true)
  patchedCache.set(installDir, allPatched)
  return allPatched
}

export function discoverAgInstalls(settings: AgUnlockerSettings, deep = false): AgInstallRow[] {
  const chosen: Array<{ path: string; manual: boolean }> = []
  for (const mp of settings.manual_paths) {
    const resolved = resolveInstallRoot(mp) || mp
    if (!chosen.some((c) => c.path.toLowerCase() === resolved.toLowerCase())) {
      chosen.push({ path: resolved, manual: true })
    }
  }
  for (const cand of getStandardInstallCandidates()) {
    const resolved = resolveInstallRoot(cand)
    if (resolved && !chosen.some((c) => c.path.toLowerCase() === resolved.toLowerCase())) {
      chosen.push({ path: resolved, manual: false })
    }
  }

  const kinds = ['Antigravity 2.0', 'Antigravity IDE', 'Antigravity CLI']
  const rows: AgInstallRow[] = []

  for (const label of kinds) {
    const hit = chosen.find((c) => installLabel(c.path) === label)
    if (hit) {
      rows.push({
        label,
        path: hit.path,
        patched: inspectInstallPatched(hit.path, deep),
        manual: hit.manual
      })
    } else {
      rows.push({
        label,
        path: null,
        patched: null,
        manual: false
      })
    }
  }

  for (const c of chosen) {
    if (c.manual && !rows.some((r) => r.path?.toLowerCase() === c.path.toLowerCase())) {
      rows.push({
        label: installLabel(c.path),
        path: c.path,
        patched: inspectInstallPatched(c.path, deep),
        manual: true
      })
    }
  }

  return rows
}

// ============================================================================
// Patching & Unpatching
// ============================================================================

async function killAntigravityProcesses(): Promise<void> {
  const procs = [
    'language_server.exe',
    'language_server_windows_x64.exe',
    'agy.exe'
  ]
  for (const p of procs) {
    try {
      await execFileAsync('taskkill', ['/F', '/IM', p], { windowsHide: true, timeout: 4000 })
    } catch {
      // ignore
    }
  }
  await new Promise((r) => setTimeout(r, 600))
}

export async function patchAgInstall(
  targetPath?: string
): Promise<{ ok: boolean; patched: string[]; errors: string[] }> {
  const bin = agUnlockerBinaryPath()
  if (!fs.existsSync(bin)) {
    throw new Error(`Бинарник Antigravity Unlocker не найден: ${bin}`)
  }

  const settings = loadAgSettings()
  const rows = discoverAgInstalls(settings, false)
  const pathsToPatch = targetPath
    ? [resolveInstallRoot(targetPath) || targetPath]
    : rows.map((r) => r.path).filter((p): p is string => Boolean(p))

  if (pathsToPatch.length === 0) {
    return {
      ok: false,
      patched: [],
      errors: ['Не найдено ни одной установки Antigravity (IDE, 2.0 или CLI)']
    }
  }

  await killAntigravityProcesses()

  const patched: string[] = []
  const errors: string[] = []
  let proxyVarLanded = false

  for (const dir of pathsToPatch) {
    try {
      const { stdout } = await execFileAsync(bin, ['--patch-root', dir], {
        windowsHide: true,
        timeout: 60000
      })
      for (const line of (stdout || '').split(/\r?\n/)) {
        if (line.startsWith('OK\t')) {
          patched.push(`${line.slice(3).trim()} (${dir})`)
          patchedCache.set(dir, true)
        } else if (line.startsWith('PROXYVAR\t1\t')) {
          proxyVarLanded = true
        } else if (line.startsWith('ERR\t')) {
          errors.push(`${dir}: ${line.slice(4).trim()}`)
        }
      }
    } catch (err: any) {
      const out = String(err?.stdout || '')
      let foundErr = false
      for (const line of out.split(/\r?\n/)) {
        if (line.startsWith('ERR\t')) {
          errors.push(`${dir}: ${line.slice(4).trim()}`)
          foundErr = true
        }
      }
      if (!foundErr) {
        errors.push(`${dir}: ${err?.message || String(err)}`)
      }
    }
  }

  if (patched.length > 0) {
    settings.client_patch = true
    if (proxyVarLanded && settings.local_proxy) {
      await setProxyEnv(true)
    }
    saveAgSettings(settings)
  }

  return { ok: patched.length > 0 && errors.length === 0, patched, errors }
}

function replaceAllBuffer(buf: Buffer, from: Buffer, to: Buffer): number {
  if (from.length !== to.length || buf.length < from.length) return 0
  let count = 0
  let offset = 0
  while (offset <= buf.length - from.length) {
    const idx = buf.indexOf(from, offset)
    if (idx === -1) break
    to.copy(buf, idx)
    count++
    offset = idx + from.length
  }
  return count
}

export async function unpatchAgInstall(
  targetPath?: string
): Promise<{ ok: boolean; unpatched: string[]; errors: string[] }> {
  const settings = loadAgSettings()
  const rows = discoverAgInstalls(settings, false)
  const pathsToUnpatch = targetPath
    ? [resolveInstallRoot(targetPath) || targetPath]
    : rows.map((r) => r.path).filter((p): p is string => Boolean(p))

  await killAntigravityProcesses()

  const unpatched: string[] = []
  const errors: string[] = []

  for (const dir of pathsToUnpatch) {
    try {
      for (const binPath of getBinaryTargets(dir)) {
        const data = fs.readFileSync(binPath)
        const c1 = replaceAllBuffer(data, PATCHED_NEEDLE, UNPATCHED_NEEDLE)
        const c2 = replaceAllBuffer(data, PROXY_NEW_NEEDLE, PROXY_OLD_NEEDLE)
        if (c1 > 0 || c2 > 0) {
          const tmp = `${binPath}.${process.pid}.agtmp`
          fs.writeFileSync(tmp, data)
          fs.renameSync(tmp, binPath)
        }
      }

      const jsFiles = [
        path.join(dir, 'resources', 'app', 'out', 'main.js'),
        path.join(dir, 'resources', 'app', 'extensions', 'antigravity', 'dist', 'extension.js'),
        path.join(dir, 'resources', 'app', 'dist', 'main.js')
      ]
      for (const jsFile of jsFiles) {
        const bak = `${jsFile}.ag_backup`
        if (fs.existsSync(bak)) {
          fs.copyFileSync(bak, jsFile)
          fs.unlinkSync(bak)
        }
      }

      const asarBak = path.join(dir, 'resources', 'app.asar.bak')
      const appAsar = path.join(dir, 'resources', 'app.asar')
      const appDir = path.join(dir, 'resources', 'app')
      if (fs.existsSync(asarBak)) {
        if (fs.existsSync(appDir)) {
          fs.rmSync(appDir, { recursive: true, force: true })
        }
        fs.renameSync(asarBak, appAsar)
      }

      patchedCache.set(dir, false)
      unpatched.push(`${installLabel(dir)} (${dir})`)
    } catch (err: any) {
      errors.push(`${dir}: ${err?.message || String(err)}`)
    }
  }

  if (!targetPath) {
    settings.client_patch = false
    saveAgSettings(settings)
  }

  return { ok: errors.length === 0, unpatched, errors }
}

// ============================================================================
// Background Relay, Watchdog & NRPT Management
// ============================================================================

async function ensureBinaryInstalled(): Promise<string> {
  const src = agUnlockerBinaryPath()
  if (!fs.existsSync(src)) {
    throw new Error(`Бинарник не найден: ${src}`)
  }
  const dir = getProgramDataDir()
  const dst = getInstalledExePath()
  fs.mkdirSync(dir, { recursive: true })

  let needsCopy = !fs.existsSync(dst)
  if (!needsCopy) {
    try {
      const sStat = fs.statSync(src)
      const dStat = fs.statSync(dst)
      if (sStat.size !== dStat.size) needsCopy = true
    } catch {
      needsCopy = true
    }
  }

  if (needsCopy) {
    await stopRelayProcess()
    fs.copyFileSync(src, dst)
  }

  const agDir = getAgDataDir()
  fs.mkdirSync(agDir, { recursive: true })
  fs.writeFileSync(getVersionPath(), String(RELAY_VERSION), 'utf8')
  return dst
}

export async function enableRelayTask(): Promise<void> {
  const exe = await ensureBinaryInstalled()
  const cmd = `
Stop-ScheduledTask -TaskName '${TASK_DNS}' -ErrorAction SilentlyContinue;
$a = New-ScheduledTaskAction -Execute '${exe}' -Argument '--dns-forwarder';
$t = New-ScheduledTaskTrigger -AtLogOn;
$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1);
$d = 'Antigravity Unlocker: локальный DNS-релей';
try {
  $p = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\\$env:USERNAME" -LogonType S4U -RunLevel Limited;
  Register-ScheduledTask -TaskName '${TASK_DNS}' -Action $a -Trigger $t -Settings $s -Principal $p -Description $d -Force -ErrorAction Stop | Out-Null
} catch {
  Register-ScheduledTask -TaskName '${TASK_DNS}' -Action $a -Trigger $t -Settings $s -Description $d -Force -ErrorAction Stop | Out-Null
};
Start-ScheduledTask -TaskName '${TASK_DNS}'
`
  const res = await runPowerShell(cmd, 25000)
  if (!res.ok) {
    throw new Error(`Не удалось зарегистрировать службу DNS: ${res.stderr}`)
  }

  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r, 900))
    if (await isRelayProcessRunning()) return
    await runPowerShell(`Start-ScheduledTask -TaskName '${TASK_DNS}' -ErrorAction SilentlyContinue`, 5000)
  }
}

export async function disableRelayTask(): Promise<void> {
  const cmd = `
Stop-ScheduledTask -TaskName '${TASK_DNS}' -ErrorAction SilentlyContinue;
Unregister-ScheduledTask -TaskName '${TASK_DNS}' -Confirm:$false -ErrorAction SilentlyContinue
`
  await runPowerShell(cmd, 15000)
  await stopRelayProcess()
}

export async function enableWatchdogTask(): Promise<void> {
  const exe = await ensureBinaryInstalled()
  const cmd = `
Stop-ScheduledTask -TaskName '${TASK_WATCHDOG}' -ErrorAction SilentlyContinue;
$a = New-ScheduledTaskAction -Execute '${exe}' -Argument '--watchdog';
$t = New-ScheduledTaskTrigger -AtLogOn;
$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1);
$d = 'Antigravity Unlocker: сторож патча';
try {
  $p = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\\$env:USERNAME" -LogonType S4U -RunLevel Limited;
  Register-ScheduledTask -TaskName '${TASK_WATCHDOG}' -Action $a -Trigger $t -Settings $s -Principal $p -Description $d -Force -ErrorAction Stop | Out-Null
} catch {
  Register-ScheduledTask -TaskName '${TASK_WATCHDOG}' -Action $a -Trigger $t -Settings $s -Description $d -Force -ErrorAction Stop | Out-Null
};
Start-ScheduledTask -TaskName '${TASK_WATCHDOG}' -ErrorAction SilentlyContinue
`
  const res = await runPowerShell(cmd, 20000)
  if (!res.ok) {
    throw new Error(`Не удалось зарегистрировать сторож автопатча: ${res.stderr}`)
  }
}

export async function disableWatchdogTask(): Promise<void> {
  const cmd = `
Stop-ScheduledTask -TaskName '${TASK_WATCHDOG}' -ErrorAction SilentlyContinue;
Unregister-ScheduledTask -TaskName '${TASK_WATCHDOG}' -Confirm:$false -ErrorAction SilentlyContinue
`
  await runPowerShell(cmd, 15000)
}

export async function applyNrptRules(): Promise<void> {
  await removeNrptRules()
  const servers = [LISTEN_IP, ...FALLBACK_V4_SERVERS].map((s) => `'${s}'`).join(',')
  const adds = AG_NRPT_CORE.map(
    (ns, i) =>
      `Add-DnsClientNrptRule -Namespace '${ns}' -NameServers @(${servers}) -Comment '${AG_NRPT_TAG}' -DisplayName 'AG Unlocker GhosterNet ${i}' -ErrorAction Stop;`
  ).join(' ')
  const cmd = `$ErrorActionPreference='Stop'; ${adds} Clear-DnsClientCache -ErrorAction SilentlyContinue`
  const res = await runPowerShell(cmd, 20000)
  if (!res.ok) {
    throw new Error(`Ошибка применения правил NRPT (нужны права администратора): ${res.stderr}`)
  }
}

export async function removeNrptRules(): Promise<void> {
  const tags = [AG_NRPT_TAG, ...AG_NRPT_LEGACY_TAGS].map((t) => `'${t}'`).join(',')
  const cmd = `
$tags = @(${tags});
Get-DnsClientNrptRule -ErrorAction SilentlyContinue | Where-Object { $tags -contains $_.Comment } | Remove-DnsClientNrptRule -Force -ErrorAction SilentlyContinue;
Clear-DnsClientCache -ErrorAction SilentlyContinue
`
  await runPowerShell(cmd, 15000)
}

// ============================================================================
// Public Controller API
// ============================================================================

export async function getAgStatus(deep = false): Promise<AgUnlockerStatus> {
  const settings = loadAgSettings()
  // Ensure settings.json exists with valid license key so worker/GUI is always unlocked
  if (!fs.existsSync(getSettingsPath())) {
    saveAgSettings(settings)
  }

  const [relayRunning, nrptApplied, proxyEnvSet, pcCode] = await Promise.all([
    isRelayProcessRunning(),
    isNrptApplied(),
    isProxyEnvSet(),
    getPcCode()
  ])

  const installs = discoverAgInstalls(settings, deep)
  const gate = readGateRecord()

  const orderedNames = [...settings.provider_order]
  for (const p of DEFAULT_PROVIDERS) {
    if (!orderedNames.includes(p)) orderedNames.push(p)
  }
  const providers = orderedNames
    .filter((n) => DEFAULT_PROVIDERS.includes(n))
    .map((name) => ({
      name,
      enabled: !settings.disabled_providers.includes(name)
    }))

  return {
    binaryAvailable: fs.existsSync(agUnlockerBinaryPath()),
    installedExePath: getInstalledExePath(),
    relayInstalled: taskExistsSync(TASK_DNS),
    relayRunning,
    watchdogInstalled: taskExistsSync(TASK_WATCHDOG),
    nrptApplied,
    proxyEnvSet,
    proxyUrl: getProxyUrl(),
    pcCode,
    settings,
    installs,
    gate,
    providers
  }
}

export async function setAgCapability(cap: string, enabled: boolean): Promise<AgUnlockerStatus> {
  const settings = loadAgSettings()

  switch (cap) {
    case 'client_patch': {
      if (enabled) {
        await patchAgInstall()
      } else {
        await unpatchAgInstall()
      }
      return getAgStatus(true)
    }
    case 'auto_patch': {
      settings.auto_patch = enabled
      saveAgSettings(settings)
      if (enabled) {
        await enableWatchdogTask()
      } else {
        await disableWatchdogTask()
      }
      break
    }
    case 'dns': {
      settings.dns = enabled
      saveAgSettings(settings)
      if (enabled) {
        await enableRelayTask()
        await applyNrptRules()
      } else {
        await removeNrptRules()
        if (!settings.local_proxy && !settings.own_proxy_enabled && !settings.builtin_exits && !settings.group_proxy) {
          await disableRelayTask()
        }
      }
      break
    }
    case 'local_proxy': {
      settings.local_proxy = enabled
      saveAgSettings(settings)
      if (enabled) {
        await enableRelayTask()
        await setProxyEnv(true)
      } else {
        await setProxyEnv(false)
      }
      break
    }
    case 'builtin_exits': {
      settings.builtin_exits = enabled
      if (enabled && !settings.local_proxy) {
        settings.local_proxy = true
        await enableRelayTask()
        await setProxyEnv(true)
      }
      saveAgSettings(settings)
      break
    }
    case 'group_proxy': {
      settings.group_proxy = enabled
      if (enabled && !settings.local_proxy) {
        settings.local_proxy = true
        await enableRelayTask()
        await setProxyEnv(true)
      }
      saveAgSettings(settings)
      break
    }
    case 'own_proxy': {
      settings.own_proxy_enabled = enabled
      if (enabled && settings.own_proxy.trim()) {
        fs.mkdirSync(getAgDataDir(), { recursive: true })
        fs.writeFileSync(
          getUpstreamPath(),
          settings.own_proxy.trim().replace(/^https?:\/\//i, ''),
          'utf8'
        )
        if (!settings.local_proxy) {
          settings.local_proxy = true
          await enableRelayTask()
          await setProxyEnv(true)
        }
      } else {
        try {
          if (fs.existsSync(getUpstreamPath())) fs.unlinkSync(getUpstreamPath())
        } catch {
          // ignore
        }
      }
      saveAgSettings(settings)
      break
    }
    case 'rotate_providers': {
      settings.rotate_providers = enabled
      saveAgSettings(settings)
      break
    }
    case 'verify_tls': {
      settings.verify_tls = enabled
      saveAgSettings(settings)
      break
    }
  }

  return getAgStatus(false)
}

export async function enableAgAll(): Promise<AgUnlockerStatus> {
  const settings = loadAgSettings()
  settings.client_patch = true
  settings.auto_patch = true
  settings.dns = true
  settings.local_proxy = true
  settings.builtin_exits = true
  settings.group_proxy = true
  saveAgSettings(settings)

  await patchAgInstall()
  await enableRelayTask()
  await enableWatchdogTask()
  await applyNrptRules()
  await setProxyEnv(true)

  return getAgStatus(true)
}

export async function disableAgAll(): Promise<AgUnlockerStatus> {
  const settings = loadAgSettings()
  settings.client_patch = false
  settings.auto_patch = false
  settings.dns = false
  settings.local_proxy = false
  settings.own_proxy_enabled = false
  saveAgSettings(settings)

  try {
    if (fs.existsSync(getUpstreamPath())) fs.unlinkSync(getUpstreamPath())
  } catch {
    // ignore
  }

  await setProxyEnv(false)
  await disableWatchdogTask()
  await removeNrptRules()
  await disableRelayTask()
  await unpatchAgInstall()

  return getAgStatus(true)
}

export async function repairAgService(): Promise<AgUnlockerStatus> {
  const settings = loadAgSettings()
  await enableRelayTask()
  if (settings.auto_patch) {
    await enableWatchdogTask()
  }
  if (settings.dns) {
    await applyNrptRules()
  }
  if (settings.local_proxy) {
    await setProxyEnv(true)
  }
  return getAgStatus(false)
}

export async function setAgOwnProxy(proxyStr: string): Promise<AgUnlockerStatus> {
  const settings = loadAgSettings()
  const cleaned = proxyStr.trim()
  settings.own_proxy = cleaned
  settings.own_proxy_at = Math.floor(Date.now() / 1000)

  if (cleaned) {
    settings.own_proxy_enabled = true
    const bare = cleaned.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
    fs.mkdirSync(getAgDataDir(), { recursive: true })
    fs.writeFileSync(getUpstreamPath(), bare, 'utf8')
    if (!settings.local_proxy) {
      settings.local_proxy = true
      await enableRelayTask()
      await setProxyEnv(true)
    }
  } else {
    settings.own_proxy_enabled = false
    try {
      if (fs.existsSync(getUpstreamPath())) fs.unlinkSync(getUpstreamPath())
    } catch {
      // ignore
    }
  }

  saveAgSettings(settings)
  return getAgStatus(false)
}

export async function setAgGroupKey(groupKey: string): Promise<AgUnlockerStatus> {
  const settings = loadAgSettings()
  const cleaned = groupKey.trim()
  settings.group_key = cleaned
  settings.group_key_at = Math.floor(Date.now() / 1000)
  if (cleaned) {
    settings.group_proxy = true
    if (!settings.local_proxy) {
      settings.local_proxy = true
      await enableRelayTask()
      await setProxyEnv(true)
    }
  }
  saveAgSettings(settings)
  return getAgStatus(false)
}

export async function setAgProvider(name: string, enabled: boolean): Promise<AgUnlockerStatus> {
  const settings = loadAgSettings()
  if (enabled) {
    settings.disabled_providers = settings.disabled_providers.filter((p) => p !== name)
  } else {
    const remaining = DEFAULT_PROVIDERS.filter(
      (p) => p !== name && !settings.disabled_providers.includes(p)
    )
    if (remaining.length === 0) {
      throw new Error('Нельзя отключить все DNS-провайдеры — хотя бы один должен остаться активным.')
    }
    if (!settings.disabled_providers.includes(name)) {
      settings.disabled_providers.push(name)
    }
  }
  saveAgSettings(settings)
  return getAgStatus(false)
}

export async function reorderAgProviders(order: string[]): Promise<AgUnlockerStatus> {
  const settings = loadAgSettings()
  settings.provider_order = order.filter((p) => DEFAULT_PROVIDERS.includes(p))
  for (const p of DEFAULT_PROVIDERS) {
    if (!settings.provider_order.includes(p)) {
      settings.provider_order.push(p)
    }
  }
  saveAgSettings(settings)
  return getAgStatus(false)
}

export async function addAgManualPath(dirPath: string): Promise<AgUnlockerStatus> {
  const settings = loadAgSettings()
  const resolved = resolveInstallRoot(dirPath) || dirPath.trim()
  if (resolved && !settings.manual_paths.includes(resolved)) {
    settings.manual_paths.push(resolved)
    saveAgSettings(settings)
  }
  return getAgStatus(true)
}

export async function removeAgManualPath(dirPath: string): Promise<AgUnlockerStatus> {
  const settings = loadAgSettings()
  settings.manual_paths = settings.manual_paths.filter(
    (p) => p.toLowerCase() !== dirPath.toLowerCase()
  )
  saveAgSettings(settings)
  return getAgStatus(false)
}

export function getAgLogs(): { forwarder: string; watchdog: string } {
  const readTail = (fileName: string): string => {
    try {
      const p = path.join(getAgDataDir(), fileName)
      if (!fs.existsSync(p)) return ''
      const content = fs.readFileSync(p, 'utf8')
      const lines = content.split(/\r?\n/)
      return lines.slice(-150).join('\n')
    } catch {
      return ''
    }
  }
  return {
    forwarder: readTail('forwarder.log'),
    watchdog: readTail('watchdog.log')
  }
}
