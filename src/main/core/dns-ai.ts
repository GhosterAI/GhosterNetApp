import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { Worker } from 'node:worker_threads'
import { dnsAiBinaryPath, dnsAiEndpointsPath, dnsAiRuntimeDir, resourcesDir } from '../utils/dirs'
import { appLog } from '../utils/app-logger'

function emitLog(type: 'info' | 'warn' | 'error', _src: string, msg: string): void {
  appLog(type, `[DNS-AI] ${msg}`)
}

const execFileAsync = promisify(execFile)

const PIPE_PATH = '\\\\.\\pipe\\dns-ai-svc'
const SERVICE_NAME = 'DnsAiClient'

export type DnsAiMode = 'stub' | 'native'

export interface DnsAiSettings {
  enabled: boolean
  mode: DnsAiMode
  ipv6: boolean
  include_vpn_adapters: boolean
  autostart_tray: boolean
  service_autostart: boolean
}

export interface DnsAiAdapterView {
  alias: string
  index: number
  current_v4: string
  current_v6: string
}

export interface DnsAiPipeStatus {
  enabled: boolean
  stub_running: boolean
  adapters: DnsAiAdapterView[]
  settings: DnsAiSettings
  native_supported: boolean
  service_autostart: boolean
  service_version: string
}

export interface DnsAiStatusSnapshot {
  available: boolean
  binaryPath: string
  daemonRunning: boolean
  serviceInstalled: boolean
  serviceRunning: boolean
  enabled: boolean
  stubRunning: boolean
  nativeSupported: boolean
  serviceVersion: string
  settings: DnsAiSettings
  adapters: DnsAiAdapterView[]
  endpoints: {
    dohUrl: string
    dotHost: string
    ipv4: string[]
    ipv6: string[]
  }
}

export interface DnsAiDohTestResult {
  ok: boolean
  output: string
  latencyMs: number
}

let consoleDaemon: ChildProcess | null = null
let cachedSettings: Partial<DnsAiSettings> = {}
let pipeQueue: Promise<unknown> = Promise.resolve()

function defaultSettings(): DnsAiSettings {
  const buildNumber = Number(os.release().split('.')[2] || '0')
  const isWin11 = process.platform === 'win32' && buildNumber >= 22000
  return {
    enabled: false,
    mode: isWin11 ? 'native' : 'stub',
    ipv6: true,
    include_vpn_adapters: false,
    autostart_tray: false,
    service_autostart: true
  }
}

function getDnsAiDataDir(): string {
  const binDir = path.dirname(dnsAiBinaryPath())
  const progFiles = (process.env.ProgramFiles || 'C:\\Program Files').toLowerCase()
  const progFilesX86 = (process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)').toLowerCase()
  const computerName = process.env.COMPUTERNAME || os.hostname() || 'DEFAULT'
  if (
    !binDir.toLowerCase().startsWith(progFiles) &&
    !binDir.toLowerCase().startsWith(progFilesX86)
  ) {
    const portableDir = path.join(binDir, 'config', computerName)
    try {
      mkdirSync(portableDir, { recursive: true })
      return portableDir
    } catch {
      // fall through to ProgramData
    }
  }
  const sharedDir = path.join(process.env.ProgramData || 'C:\\ProgramData', 'DNS-AI')
  try {
    mkdirSync(sharedDir, { recursive: true })
  } catch {
    // ignore
  }
  return sharedDir
}

function loadDiskSettings(): DnsAiSettings {
  const def = defaultSettings()
  let base: DnsAiSettings = def
  try {
    const p = path.join(getDnsAiDataDir(), 'settings.json')
    if (existsSync(p)) {
      const parsed = JSON.parse(readFileSync(p, 'utf8'))
      base = {
        enabled: Boolean(parsed.enabled ?? def.enabled),
        mode: parsed.mode === 'native' ? 'native' : 'stub',
        ipv6: Boolean(parsed.ipv6 ?? def.ipv6),
        include_vpn_adapters: Boolean(parsed.include_vpn_adapters ?? def.include_vpn_adapters),
        autostart_tray: Boolean(parsed.autostart_tray ?? false),
        service_autostart: Boolean(parsed.service_autostart ?? def.service_autostart)
      }
    }
  } catch {
    // ignore
  }
  return {
    ...base,
    ...cachedSettings
  }
}

function saveDiskSettings(settings: DnsAiSettings): void {
  try {
    const dir = getDnsAiDataDir()
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(settings, null, 2), 'utf8')
  } catch {
    // ignore (e.g. ProgramData ACL owned by SYSTEM/Administrators)
  }
}

function syncEndpointsIfOutdated(): void {
  try {
    const bundled = path.join(resourcesDir(), 'dns-ai', 'endpoints.json')
    if (!existsSync(bundled)) return
    const bundledParsed = JSON.parse(readFileSync(bundled, 'utf8'))
    const bundledSerial = Number(bundledParsed.serial || 0)

    const syncTarget = (dest: string): void => {
      try {
        if (!existsSync(dest)) {
          mkdirSync(path.dirname(dest), { recursive: true })
          copyFileSync(bundled, dest)
          return
        }
        const existing = JSON.parse(readFileSync(dest, 'utf8'))
        // Do not overwrite dynamic resolver results unless serial is explicitly lower
        if (existing.source === 'resolver') {
          return
        }
        const existingSerial = Number(existing.serial || 0)
        if (existingSerial < bundledSerial) {
          copyFileSync(bundled, dest)
        }
      } catch {
        // ignore
      }
    }

    syncTarget(path.join(dnsAiRuntimeDir(), 'endpoints.json'))
    syncTarget(path.join(getDnsAiDataDir(), 'endpoints.json'))
  } catch {
    // ignore
  }
}

function readEndpoints(): { dohUrl: string; dotHost: string; ipv4: string[]; ipv6: string[] } {
  syncEndpointsIfOutdated()
  const defaultV4 = ['194.87.196.13', '45.151.102.219']
  const defaultV6 = ['2a00:b700:5::3:62', '2a12:5940:d4ef::219']
  try {
    const dataEndpoints = path.join(getDnsAiDataDir(), 'endpoints.json')
    const bundledEndpoints = dnsAiEndpointsPath()
    const target = existsSync(dataEndpoints)
      ? dataEndpoints
      : existsSync(bundledEndpoints)
        ? bundledEndpoints
        : null
    if (target) {
      const parsed = JSON.parse(readFileSync(target, 'utf8'))
      const v4 = Array.isArray(parsed.v4) && parsed.v4.length > 0 ? parsed.v4.map(String) : defaultV4
      const v6 = Array.isArray(parsed.v6) && parsed.v6.length > 0 ? parsed.v6.map(String) : defaultV6
      return {
        dohUrl: 'https://dns.dns-ai.ru/dns-query',
        dotHost: 'dns.dns-ai.ru',
        ipv4: v4,
        ipv6: v6
      }
    }
  } catch {
    // ignore
  }
  return {
    dohUrl: 'https://dns.dns-ai.ru/dns-query',
    dotHost: 'dns.dns-ai.ru',
    ipv4: defaultV4,
    ipv6: defaultV6
  }
}

async function queryServiceState(): Promise<{ installed: boolean; running: boolean }> {
  if (process.platform !== 'win32') return { installed: false, running: false }
  try {
    const { stdout } = await execFileAsync('sc.exe', ['query', SERVICE_NAME], {
      windowsHide: true,
      timeout: 4000
    })
    const installed = !stdout.includes('1060')
    const running = /STATE\s*:\s*4\s+RUNNING/i.test(stdout)
    return { installed, running }
  } catch {
    return { installed: false, running: false }
  }
}

interface PipeReply {
  ok: boolean
  error?: string | null
  status?: DnsAiPipeStatus | null
}

/**
 * DNS-AI's Rust named-pipe server (`client/src/pipe.rs`) writes the single-line JSON reply
 * and immediately calls `server.disconnect()` (`DisconnectNamedPipe`).
 *
 * Node's `net.createConnection` (libuv overlapped pipe) uses a 0-byte `ReadFile` readiness probe:
 * when the server writes and immediately calls `DisconnectNamedPipe`, `DisconnectNamedPipe`
 * discards the unread kernel pipe buffer before libuv's event loop issues the real `ReadFile`,
 * causing `Error: read EPIPE`.
 *
 * Opening the pipe via synchronous `fs.openSync` + `fs.writeSync` + `fs.readSync` inside a
 * worker thread issues a real 64 KB `ReadFile` immediately after `WriteFile` (matching DNS-AI's
 * own `client/src/ipc_client.rs`), completely avoiding `read EPIPE`.
 */
const PIPE_WORKER_SCRIPT = [
  "const { parentPort, workerData } = require('worker_threads');",
  "const fs = require('fs');",
  "function sleep(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }",
  "try {",
  "  let fd = null, lastErr = null;",
  "  for (let i = 0; i < 20; i++) {",
  "    try {",
  "      fd = fs.openSync(workerData.pipePath, 'r+');",
  "      break;",
  "    } catch (e) {",
  "      lastErr = e;",
  "      if (e && (e.errno === -4082 || e.code === 'EBUSY' || String(e.message).includes('busy'))) {",
  "        sleep(50);",
  "        continue;",
  "      }",
  "      throw e;",
  "    }",
  "  }",
  "  if (fd === null) throw lastErr || new Error('Служба DNS-AI занята (pipe busy)');",
  "  try {",
  "    const req = Buffer.from(JSON.stringify(workerData.payload) + '\\n', 'utf8');",
  "    fs.writeSync(fd, req);",
  "    const buf = Buffer.alloc(65536);",
  "    let out = '';",
  "    while (true) {",
  "      let n = 0;",
  "      try {",
  "        n = fs.readSync(fd, buf, 0, buf.length, null);",
  "      } catch (re) {",
  "        if (out.includes('\\n') || out.trim().startsWith('{')) break;",
  "        throw re;",
  "      }",
  "      if (n <= 0) break;",
  "      out += buf.slice(0, n).toString('utf8');",
  "      if (out.includes('\\n')) break;",
  "    }",
  "    parentPort.postMessage({ ok: true, data: out.trim() });",
  "  } finally {",
  "    try { fs.closeSync(fd); } catch {}",
  "  }",
  "} catch (err) {",
  "  parentPort.postMessage({",
  "    ok: false,",
  "    error: err && err.message ? err.message : String(err),",
  "    code: err && err.code ? err.code : undefined",
  "  });",
  "}"
].join('\n')

function sendPipeRequestRaw(payload: Record<string, unknown>, timeoutMs = 6000): Promise<PipeReply> {
  return new Promise((resolve, reject) => {
    let settled = false
    const worker = new Worker(PIPE_WORKER_SCRIPT, {
      eval: true,
      workerData: { pipePath: PIPE_PATH, payload }
    })

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      void worker.terminate()
      reject(new Error('Тайм-аут обращения к службе DNS-AI (pipe)'))
    }, timeoutMs)

    worker.on('message', (msg: { ok: boolean; data?: string; error?: string; code?: string }) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (msg.ok && msg.data) {
        const line = msg.data.split('\n')[0].trim()
        try {
          resolve(JSON.parse(line) as PipeReply)
        } catch (err) {
          reject(err)
        }
      } else {
        const err = new Error(msg.error || 'Соединение с pipe службы DNS-AI закрыто без ответа') as Error & {
          code?: string
        }
        err.code = msg.code
        reject(err)
      }
    })

    worker.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })

    worker.on('exit', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new Error(`Поток запроса к DNS-AI завершился с кодом ${code}`))
    })
  })
}

function sendPipeRequest(payload: Record<string, unknown>, timeoutMs = 6000): Promise<PipeReply> {
  const next = pipeQueue.then(
    () => sendPipeRequestRaw(payload, timeoutMs),
    () => sendPipeRequestRaw(payload, timeoutMs)
  )
  pipeQueue = next.then(
    () => undefined,
    () => undefined
  )
  return next
}

async function buildSnapshotFromPipeStatus(st: DnsAiPipeStatus): Promise<DnsAiStatusSnapshot> {
  const bin = dnsAiBinaryPath()
  const svc = await queryServiceState()
  const endpoints = readEndpoints()
  const buildNumber = Number(os.release().split('.')[2] || '0')
  const win11Native = process.platform === 'win32' && buildNumber >= 22000
  cachedSettings = {
    mode: st.settings.mode,
    ipv6: st.settings.ipv6,
    include_vpn_adapters: st.settings.include_vpn_adapters,
    autostart_tray: st.settings.autostart_tray,
    service_autostart: st.settings.service_autostart
  }
  return {
    available: existsSync(bin),
    binaryPath: bin,
    daemonRunning: true,
    serviceInstalled: svc.installed,
    serviceRunning: svc.running,
    enabled: st.enabled,
    stubRunning: st.stub_running,
    nativeSupported: st.native_supported ?? win11Native,
    serviceVersion: st.service_version || '1.0.0',
    settings: st.settings,
    adapters: st.adapters || [],
    endpoints
  }
}

async function ensureDaemonReady(): Promise<DnsAiPipeStatus | null> {
  try {
    const ping = await sendPipeRequest({ cmd: 'status' }, 2000)
    if (ping.ok && ping.status) return ping.status
  } catch {
    // Not running yet; start service or console daemon
  }

  const bin = dnsAiBinaryPath()
  if (!existsSync(bin)) {
    throw new Error(`Бинарник DNS-AI не найден: ${bin}`)
  }

  const svc = await queryServiceState()
  if (svc.installed && !svc.running) {
    try {
      await execFileAsync(bin, ['start'], { windowsHide: true, timeout: 10000 })
    } catch {
      // fall back to install or run-console
    }
  } else if (!svc.installed) {
    try {
      await execFileAsync(bin, ['install'], { windowsHide: true, timeout: 12000 })
      emitLog('info', 'dns', 'Служба Windows DnsAiClient успешно установлена и запущена')
    } catch {
      // Fallback: spawn console daemon
      if (!consoleDaemon || consoleDaemon.killed) {
        consoleDaemon = spawn(bin, ['run-console'], {
          cwd: path.dirname(bin),
          windowsHide: true,
          stdio: 'ignore',
          detached: false
        })
        consoleDaemon.on('exit', () => {
          consoleDaemon = null
        })
        emitLog('info', 'dns', 'Запущен фоновый процесс DNS-AI (run-console)')
      }
    }
  }

  // Wait up to 5 seconds for pipe to accept connections
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 250))
    try {
      const check = await sendPipeRequest({ cmd: 'status' }, 2000)
      if (check.ok && check.status) return check.status
    } catch {
      // retry
    }
  }
  return null
}

export async function getDnsAiStatus(): Promise<DnsAiStatusSnapshot> {
  const bin = dnsAiBinaryPath()
  const available = existsSync(bin)
  const svc = await queryServiceState()
  const endpoints = readEndpoints()
  const buildNumber = Number(os.release().split('.')[2] || '0')
  const win11Native = process.platform === 'win32' && buildNumber >= 22000

  if (available) {
    try {
      const reply = await sendPipeRequest({ cmd: 'status' }, 2500)
      if (reply.ok && reply.status) {
        return buildSnapshotFromPipeStatus(reply.status)
      }
    } catch {
      // Pipe not currently active
    }
  }

  const diskSettings = loadDiskSettings()
  return {
    available,
    binaryPath: bin,
    daemonRunning: false,
    serviceInstalled: svc.installed,
    serviceRunning: svc.running,
    enabled: false,
    stubRunning: false,
    nativeSupported: win11Native,
    serviceVersion: '1.0.0',
    settings: diskSettings,
    adapters: [],
    endpoints
  }
}

async function syncCachedSettingsToDaemon(
  currentStatus: DnsAiPipeStatus | null
): Promise<DnsAiPipeStatus | null> {
  if (!currentStatus || Object.keys(cachedSettings).length === 0) {
    return currentStatus
  }
  const s = currentStatus.settings
  const desired: DnsAiSettings = {
    ...s,
    ...cachedSettings
  }
  if (
    desired.mode !== s.mode ||
    desired.ipv6 !== s.ipv6 ||
    desired.include_vpn_adapters !== s.include_vpn_adapters
  ) {
    const setReply = await sendPipeRequest({ cmd: 'set_settings', settings: desired }, 15000)
    if (!setReply.ok) {
      throw new Error(setReply.error || 'Не удалось применить настройки DNS-AI')
    }
    if (setReply.status) {
      return setReply.status
    }
  }
  return currentStatus
}

export async function enableDnsAi(): Promise<DnsAiStatusSnapshot> {
  const readyStatus = await ensureDaemonReady()
  const currentStatus = await syncCachedSettingsToDaemon(readyStatus)

  if (currentStatus?.enabled) {
    emitLog(
      'info',
      'dns',
      `Шифрованный DNS-AI включён (режим: ${currentStatus.settings.mode === 'native' ? 'Native DoH' : 'Stub 127.0.0.1:53'})`
    )
    return buildSnapshotFromPipeStatus(currentStatus)
  }

  const reply = await sendPipeRequest({ cmd: 'enable' }, 15000)
  if (!reply.ok) {
    throw new Error(reply.error || 'Не удалось включить защиту DNS-AI')
  }
  const activeMode = reply.status?.settings?.mode ?? 'stub'
  emitLog(
    'info',
    'dns',
    `Шифрованный DNS-AI включён (режим: ${activeMode === 'native' ? 'Native DoH' : 'Stub 127.0.0.1:53'})`
  )
  try {
    await execFileAsync('ipconfig.exe', ['/flushdns'], { windowsHide: true, timeout: 4000 })
  } catch {
    // ignore
  }
  if (reply.status) {
    return buildSnapshotFromPipeStatus(reply.status)
  }
  return getDnsAiStatus()
}

export async function disableDnsAi(): Promise<DnsAiStatusSnapshot> {
  try {
    const reply = await sendPipeRequest({ cmd: 'disable' }, 12000)
    if (!reply.ok && reply.error) {
      throw new Error(reply.error)
    }
    emitLog('info', 'dns', 'Шифрованный DNS-AI отключён, настройки адаптеров восстановлены')
    if (reply.status) {
      return buildSnapshotFromPipeStatus(reply.status)
    }
  } catch (e) {
    const cur = loadDiskSettings()
    cur.enabled = false
    cachedSettings.enabled = false
    saveDiskSettings(cur)
    emitLog('warn', 'dns', `Отключение DNS-AI: ${e instanceof Error ? e.message : String(e)}`)
  } finally {
    try {
      await execFileAsync('ipconfig.exe', ['/flushdns'], { windowsHide: true, timeout: 4000 })
    } catch {
      // ignore
    }
  }
  return getDnsAiStatus()
}

export async function setDnsAiSettings(partial: Partial<DnsAiSettings>): Promise<DnsAiStatusSnapshot> {
  const statusSnap = await getDnsAiStatus()
  const next: DnsAiSettings = {
    ...statusSnap.settings,
    ...partial
  }
  cachedSettings = {
    ...cachedSettings,
    ...partial
  }
  saveDiskSettings(next)

  if (statusSnap.daemonRunning) {
    const reply = await sendPipeRequest({ cmd: 'set_settings', settings: next }, 15000)
    if (!reply.ok && reply.error) {
      throw new Error(reply.error)
    }
    emitLog(
      'info',
      'dns',
      `Обновлены настройки DNS-AI (mode=${next.mode}, ipv6=${next.ipv6}, vpn=${next.include_vpn_adapters})`
    )
    if (reply.status) {
      return buildSnapshotFromPipeStatus(reply.status)
    }
  } else {
    emitLog(
      'info',
      'dns',
      `Сохранены настройки DNS-AI (mode=${next.mode}, ipv6=${next.ipv6}, vpn=${next.include_vpn_adapters})`
    )
    return {
      ...statusSnap,
      settings: next
    }
  }
  return getDnsAiStatus()
}

export async function installDnsAiService(): Promise<DnsAiStatusSnapshot> {
  const bin = dnsAiBinaryPath()
  if (!existsSync(bin)) {
    throw new Error(`Бинарник DNS-AI не найден: ${bin}`)
  }
  await execFileAsync(bin, ['install'], { windowsHide: true, timeout: 15000 })
  emitLog('info', 'dns', 'Служба DnsAiClient установлена и запущена')
  const readyStatus = await ensureDaemonReady()
  const synced = await syncCachedSettingsToDaemon(readyStatus)
  if (synced) {
    return buildSnapshotFromPipeStatus(synced)
  }
  return getDnsAiStatus()
}

export async function uninstallDnsAiService(): Promise<DnsAiStatusSnapshot> {
  const bin = dnsAiBinaryPath()
  if (!existsSync(bin)) {
    throw new Error(`Бинарник DNS-AI не найден: ${bin}`)
  }
  if (consoleDaemon && !consoleDaemon.killed) {
    consoleDaemon.kill()
    consoleDaemon = null
  }
  try {
    await sendPipeRequest({ cmd: 'disable' }, 8000)
  } catch {
    // ignore if pipe not running
  }
  await execFileAsync(bin, ['uninstall'], { windowsHide: true, timeout: 15000 })
  emitLog('info', 'dns', 'Служба DnsAiClient удалена и настройки DNS восстановлены')
  try {
    await execFileAsync('ipconfig.exe', ['/flushdns'], { windowsHide: true, timeout: 4000 })
  } catch {
    // ignore
  }
  return getDnsAiStatus()
}

export async function testDnsAiDoh(domain = 'proto.dns-ai.ru', qtype = 'TXT'): Promise<DnsAiDohTestResult> {
  const bin = dnsAiBinaryPath()
  if (!existsSync(bin)) {
    throw new Error(`Бинарник DNS-AI не найден: ${bin}`)
  }
  const t0 = Date.now()
  try {
    const { stdout, stderr } = await execFileAsync(bin, ['test-doh', domain, qtype], {
      windowsHide: true,
      timeout: 10000
    })
    const latencyMs = Date.now() - t0
    const out = [stdout, stderr].filter(Boolean).join('\n').trim()
    emitLog('info', 'dns', `Тест DoH (${domain} ${qtype}): OK за ${latencyMs} мс`)
    return {
      ok: true,
      output: out || `OK (${latencyMs} мс)`,
      latencyMs
    }
  } catch (err: unknown) {
    const latencyMs = Date.now() - t0
    const e = err as { stdout?: string; stderr?: string; message?: string }
    const out = [e.stdout, e.stderr, e.message].filter(Boolean).join('\n').trim()
    emitLog('warn', 'dns', `Тест DoH (${domain} ${qtype}) завершился с ошибкой: ${out}`)
    return {
      ok: false,
      output: out,
      latencyMs
    }
  }
}

export interface DnsAiServiceCheckResult {
  name: string
  domain: string
  ip: string
  dnsOk: boolean
  httpOk: boolean
  statusCode: number
  latencyMs: number
  error?: string
}

export async function checkDnsAiServices(): Promise<DnsAiServiceCheckResult[]> {
  const dnsPromises = await import('node:dns/promises')
  const https = await import('node:https')

  const targets = [
    { name: 'Google Gemini', domain: 'gemini.google.com' },
    { name: 'Google AI Studio', domain: 'aistudio.google.com' },
    { name: 'ChatGPT', domain: 'chatgpt.com' },
    { name: 'Claude AI', domain: 'claude.ai' }
  ]

  const results: DnsAiServiceCheckResult[] = []

  for (const t of targets) {
    const t0 = Date.now()
    let ip = ''
    let dnsOk = false
    let httpOk = false
    let statusCode = 0
    let error = ''

    try {
      const res = await dnsPromises.lookup(t.domain)
      if (res && res.address) {
        ip = res.address
        dnsOk = true
      }
    } catch (e: unknown) {
      error = `DNS: ${e instanceof Error ? e.message : String(e)}`
    }

    if (dnsOk && ip) {
      try {
        statusCode = await new Promise<number>((resolve, reject) => {
          const req = https.request(
            {
              hostname: t.domain,
              port: 443,
              path: '/',
              method: 'GET',
              maxHeaderSize: 65536,
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
              },
              timeout: 6000
            },
            (r) => {
              r.resume()
              resolve(r.statusCode ?? 0)
            }
          )
          req.on('error', reject)
          req.on('timeout', () => {
            req.destroy()
            reject(new Error('Тайм-аут запроса (6 с)'))
          })
          req.end()
        })
        httpOk = statusCode >= 200 && statusCode < 400
      } catch (e: unknown) {
        error = `HTTPS: ${e instanceof Error ? e.message : String(e)}`
      }
    }

    const latencyMs = Date.now() - t0
    results.push({
      name: t.name,
      domain: t.domain,
      ip,
      dnsOk,
      httpOk,
      statusCode,
      latencyMs,
      error: error || undefined
    })
  }

  emitLog(
    'info',
    'dns',
    `Проверка доступности ИИ-сервисов: ${results.map((r) => `${r.name}=${r.httpOk ? 'OK' : r.statusCode || 'ERR'}`).join(', ')}`
  )

  return results
}
