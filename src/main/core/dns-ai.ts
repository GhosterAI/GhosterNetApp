import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { dnsAiBinaryPath, dnsAiEndpointsPath } from '../utils/dirs'
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
  try {
    const p = path.join(getDnsAiDataDir(), 'settings.json')
    if (existsSync(p)) {
      const parsed = JSON.parse(readFileSync(p, 'utf8'))
      return {
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
  return def
}

function saveDiskSettings(settings: DnsAiSettings): void {
  try {
    const dir = getDnsAiDataDir()
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(settings, null, 2), 'utf8')
  } catch {
    // ignore
  }
}

function readEndpoints(): { dohUrl: string; dotHost: string; ipv4: string[]; ipv6: string[] } {
  const defaultV4 = ['186.246.49.127', '192.144.59.14']
  const defaultV6 = ['2a0a:2b41:0:500d::53', '2a0d:8480:0:67c::14']
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

function sendPipeRequest(payload: Record<string, unknown>, timeoutMs = 4000): Promise<PipeReply> {
  return new Promise((resolve, reject) => {
    let settled = false
    let buffer = ''
    const client = net.createConnection(PIPE_PATH)

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      client.destroy()
      reject(new Error('Тайм-аут обращения к службе DNS-AI (pipe)'))
    }, timeoutMs)

    client.on('connect', () => {
      client.write(JSON.stringify(payload) + '\n')
    })

    client.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      const nlIdx = buffer.indexOf('\n')
      if (nlIdx !== -1 && !settled) {
        settled = true
        clearTimeout(timer)
        const line = buffer.slice(0, nlIdx).trim()
        client.end()
        try {
          resolve(JSON.parse(line) as PipeReply)
        } catch (err) {
          reject(err)
        }
      }
    })

    client.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })

    client.on('close', () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (buffer.trim()) {
        try {
          resolve(JSON.parse(buffer.trim()) as PipeReply)
          return
        } catch {
          // fall through
        }
      }
      reject(new Error('Соединение с pipe службы DNS-AI закрыто без ответа'))
    })
  })
}

async function ensureDaemonReady(): Promise<void> {
  try {
    const ping = await sendPipeRequest({ cmd: 'status' }, 1000)
    if (ping.ok) return
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

  // Wait up to 4 seconds for pipe to accept connections
  for (let i = 0; i < 16; i++) {
    await new Promise((r) => setTimeout(r, 250))
    try {
      const check = await sendPipeRequest({ cmd: 'status' }, 1000)
      if (check.ok) return
    } catch {
      // retry
    }
  }
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
      const reply = await sendPipeRequest({ cmd: 'status' }, 1500)
      if (reply.ok && reply.status) {
        const st = reply.status
        return {
          available: true,
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

export async function enableDnsAi(): Promise<DnsAiStatusSnapshot> {
  await ensureDaemonReady()
  const reply = await sendPipeRequest({ cmd: 'enable' }, 10000)
  if (!reply.ok) {
    throw new Error(reply.error || 'Не удалось включить защиту DNS-AI')
  }
  emitLog('info', 'dns', `Шифрованный DNS-AI включён (режим: ${reply.status?.settings?.mode ?? 'stub'})`)
  return getDnsAiStatus()
}

export async function disableDnsAi(): Promise<DnsAiStatusSnapshot> {
  try {
    const reply = await sendPipeRequest({ cmd: 'disable' }, 8000)
    if (!reply.ok && reply.error) {
      throw new Error(reply.error)
    }
    emitLog('info', 'dns', 'Шифрованный DNS-AI отключён, настройки адаптеров восстановлены')
  } catch (e) {
    // If pipe wasn't running, ensure settings.enabled is false on disk
    const cur = loadDiskSettings()
    cur.enabled = false
    saveDiskSettings(cur)
    emitLog('warn', 'dns', `Отключение DNS-AI: ${e instanceof Error ? e.message : String(e)}`)
  }
  return getDnsAiStatus()
}

export async function setDnsAiSettings(partial: Partial<DnsAiSettings>): Promise<DnsAiStatusSnapshot> {
  const current = (await getDnsAiStatus()).settings
  const next: DnsAiSettings = {
    ...current,
    ...partial
  }
  saveDiskSettings(next)

  try {
    const reply = await sendPipeRequest({ cmd: 'set_settings', settings: next }, 8000)
    if (!reply.ok && reply.error) {
      throw new Error(reply.error)
    }
    emitLog('info', 'dns', `Обновлены настройки DNS-AI (mode=${next.mode}, ipv6=${next.ipv6}, vpn=${next.include_vpn_adapters})`)
  } catch {
    // Saved to disk; will take effect when enabled
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
  await execFileAsync(bin, ['uninstall'], { windowsHide: true, timeout: 15000 })
  emitLog('info', 'dns', 'Служба DnsAiClient удалена и настройки DNS восстановлены')
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
