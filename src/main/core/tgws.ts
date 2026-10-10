import { ChildProcess, spawn } from 'child_process'
import { createConnection, createServer } from 'net'
import { existsSync } from 'fs'
import { randomBytes } from 'crypto'
import os from 'os'
import { BrowserWindow } from 'electron'
import { tgwsBinaryPath } from '../utils/dirs'
import { getAppConfig, patchAppConfig } from '../config'

let child: ChildProcess | null = null
let status: CoreStatus = { state: 'stopped' }
let stopRequested = false

const DEFAULT_DC_IPS = ['2:149.154.167.220', '4:149.154.167.220'] as const
const MEDIA_FIX_DC_IPS = [
  '1:149.154.175.50',
  '2:149.154.167.220',
  '3:149.154.175.100',
  '4:149.154.167.220',
  '5:91.108.56.100'
] as const
const COLD_BOOT_THRESHOLD_S = 180
const NETWORK_WAIT_TIMEOUT_MS = 30_000
const SECRET_HEX_LEN = 32

function broadcast(channel: string, ...args: unknown[]): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, ...args)
  }
}

function log(type: ControllerLog['type'], payload: string): void {
  broadcast('log', {
    time: Date.now(),
    type,
    source: 'tgws',
    payload
  } satisfies ControllerLog)
}

function setStatus(next: Partial<CoreStatus>): void {
  status = { ...status, ...next }
  broadcast('tgws:status', status)
}

export function getTgwsStatus(): CoreStatus {
  return status
}

function isValidSecret(secret: string | undefined): boolean {
  return !!secret && secret.length === SECRET_HEX_LEN && /^[0-9a-fA-F]+$/.test(secret)
}

async function ensureSecret(current: string | undefined): Promise<string> {
  if (isValidSecret(current)) return current!
  const fresh = randomBytes(16).toString('hex')
  log('warn', `secret invalid (len=${current?.length ?? 0}) — regenerated and persisted`)
  const cfg = await getAppConfig()
  await patchAppConfig({ tgws: { ...cfg.tgws!, secret: fresh } })
  return fresh
}

function tryListen(host: string, port: number): Promise<{ free: true } | { free: false; code: string }> {
  return new Promise((resolve) => {
    const srv = createServer()
    srv.unref()
    srv.once('error', (e: NodeJS.ErrnoException) => {
      resolve({ free: false, code: e.code || 'EUNKNOWN' })
    })
    srv.listen(port, host, () => {
      srv.close(() => resolve({ free: true }))
    })
  })
}

async function killStaleTgws(): Promise<boolean> {
  if (process.platform !== 'win32') return false
  try {
    await new Promise<void>((resolve) => {
      const p = spawn('taskkill.exe', ['/F', '/IM', 'TgWsProxy_windows.exe', '/T'], {
        windowsHide: true
      })
      p.on('exit', () => resolve())
      p.on('error', () => resolve())
    })
    log('info', 'stale TgWsProxy_windows.exe instances killed')
    await new Promise((r) => setTimeout(r, 500))
    return true
  } catch {
    return false
  }
}

async function ensurePortFree(host: string, port: number): Promise<void> {
  let probe = await tryListen(host, port)
  if (probe.free === true) {
    log('info', `port ${port} is free`)
    return
  }
  if (probe.code !== 'EADDRINUSE') {
    log('warn', `unexpected listen error on :${port} → ${probe.code}, continuing`)
    return
  }
  log('warn', `port ${port} is busy, attempting to free it`)
  await killStaleTgws()
  probe = await tryListen(host, port)
  if (probe.free === true) {
    log('info', `port ${port} freed after cleanup`)
    return
  }
  throw new Error(`Порт ${port} занят другим процессом и не может быть освобождён`)
}

function isColdBoot(): boolean {
  try {
    return os.uptime() < COLD_BOOT_THRESHOLD_S
  } catch {
    return false
  }
}

function tcpPing(ip: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = createConnection({ host: ip, port })
    let done = false
    const finish = (ok: boolean): void => {
      if (done) return
      done = true
      try { sock.destroy() } catch { /* noop */ }
      resolve(ok)
    }
    sock.setTimeout(timeoutMs)
    sock.once('connect', () => finish(true))
    sock.once('error', () => finish(false))
    sock.once('timeout', () => finish(false))
  })
}

function dcIpsToTargets(dcList: string[] | undefined): string[] {
  const ips: string[] = []
  for (const entry of dcList ?? []) {
    if (typeof entry === 'string' && entry.includes(':')) {
      const ip = entry.split(':', 2)[1].trim()
      if (ip) ips.push(ip)
    }
  }
  return ips.length ? ips : ['149.154.167.220']
}

async function waitForNetwork(targets: string[]): Promise<boolean> {
  const deadline = Date.now() + NETWORK_WAIT_TIMEOUT_MS
  let delay = 500
  let attempt = 0
  while (Date.now() < deadline) {
    attempt++
    for (const ip of targets) {
      if (await tcpPing(ip, 443, 2000)) {
        log('info', `network ready: ${ip}:443 reachable (attempt ${attempt})`)
        return true
      }
    }
    log('info', `network not ready (attempt ${attempt}), retrying in ${delay}ms`)
    await new Promise((r) => setTimeout(r, delay))
    delay = Math.min(delay * 1.5, 4000)
  }
  log('warn', 'network readiness check timed out — starting anyway')
  return false
}

let opLock: Promise<void> = Promise.resolve()
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = opLock.then(fn, fn)
  opLock = next.then(() => undefined, () => undefined)
  return next
}

export function startTgws(): Promise<void> {
  return withLock(() => startTgwsImpl())
}
export function stopTgws(): Promise<void> {
  return withLock(() => stopTgwsImpl())
}

function splitDomains(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

async function startTgwsImpl(): Promise<void> {
  if (child) {
    log('warn', 'startTgws ignored: already running')
    return
  }

  const cfg0 = await getAppConfig()
  if (!cfg0.tgws) throw new Error('tgws config missing')

  const bin = cfg0.tgws.binaryPath || tgwsBinaryPath()
  if (!existsSync(bin)) {
    setStatus({ state: 'error', lastError: `TgWsProxy binary not found: ${bin}` })
    log('error', `binary missing: ${bin}`)
    throw new Error(`TgWsProxy binary not found: ${bin}`)
  }

  setStatus({ state: 'starting', startedAt: Date.now(), lastError: undefined })
  log('info', '═══ TG WS PROXY v1.11.1 STARTUP ═══')

  try {
    const secret = await ensureSecret(cfg0.tgws.secret)
    log('info', `secret OK (len=${secret.length}, prefix=${secret.slice(0, 8)}…)`)

    const cfg = await getAppConfig()
    const t = cfg.tgws!

    // Resolve DC IP mappings according to mediaMode and user overrides
    const mediaMode = t.mediaMode ?? 'default'
    let dcIp: string[] = []
    if (mediaMode === 'empty') {
      dcIp = []
    } else if (t.dcIp && t.dcIp.length > 0) {
      dcIp = t.dcIp
    } else if (mediaMode === 'media_fix') {
      dcIp = [...MEDIA_FIX_DC_IPS]
    } else {
      dcIp = [...DEFAULT_DC_IPS]
    }
    log('info', `Режим медиа: ${mediaMode}, DC IP: ${dcIp.length ? dcIp.join(', ') : '(пусто)'}`)

    await ensurePortFree(t.host, t.port)

    if (isColdBoot() && dcIp.length > 0) {
      void waitForNetwork(dcIpsToTargets(dcIp))
        .then(() => log('info', 'upstream DC reachable'))
        .catch(() => log('warn', 'upstream DC sanity check timed out — proxy still serving locally'))
    }

    const args: string[] = [
      '--host', t.host,
      '--port', String(t.port),
      '--secret', secret
    ]
    if (mediaMode === 'empty' && (!t.dcIp || t.dcIp.length === 0)) {
      args.push('--dc-ip')
    } else {
      for (const d of dcIp) args.push('--dc-ip', d)
    }

    if (t.bufKb) args.push('--buf-kb', String(t.bufKb))
    if (t.poolSize != null) args.push('--pool-size', String(t.poolSize))
    if (t.verbose) args.push('-v')
    if (t.cfproxy === false) args.push('--no-cfproxy')
    for (const dom of splitDomains(t.cfproxyUserDomain)) {
      args.push('--cfproxy-domain', dom)
    }
    for (const wdom of splitDomains(t.cfproxyWorkerDomain)) {
      args.push('--cfproxy-worker-domain', wdom)
    }
    if (t.disableH2) args.push('--no-h2')
    if (t.disableSecure) args.push('--no-secure')
    if (t.fakeTlsDomain && t.fakeTlsDomain.trim()) {
      args.push('--fake-tls-domain', t.fakeTlsDomain.trim())
    }

    log('info', `spawning: ${bin} ${args.join(' ')}`)
    child = spawn(bin, args, { windowsHide: true })

    child.stdout?.on('data', (buf) => log('info', buf.toString().trimEnd()))
    child.stderr?.on('data', (buf) => log('warn', buf.toString().trimEnd()))
    child.on('error', (err) => {
      log('error', `child error: ${err.message}`)
      setStatus({ state: 'error', lastError: err.message, pid: undefined })
      child = null
    })
    child.on('exit', (code, signal) => {
      log('info', `exited code=${code} signal=${signal ?? 'none'}`)
      const wasGraceful = stopRequested || code === 0 || signal === 'SIGTERM'
      child = null
      setStatus({
        state: wasGraceful ? 'stopped' : 'error',
        pid: undefined,
        lastError: wasGraceful
          ? undefined
          : (code != null ? `exited with code ${code}` : undefined)
      })
    })

    await new Promise((r) => setTimeout(r, 150))
    if (!child || child.exitCode != null) {
      throw new Error('Процесс TgWsProxy завершился сразу после запуска')
    }

    setStatus({ state: 'running', pid: child.pid })
    log('info', `✓ TgWsProxy запущен (pid=${child.pid})`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log('error', `startup failed: ${msg}`)
    setStatus({ state: 'error', lastError: msg, pid: undefined })
    if (child) {
      try { child.kill('SIGKILL') } catch { /* noop */ }
      child = null
    }
    throw e
  }
}

async function stopTgwsImpl(): Promise<void> {
  if (!child) {
    setStatus({ state: 'stopped', pid: undefined, lastError: undefined })
    return
  }
  stopRequested = true
  setStatus({ state: 'stopping', lastError: undefined })
  log('info', 'Остановка TG WS Proxy…')
  const proc = child
  const pid = proc.pid

  try {
    if (process.platform === 'win32' && pid) {
      await new Promise<void>((resolve) => {
        const p = spawn('taskkill.exe', ['/F', '/T', '/PID', String(pid)], { windowsHide: true })
        p.on('exit', () => resolve())
        p.on('error', () => resolve())
      })
    } else {
      proc.kill('SIGTERM')
    }
  } catch (e) {
    log('warn', `kill failed: ${e}`)
  }

  await Promise.race([
    new Promise<void>((resolve) => proc.once('exit', () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 500))
  ])

  if (process.platform !== 'win32' && proc.exitCode == null && !proc.killed) {
    try { proc.kill('SIGKILL') } catch { /* noop */ }
  }

  child = null
  setStatus({ state: 'stopped', pid: undefined, lastError: undefined })
  stopRequested = false
}

export async function restartTgws(): Promise<void> {
  log('info', 'Перезапуск TG WS Proxy…')
  await stopTgws()
  await new Promise((r) => setTimeout(r, 250))
  await startTgws()
}

export async function getTgwsLink(): Promise<string> {
  const cfg = await getAppConfig()
  const t = cfg.tgws
  if (!t) return ''
  const secret = isValidSecret(t.secret) ? t.secret : await ensureSecret(t.secret)
  const ftls = (t.fakeTlsDomain ?? '').trim()
  let fullSecret = `dd${secret}`
  if (ftls) {
    const domainHex = Buffer.from(ftls, 'ascii').toString('hex')
    fullSecret = `ee${secret}${domainHex}`
  }
  return `tg://proxy?server=${encodeURIComponent(t.host)}&port=${t.port}&secret=${encodeURIComponent(fullSecret)}`
}
