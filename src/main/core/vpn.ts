import { ChildProcess, spawn } from 'child_process'
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import path from 'path'
import readline from 'readline'
import net from 'net'
import { BrowserWindow } from 'electron'
import { vpnBinaryPath, vpnRuntimeDir, wintunDllPath, wireproxyBinaryPath } from '../utils/dirs'
import { getAppConfig, patchAppConfig } from '../config'
import { buildSingBoxConfig, buildWireproxyConfig } from './vpn-config'
import { parseVpnInput, ParseResult } from './vpn-parser'
import { getPsiphonStatus } from './psiphon'
import { disableWindowsSystemProxy } from '../sys/system-proxy'

let child: ChildProcess | null = null
let wireproxyChild: ChildProcess | null = null
let status: VpnStatus = {
  state: 'stopped',
  routingMode: 'bypass-ru',
  tunMode: true,
  localHttpPort: 2080,
  localSocksPort: 2081
}
let stopRequested = false

function broadcast(channel: string, ...args: unknown[]): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, ...args)
  }
}

function log(type: ControllerLog['type'], payload: string): void {
  broadcast('log', {
    time: Date.now(),
    type,
    source: 'vpn',
    payload
  } satisfies ControllerLog)
}

function setStatus(next: Partial<VpnStatus>): void {
  status = { ...status, ...next }
  broadcast('vpn:status', status)
}

export function getVpnStatus(): VpnStatus {
  return status
}

export async function killStaleSingBox(): Promise<void> {
  if (process.platform !== 'win32') return
  try {
    await new Promise<void>((resolve) => {
      const p = spawn('taskkill.exe', ['/F', '/IM', 'sing-box.exe', '/T'], {
        windowsHide: true
      })
      p.on('exit', () => resolve())
      p.on('error', () => resolve())
    })
    await new Promise<void>((resolve) => {
      const p = spawn('taskkill.exe', ['/F', '/IM', 'wireproxy.exe', '/T'], {
        windowsHide: true
      })
      p.on('exit', () => resolve())
      p.on('error', () => resolve())
    })
    await new Promise((r) => setTimeout(r, 400))
  } catch {
    // ignore
  }
}

export async function measureServerLatency(host: string, port: number, timeoutMs = 2500): Promise<number | null> {
  return new Promise((resolve) => {
    const start = Date.now()
    const socket = new net.Socket()

    const done = (latency: number | null): void => {
      socket.destroy()
      resolve(latency)
    }

    socket.setTimeout(timeoutMs)
    socket.once('connect', () => {
      const ms = Date.now() - start
      done(ms)
    })
    socket.once('timeout', () => done(null))
    socket.once('error', () => done(null))

    try {
      socket.connect(port, host)
    } catch {
      done(null)
    }
  })
}

export async function testVpnLatencies(targetServerId?: string): Promise<Record<string, number | null>> {
  const cfg = await getAppConfig()
  const servers = cfg.vpn?.servers ?? []
  const results: Record<string, number | null> = {}

  const targets = targetServerId
    ? servers.filter((s) => s.id === targetServerId)
    : servers

  await Promise.all(
    targets.map(async (s) => {
      const ms = await measureServerLatency(s.server, s.serverPort)
      s.latencyMs = ms
      results[s.id] = ms
    })
  )

  await patchAppConfig({
    vpn: {
      ...(cfg.vpn as VpnConfig),
      servers
    }
  })

  broadcast('vpn:serversUpdated', servers)
  return results
}

export async function startVpn(): Promise<void> {
  if (status.state === 'running' || status.state === 'starting') return

  const cfg = await getAppConfig()
  const vpnCfg = cfg.vpn
  if (!vpnCfg || vpnCfg.servers.length === 0) {
    const msg = 'Нет добавленных VPN-серверов. Вставьте ключ или ссылку подписки.'
    log('warn', msg)
    setStatus({ state: 'error', lastError: msg })
    throw new Error(msg)
  }

  const selectedServer =
    vpnCfg.servers.find((s) => s.id === vpnCfg.selectedServerId) || vpnCfg.servers[0]

  if (!selectedServer) {
    const msg = 'Не выбран сервер для подключения'
    log('error', msg)
    setStatus({ state: 'error', lastError: msg })
    throw new Error(msg)
  }

  const bin = vpnBinaryPath()
  if (!existsSync(bin)) {
    const msg = `Бинарник sing-box не найден (${bin})`
    log('error', msg)
    setStatus({ state: 'error', lastError: msg })
    throw new Error(msg)
  }

  stopRequested = false
  setStatus({
    state: 'starting',
    activeServer: selectedServer,
    routingMode: vpnCfg.routingMode || 'bypass-ru',
    tunMode: vpnCfg.tunMode ?? true,
    lastError: undefined
  })
  log('info', `Запуск VPN: подключение к ${selectedServer.name} (${selectedServer.server}:${selectedServer.serverPort})…`)

  await killStaleSingBox()

  // Coexistence: disable Psiphon system proxy if active so TUN routes cleanly
  const psiphonStatus = getPsiphonStatus()
  if (psiphonStatus.state === 'running' && psiphonStatus.systemProxy) {
    log('warn', 'Внимание: Системный прокси Psiphon временно отключен во избежание конфликта с TUN-адаптером VPN.')
    await disableWindowsSystemProxy().catch(() => void 0)
  }

  const runDir = vpnRuntimeDir()
  if (!existsSync(runDir)) mkdirSync(runDir, { recursive: true })

  // Ensure wintun.dll is in runDir next to sing-box or binary directory
  const bundledWintun = wintunDllPath()
  const targetWintun = path.join(runDir, 'wintun.dll')
  if (existsSync(bundledWintun) && !existsSync(targetWintun)) {
    try {
      copyFileSync(bundledWintun, targetWintun)
    } catch {
      // ignore
    }
  }

  const singBoxConfig = buildSingBoxConfig({
    server: selectedServer,
    tunMode: vpnCfg.tunMode ?? true,
    routingMode: vpnCfg.routingMode || 'bypass-ru',
    localHttpPort: vpnCfg.localHttpPort || 2080,
    localSocksPort: vpnCfg.localSocksPort || 2081
  })

  const configPath = path.join(runDir, 'config.json')
  writeFileSync(configPath, JSON.stringify(singBoxConfig, null, 2), 'utf-8')

  try {
    if (selectedServer.type === 'awg' || selectedServer.type === 'wireguard') {
      const wireproxyBin = wireproxyBinaryPath()
      if (!existsSync(wireproxyBin)) {
        const msg = `Бинарник wireproxy не найден (${wireproxyBin})`
        log('error', msg)
        setStatus({ state: 'error', lastError: msg })
        throw new Error(msg)
      }

      const awgConfPath = path.join(runDir, 'wireproxy.conf')
      const awgConf = buildWireproxyConfig(selectedServer, 2082)
      writeFileSync(awgConfPath, awgConf, 'utf-8')

      log('info', `Запуск AmneziaWG моста wireproxy (порт 2082)…`)
      wireproxyChild = spawn(wireproxyBin, ['-c', awgConfPath], {
        cwd: runDir,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })

      if (wireproxyChild.stdout) {
        const rlWpOut = readline.createInterface({ input: wireproxyChild.stdout })
        rlWpOut.on('line', (l) => log('debug', `[wireproxy] ${l}`))
      }
      if (wireproxyChild.stderr) {
        const rlWpErr = readline.createInterface({ input: wireproxyChild.stderr })
        rlWpErr.on('line', (l) => log('debug', `[wireproxy] ${l}`))
      }

      await new Promise((r) => setTimeout(r, 400))
    }

    child = spawn(bin, ['run', '-c', configPath], {
      cwd: runDir,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    const pid = child.pid
    setStatus({
      pid,
      activeServer: selectedServer,
      localHttpPort: vpnCfg.localHttpPort || 2080,
      localSocksPort: vpnCfg.localSocksPort || 2081
    })

    let tunnelReady = false

    const handleLine = (line: string): void => {
      const trimmed = line.trim()
      if (!trimmed) return
      log('debug', `[sing-box] ${trimmed}`)

      // Sing-box startup detection
      if (
        !tunnelReady &&
        (trimmed.includes('sing-box started') ||
          trimmed.includes('inbound/tun[tun-in]: started') ||
          trimmed.includes('inbound/mixed[mixed-in]: started'))
      ) {
        tunnelReady = true
        setStatus({ state: 'running', startedAt: Date.now() })
        log('info', `VPN успешно подключен: ${selectedServer.name}`)
      }
    }

    if (child.stderr) {
      const rlErr = readline.createInterface({ input: child.stderr })
      rlErr.on('line', handleLine)
    }
    if (child.stdout) {
      const rlOut = readline.createInterface({ input: child.stdout })
      rlOut.on('line', handleLine)
    }

    // Fallback timer if logs did not trigger ready line
    setTimeout(() => {
      if (child && status.state === 'starting') {
        setStatus({ state: 'running', startedAt: Date.now() })
        log('info', `VPN активен (${selectedServer.name})`)
      }
    }, 2000)

    child.on('error', (err) => {
      log('error', `Ошибка процесса VPN: ${err.message}`)
      setStatus({ state: 'error', lastError: err.message })
    })

    child.on('exit', (code, signal) => {
      child = null
      if (stopRequested) {
        setStatus({ state: 'stopped', pid: undefined })
        log('info', 'VPN остановлен')
      } else {
        const msg = `VPN отключен (код: ${code ?? 'none'}, сигнал: ${signal ?? 'none'})`
        log('warn', msg)
        setStatus({ state: 'stopped', pid: undefined, lastError: msg })
      }
    })

    await patchAppConfig({
      vpn: {
        ...vpnCfg,
        enabled: true
      }
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log('error', `Не удалось запустить VPN: ${msg}`)
    setStatus({ state: 'error', lastError: msg })
    throw e
  }
}

export async function stopVpn(): Promise<void> {
  if (status.state === 'stopped') return
  stopRequested = true
  setStatus({ state: 'stopping' })

  if (child && child.pid) {
    try {
      child.kill()
    } catch {
      // ignore
    }
  }
  if (wireproxyChild) {
    try {
      wireproxyChild.kill()
    } catch {
      // ignore
    }
    wireproxyChild = null
  }
  await killStaleSingBox()

  child = null
  setStatus({ state: 'stopped', pid: undefined })

  const cfg = await getAppConfig()
  if (cfg.vpn) {
    await patchAppConfig({
      vpn: {
        ...cfg.vpn,
        enabled: false
      }
    })
  }
}

export async function restartVpn(): Promise<void> {
  await stopVpn()
  await startVpn()
}

export async function addVpnSubscriptionOrKeys(input: string): Promise<ParseResult> {
  const parsed = await parseVpnInput(input)
  if (parsed.servers.length === 0) {
    throw new Error('Не найдено ни одного поддерживаемого сервера или конфигурации в введённых данных.')
  }

  const cfg = await getAppConfig()
  const vpnCfg = cfg.vpn ?? {
    enabled: false,
    autoStart: false,
    routingMode: 'bypass-ru',
    tunMode: true,
    subscriptions: [],
    servers: []
  }

  const subscriptions = [...(vpnCfg.subscriptions ?? [])]
  if (parsed.subscription) {
    const existingIdx = subscriptions.findIndex((s) => s.url === parsed.subscription!.url)
    if (existingIdx >= 0) {
      subscriptions[existingIdx] = parsed.subscription
    } else {
      subscriptions.push(parsed.subscription)
    }
  }

  // Merge servers (deduplicate by rawUri or server+port+type)
  const existingServers = (vpnCfg.servers ?? []).filter((s) => {
    if (parsed.subscription && s.subscriptionId === parsed.subscription.id) {
      return false // replace old ones from this sub
    }
    return true
  })

  const newServers = [...existingServers, ...parsed.servers]
  const selectedServerId = vpnCfg.selectedServerId || newServers[0]?.id

  await patchAppConfig({
    vpn: {
      ...vpnCfg,
      subscriptions,
      servers: newServers,
      selectedServerId
    }
  })

  log('info', `Добавлено серверов: ${parsed.servers.length}`)
  broadcast('vpn:serversUpdated', newServers)
  return parsed
}

export async function updateVpnSubscription(id: string): Promise<number> {
  const cfg = await getAppConfig()
  const sub = cfg.vpn?.subscriptions.find((s) => s.id === id)
  if (!sub || !sub.url) {
    throw new Error('Подписка не найдена')
  }

  const parsed = await parseVpnInput(sub.url)
  if (parsed.servers.length === 0) {
    throw new Error('Подписка не вернула серверов')
  }

  // Update subscription metadata
  const subscriptions = (cfg.vpn?.subscriptions ?? []).map((s) => {
    if (s.id === id && parsed.subscription) {
      return {
        ...s,
        ...parsed.subscription,
        id // keep same id
      }
    }
    return s
  })

  // Tag servers with sub id
  parsed.servers.forEach((srv) => {
    srv.subscriptionId = id
  })

  // Replace servers belonging to this subscription
  const otherServers = (cfg.vpn?.servers ?? []).filter((s) => s.subscriptionId !== id)
  const newServers = [...otherServers, ...parsed.servers]

  await patchAppConfig({
    vpn: {
      ...(cfg.vpn as VpnConfig),
      subscriptions,
      servers: newServers
    }
  })

  log('info', `Подписка "${sub.name}" обновлена: ${parsed.servers.length} серверов`)
  broadcast('vpn:serversUpdated', newServers)
  return parsed.servers.length
}

export async function deleteVpnSubscription(id: string): Promise<void> {
  const cfg = await getAppConfig()
  if (!cfg.vpn) return

  const subscriptions = cfg.vpn.subscriptions.filter((s) => s.id !== id)
  const servers = cfg.vpn.servers.filter((s) => s.subscriptionId !== id)
  let selectedServerId = cfg.vpn.selectedServerId
  if (!servers.some((s) => s.id === selectedServerId)) {
    selectedServerId = servers[0]?.id
  }

  await patchAppConfig({
    vpn: {
      ...cfg.vpn,
      subscriptions,
      servers,
      selectedServerId
    }
  })

  broadcast('vpn:serversUpdated', servers)
}

export async function selectVpnServer(serverId: string): Promise<void> {
  const cfg = await getAppConfig()
  if (!cfg.vpn) return

  const s = cfg.vpn.servers.find((item) => item.id === serverId)
  if (!s) return

  await patchAppConfig({
    vpn: {
      ...cfg.vpn,
      selectedServerId: serverId
    }
  })
  setStatus({ activeServer: s })

  if (status.state === 'running') {
    await restartVpn()
  }
}

export async function setVpnRoutingMode(mode: VpnRoutingMode): Promise<void> {
  const cfg = await getAppConfig()
  if (!cfg.vpn) return

  await patchAppConfig({
    vpn: {
      ...cfg.vpn,
      routingMode: mode
    }
  })
  setStatus({ routingMode: mode })

  if (status.state === 'running') {
    await restartVpn()
  }
}

export async function setVpnTunMode(enabled: boolean): Promise<void> {
  const cfg = await getAppConfig()
  if (!cfg.vpn) return

  await patchAppConfig({
    vpn: {
      ...cfg.vpn,
      tunMode: enabled
    }
  })
  setStatus({ tunMode: enabled })

  if (status.state === 'running') {
    await restartVpn()
  }
}
