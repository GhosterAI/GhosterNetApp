import { ChildProcess, spawn } from 'child_process'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import path from 'path'
import readline from 'readline'
import { BrowserWindow } from 'electron'
import { psiphonBinaryPath, psiphonRuntimeDir } from '../utils/dirs'
import { getAppConfig, patchAppConfig } from '../config'
import { setWindowsSystemProxy, disableWindowsSystemProxy } from '../sys/system-proxy'
import { getVpnStatus } from './vpn'

let child: ChildProcess | null = null
let status: PsiphonStatus = {
  state: 'stopped',
  httpPort: 20807,
  socksPort: 20808,
  systemProxy: false,
  availableRegions: []
}
let stopRequested = false
let systemProxyApplied = false

function broadcast(channel: string, ...args: unknown[]): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, ...args)
  }
}

function log(type: ControllerLog['type'], payload: string): void {
  broadcast('log', {
    time: Date.now(),
    type,
    source: 'psiphon',
    payload
  } satisfies ControllerLog)
}

function setStatus(next: Partial<PsiphonStatus>): void {
  status = { ...status, ...next }
  broadcast('psiphon:status', status)
}

export function getPsiphonStatus(): PsiphonStatus {
  return status
}

async function killStalePsiphon(): Promise<void> {
  if (process.platform !== 'win32') return
  try {
    await new Promise<void>((resolve) => {
      const p = spawn('taskkill.exe', ['/F', '/IM', 'psiphon-tunnel-core.exe', '/T'], {
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

export async function startPsiphon(): Promise<void> {
  if (status.state === 'running' || status.state === 'starting') return

  const bin = psiphonBinaryPath()
  if (!existsSync(bin)) {
    const msg = `Psiphon binary not found at ${bin}`
    log('error', msg)
    setStatus({ state: 'error', lastError: msg })
    return
  }

  stopRequested = false
  setStatus({ state: 'starting', lastError: undefined })
  log('info', 'Запуск Psiphon VPN & Proxy…')

  await killStalePsiphon()

  const cfg = await getAppConfig()
  const pCfg = cfg.psiphon ?? {
    enabled: false,
    autoStart: false,
    httpPort: 20807,
    socksPort: 20808,
    egressRegion: '',
    systemProxy: false
  }

  const runDir = psiphonRuntimeDir()
  const dataDir = path.join(runDir, 'data')
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
  }

  const httpPort = pCfg.httpPort || 20807
  const socksPort = pCfg.socksPort || 20808
  const egressRegion = pCfg.egressRegion || ''

  const configPayload = {
    PropagationChannelId: 'FFFFFFFFFFFFFFFF',
    SponsorId: 'FFFFFFFFFFFFFFFF',
    RemoteServerListUrl:
      'https://s3.amazonaws.com//psiphon/web/mjr4-p23r-puwl/server_list_compressed',
    RemoteServerListDownloadFilename: 'remote_server_list',
    RemoteServerListSignaturePublicKey:
      'MIICIDANBgkqhkiG9w0BAQEFAAOCAg0AMIICCAKCAgEAt7Ls+/39r+T6zNW7GiVpJfzq/xvL9SBH5rIFnk0RXYEYavax3WS6HOD35eTAqn8AniOwiH+DOkvgSKF2caqk/y1dfq47Pdymtwzp9ikpB1C5OfAysXzBiwVJlCdajBKvBZDerV1cMvRzCKvKwRmvDmHgphQQ7WfXIGbRbmmk6opMBh3roE42KcotLFtqp0RRwLtcBRNtCdsrVsjiI1Lqz/lH+T61sGjSjQ3CHMuZYSQJZo/KrvzgQXpkaCTdbObxHqb6/+i1qaVOfEsvjoiyzTxJADvSytVtcTjijhPEV6XskJVHE1Zgl+7rATr/pDQkw6DPCNBS1+Y6fy7GstZALQXwEDN/qhQI9kWkHijT8ns+i1vGg00Mk/6J75arLhqcodWsdeG/M/moWgqQAnlZAGVtJI1OgeF5fsPpXu4kctOfuZlGjVZXQNW34aOzm8r8S0eVZitPlbhcPiR4gT/aSMz/wd8lZlzZYsje/Jr8u/YtlwjjreZrGRmG8KMOzukV3lLmMppXFMvl4bxv6YFEmIuTsOhbLTwFgh7KYNjodLj/LsqRVfwz31PgWQFTEPICV7GCvgVlPRxnofqKSjgTWI4mxDhBpVcATvaoBl1L/6WLbFvBsoAUBItWwctO2xalKxF5szhGm8lccoc5MZr8kfE0uxMgsxz4er68iCID+rsCAQM=',
    LocalHttpProxyPort: httpPort,
    LocalSocksProxyPort: socksPort,
    ...(egressRegion ? { EgressRegion: egressRegion } : {}),
    DataRootDirectory: dataDir
  }

  const configPath = path.join(runDir, 'psiphon.config')
  writeFileSync(configPath, JSON.stringify(configPayload, null, 2), 'utf-8')

  try {
    child = spawn(bin, ['-config', configPath, '-dataRootDirectory', dataDir], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    const pid = child.pid
    setStatus({ pid, httpPort, socksPort, systemProxy: Boolean(pCfg.systemProxy) })

    const handleLine = (line: string): void => {
      const trimmed = line.trim()
      if (!trimmed) return
      try {
        const obj = JSON.parse(trimmed) as {
          noticeType?: string
          data?: Record<string, unknown>
        }
        if (!obj.noticeType) return

        switch (obj.noticeType) {
          case 'ListeningHttpProxyPort': {
            const port = Number(obj.data?.port) || httpPort
            setStatus({ httpPort: port })
            log('info', `HTTP-прокси слушает на 127.0.0.1:${port}`)
            break
          }
          case 'ListeningSocksProxyPort': {
            const port = Number(obj.data?.port) || socksPort
            setStatus({ socksPort: port })
            log('info', `SOCKS5-прокси слушает на 127.0.0.1:${port}`)
            break
          }
          case 'AvailableEgressRegions': {
            const regions = (obj.data?.regions as string[]) || []
            if (regions.length > 0) {
              setStatus({ availableRegions: regions })
            }
            break
          }
          case 'ConnectedServerRegion': {
            const region = String(obj.data?.region || '')
            setStatus({ connectedRegion: region })
            log('info', `Подключено к региону: ${region || 'Авто'}`)
            break
          }
          case 'Tunnels': {
            const count = Number(obj.data?.count) || 0
            if (count > 0 && status.state !== 'running') {
              setStatus({ state: 'running', startedAt: Date.now() })
              log('info', 'Psiphon туннель успешно установлен!')
              if (pCfg.systemProxy) {
                const vpnStatus = getVpnStatus()
                if (vpnStatus.state === 'running' && vpnStatus.tunMode) {
                  log('warn', 'VPN активен в режиме TUN — системный прокси не применен во избежание конфликта.')
                } else {
                  void setWindowsSystemProxy('127.0.0.1', httpPort)
                  systemProxyApplied = true
                  log('info', `Системный прокси Windows активирован (127.0.0.1:${httpPort})`)
                }
              }
            }
            break
          }
          case 'EstablishTunnelTimeout': {
            log('warn', 'Таймаут подключения Psiphon к узлам сети')
            break
          }
          default:
            break
        }
      } catch {
        // Not a JSON notice
        if (trimmed.length > 0 && !trimmed.startsWith('{')) {
          log('debug', trimmed)
        }
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

    child.on('error', (err) => {
      log('error', `Ошибка процесса Psiphon: ${err.message}`)
      setStatus({ state: 'error', lastError: err.message })
    })

    child.on('exit', (code, signal) => {
      if (systemProxyApplied) {
        void disableWindowsSystemProxy()
        systemProxyApplied = false
      }
      child = null
      if (stopRequested) {
        setStatus({ state: 'stopped', pid: undefined })
        log('info', 'Psiphon остановлен')
      } else {
        const msg = `Psiphon аварийно завершился (код: ${code ?? 'none'}, сигнал: ${signal ?? 'none'})`
        log('warn', msg)
        setStatus({ state: 'stopped', pid: undefined, lastError: msg })
      }
    })

    // Update config persistence
    await patchAppConfig({
      psiphon: {
        ...pCfg,
        enabled: true
      }
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log('error', `Не удалось запустить Psiphon: ${msg}`)
    setStatus({ state: 'error', lastError: msg })
  }
}

export async function stopPsiphon(): Promise<void> {
  if (status.state === 'stopped') return
  stopRequested = true
  setStatus({ state: 'stopping' })

  if (systemProxyApplied) {
    await disableWindowsSystemProxy()
    systemProxyApplied = false
  }

  if (child && child.pid) {
    try {
      child.kill()
    } catch {
      // ignore
    }
  }
  await killStalePsiphon()

  child = null
  setStatus({ state: 'stopped', pid: undefined })

  const cfg = await getAppConfig()
  if (cfg.psiphon) {
    await patchAppConfig({
      psiphon: {
        ...cfg.psiphon,
        enabled: false
      }
    })
  }
}

export async function restartPsiphon(): Promise<void> {
  await stopPsiphon()
  await startPsiphon()
}

export async function togglePsiphonSystemProxy(enable: boolean): Promise<void> {
  const cfg = await getAppConfig()
  const pCfg = cfg.psiphon ?? {
    enabled: false,
    autoStart: false,
    httpPort: 20807,
    socksPort: 20808,
    egressRegion: '',
    systemProxy: false
  }

  await patchAppConfig({
    psiphon: {
      ...pCfg,
      systemProxy: enable
    }
  })
  setStatus({ systemProxy: enable })

  if (status.state === 'running') {
    if (enable) {
      const vpnStatus = getVpnStatus()
      if (vpnStatus.state === 'running' && vpnStatus.tunMode) {
        log('warn', 'Внимание: Включен системный прокси при активном TUN-адаптере VPN. Трафик браузеров будет направлен через Psiphon.')
      }
      await setWindowsSystemProxy('127.0.0.1', status.httpPort || 20807)
      systemProxyApplied = true
      log('info', `Системный прокси Windows активирован (127.0.0.1:${status.httpPort || 20807})`)
    } else {
      await disableWindowsSystemProxy()
      systemProxyApplied = false
      log('info', 'Системный прокси Windows отключен')
    }
  }
}

export async function setPsiphonRegion(region: string): Promise<void> {
  const cfg = await getAppConfig()
  const pCfg = cfg.psiphon ?? {
    enabled: false,
    autoStart: false,
    httpPort: 20807,
    socksPort: 20808,
    egressRegion: '',
    systemProxy: false
  }

  await patchAppConfig({
    psiphon: {
      ...pCfg,
      egressRegion: region
    }
  })

  if (status.state === 'running') {
    await restartPsiphon()
  }
}
