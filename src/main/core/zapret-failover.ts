import { BrowserWindow } from 'electron'
import https from 'node:https'
import { getAppConfig, patchAppConfig } from '../config'
import { getZapretStatus, restartZapret } from './zapret'

let failoverTimer: ReturnType<typeof setInterval> | null = null
let consecutiveFails = 0
let lastSwitchTime = 0
let isChecking = false

const PROBE_URLS = [
  'https://www.youtube.com/generate_204',
  'https://discord.com/api/v9/gateway',
  'https://updates.discord.com'
]

// Fallback sequence of vetted strategies known to work across different ISPs
const FALLBACK_STRATEGIES = [
  'general (alt11).bat',
  'general (alt).bat',
  'general (fake tls auto).bat',
  'general (alt2).bat',
  'general (fake tls auto alt).bat',
  'general.bat'
]

function broadcast(channel: string, ...args: unknown[]): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, ...args)
  }
}

async function probeTarget(url: string, timeoutMs = 3500): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const req = https.request(
        url,
        {
          method: 'HEAD',
          timeout: timeoutMs,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
          }
        },
        (res) => {
          res.resume()
          // Any response < 500 means connectivity reached the target through DPI
          resolve(Boolean(res.statusCode && res.statusCode < 500))
        }
      )
      req.on('error', () => resolve(false))
      req.on('timeout', () => {
        req.destroy()
        resolve(false)
      })
      req.end()
    } catch {
      resolve(false)
    }
  })
}

export async function checkZapretHealth(): Promise<boolean> {
  if (isChecking) return true
  isChecking = true
  try {
    for (const url of PROBE_URLS) {
      const ok = await probeTarget(url)
      if (ok) return true
    }
    return false
  } finally {
    isChecking = false
  }
}

export async function triggerFailoverSwitch(): Promise<string | null> {
  const cfg = await getAppConfig()
  const current = cfg.zapret?.activeStrategy ?? 'general.bat'
  const favs = cfg.zapret?.favoriteStrategies ?? []

  // Combine favorites and vetted fallback strategies
  const candidatePool = Array.from(new Set([...favs, ...FALLBACK_STRATEGIES]))
  const nextCandidates = candidatePool.filter((s) => s.toLowerCase() !== current.toLowerCase())

  if (nextCandidates.length === 0) return null

  const nextStrategy = nextCandidates[0]

  await patchAppConfig({
    zapret: {
      ...(cfg.zapret as ZapretConfig),
      activeStrategy: nextStrategy
    }
  })

  lastSwitchTime = Date.now()
  consecutiveFails = 0

  broadcast('log', {
    time: Date.now(),
    type: 'warn',
    source: 'zapret',
    payload: `[Auto-Failover] Обнаружена блокировка трафика! Автоматическое переключение со стратегии "${current}" на "${nextStrategy}"...`
  })

  const status = getZapretStatus()
  if (status.state === 'running') {
    await restartZapret()
  }

  broadcast('zapret:failoverSwitched', {
    previous: current,
    current: nextStrategy,
    timestamp: Date.now()
  })

  return nextStrategy
}

export function startZapretFailoverWatcher(intervalMs = 20000): void {
  if (failoverTimer) clearInterval(failoverTimer)

  failoverTimer = setInterval(async () => {
    try {
      const cfg = await getAppConfig()
      if (!cfg.zapret?.autoFailover) return

      const status = getZapretStatus()
      if (status.state !== 'running') return

      // Don't switch more often than once every 45 seconds
      if (Date.now() - lastSwitchTime < 45000) return

      const isHealthy = await checkZapretHealth()
      if (isHealthy) {
        consecutiveFails = 0
      } else {
        consecutiveFails++
        if (consecutiveFails >= 2) {
          await triggerFailoverSwitch()
        }
      }
    } catch {
      // ignore
    }
  }, intervalMs)
}

export function stopZapretFailoverWatcher(): void {
  if (failoverTimer) {
    clearInterval(failoverTimer)
    failoverTimer = null
  }
}
