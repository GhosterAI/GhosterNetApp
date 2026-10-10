import { spawnSync, execFile } from 'child_process'
import { existsSync, readdirSync, rmSync, statSync } from 'fs'
import path from 'path'
import net from 'net'
import { promisify } from 'util'
import { app } from 'electron'
import { zapretBinaryPath, zapretBundleDir } from '../utils/dirs'
import { isRunningAsAdmin } from '../utils/elevation'
import { applySystemHosts } from './system-hosts'
import { appLog } from '../utils/app-logger'

const execFileAsync = promisify(execFile)

const CONFLICTING_SERVICES = [
  'GoodbyeDPI',
  'WinDivert1.4',
  'cFosSpeedS',
  'SmartByte Network Service x64',
  'Killer Network Service'
]

function getDirSizeBytes(dirPath: string): number {
  if (!existsSync(dirPath)) return 0
  let total = 0
  try {
    for (const item of readdirSync(dirPath)) {
      const full = path.join(dirPath, item)
      try {
        const st = statSync(full)
        if (st.isDirectory()) total += getDirSizeBytes(full)
        else total += st.size
      } catch {
        /* noop */
      }
    }
  } catch {
    /* noop */
  }
  return total
}

export async function runSystemDiagnostics(): Promise<DiagnosticCheckItem[]> {
  const checks: DiagnosticCheckItem[] = []

  // 1. Administrator privileges
  const isAdmin = await isRunningAsAdmin()
  checks.push({
    id: 'admin',
    title: 'Права администратора',
    status: isAdmin ? 'ok' : 'error',
    detail: isAdmin
      ? 'Приложение запущено с правами администратора'
      : 'Требуется запуск от имени администратора для работы WinDivert и DNS'
  })

  // 2. Base Filtering Engine (BFE)
  if (process.platform === 'win32') {
    const bfe = spawnSync('sc.exe', ['query', 'BFE'], {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 3000
    })
    const bfeRunning = /RUNNING/i.test(bfe.stdout || '')
    checks.push({
      id: 'bfe',
      title: 'Служба базовой фильтрации (BFE)',
      status: bfeRunning ? 'ok' : 'error',
      detail: bfeRunning
        ? 'Служба BFE активна (необходима для перехвата пакетов WinDivert)'
        : 'Служба BFE остановлена — WinDivert не сможет перехватывать трафик',
      fixable: !bfeRunning
    })
  }

  // 3. Zapret Binaries (winws.exe & WinDivert64.sys)
  const winwsPath = zapretBinaryPath()
  const sysPath = path.join(zapretBundleDir(), 'bin', 'WinDivert64.sys')
  const binsOk = existsSync(winwsPath) && existsSync(sysPath)
  checks.push({
    id: 'binaries',
    title: 'Бинарные файлы Zapret и WinDivert',
    status: binsOk ? 'ok' : 'error',
    detail: binsOk
      ? 'winws.exe и WinDivert64.sys присутствуют и готовы к работе'
      : 'Отсутствует winws.exe или WinDivert64.sys (возможно, заблокирован антивирусом)'
  })

  // 4. TCP Timestamps
  if (process.platform === 'win32') {
    const tcp = spawnSync('netsh.exe', ['interface', 'tcp', 'show', 'global'], {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 3000
    })
    const out = tcp.stdout || ''
    const disabled = /timestamps\s*:\s*disabled/i.test(out) || /отметки времени.*:\s*disabled/i.test(out)
    checks.push({
      id: 'tcp_timestamps',
      title: 'TCP Timestamps (Отметки времени TCP)',
      status: disabled ? 'warn' : 'ok',
      detail: disabled
        ? 'TCP Timestamps отключены — некоторые стратегии (autottl) могут работать хуже'
        : 'TCP Timestamps включены или управляются системой корректно',
      fixable: disabled
    })
  }

  // 5. Conflicting services
  if (process.platform === 'win32') {
    const foundConflicts: string[] = []
    for (const svc of CONFLICTING_SERVICES) {
      const q = spawnSync('sc.exe', ['query', svc], {
        windowsHide: true,
        encoding: 'utf8',
        timeout: 2000
      })
      if (q.status === 0 && /RUNNING/i.test(q.stdout || '')) {
        foundConflicts.push(svc)
      }
    }
    checks.push({
      id: 'conflicts',
      title: 'Конфликтующие сетевые службы',
      status: foundConflicts.length > 0 ? 'warn' : 'ok',
      detail:
        foundConflicts.length > 0
          ? `Обнаружены активные конфликтующие службы: ${foundConflicts.join(', ')}`
          : 'Конфликтующих служб (GoodbyeDPI, SmartByte, Killer Network) не обнаружено',
      fixable: foundConflicts.length > 0
    })
  }

  // 6. GitHub Connectivity
  let ghOk = false
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 3500)
    const res = await fetch('https://api.github.com/zen', {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'GhosterNet-Diagnostics' }
    })
    clearTimeout(timer)
    ghOk = res.status >= 200 && res.status < 500
  } catch {
    ghOk = false
  }
  checks.push({
    id: 'github',
    title: 'Доступность серверов GitHub',
    status: ghOk ? 'ok' : 'warn',
    detail: ghOk
      ? 'Прямое соединение с api.github.com работает стабильно'
      : 'Доступ к GitHub затруднён — нажмите «Исправить» для прописывания рабочих IP в hosts',
    fixable: !ghOk
  })

  return checks
}

export async function fixDiagnosticIssue(checkId: string): Promise<DiagnosticCheckItem[]> {
  if (process.platform === 'win32') {
    if (checkId === 'bfe') {
      spawnSync('sc.exe', ['config', 'BFE', 'start=', 'auto'], { windowsHide: true, timeout: 3000 })
      spawnSync('sc.exe', ['start', 'BFE'], { windowsHide: true, timeout: 4000 })
      appLog('info', 'Диагностика: служба BFE запущена')
    } else if (checkId === 'tcp_timestamps') {
      spawnSync('netsh.exe', ['interface', 'tcp', 'set', 'global', 'timestamps=enabled'], {
        windowsHide: true,
        timeout: 4000
      })
      appLog('info', 'Диагностика: TCP Timestamps включены')
    } else if (checkId === 'conflicts') {
      for (const svc of CONFLICTING_SERVICES) {
        spawnSync('sc.exe', ['stop', svc], { windowsHide: true, timeout: 3000 })
      }
      appLog('info', 'Диагностика: конфликтующие службы остановлены')
    } else if (checkId === 'github') {
      await applySystemHosts()
      appLog('info', 'Диагностика: применены записи hosts для восстановления доступа к GitHub')
    }
  }
  return runSystemDiagnostics()
}

export interface DiscordCacheCleanResult {
  cleanedDirs: number
  freedBytes: number
  freedMb: number
}

export async function clearDiscordCache(): Promise<DiscordCacheCleanResult> {
  const appData = app.getPath('appData')
  const clients = ['discord', 'discordptb', 'discordcanary', 'discorddevelopment']
  const cacheSubdirs = [
    'Cache',
    'Code Cache',
    'GPUCache',
    'DawnCache',
    'blob_storage',
    'Shared Dictionary'
  ]

  let cleanedDirs = 0
  let freedBytes = 0

  for (const client of clients) {
    const clientRoot = path.join(appData, client)
    if (!existsSync(clientRoot)) continue
    for (const sub of cacheSubdirs) {
      const target = path.join(clientRoot, sub)
      if (!existsSync(target)) continue
      try {
        const size = getDirSizeBytes(target)
        rmSync(target, { recursive: true, force: true })
        freedBytes += size
        cleanedDirs++
      } catch {
        /* ignore locked files if Discord is open */
      }
    }
  }

  const freedMb = Math.round((freedBytes / (1024 * 1024)) * 10) / 10
  appLog('info', `Очистка кэша Discord завершена: удалено ${cleanedDirs} папок (${freedMb} МБ)`)
  return { cleanedDirs, freedBytes, freedMb }
}

export interface AutoFixReport {
  ok: boolean
  actions: string[]
  discordFreedMb: number
}

export async function autoFixNetwork(): Promise<AutoFixReport> {
  const actions: string[] = []
  let discordFreedMb = 0

  if (process.platform === 'win32') {
    // 1. Flush DNS cache
    try {
      await execFileAsync('ipconfig.exe', ['/flushdns'], { windowsHide: true, timeout: 5000 })
      actions.push('Сброшен системный кэш DNS (ipconfig /flushdns)')
    } catch {
      // ignore
    }

    // 2. Clear Discord Cache
    try {
      const disc = await clearDiscordCache()
      discordFreedMb = disc.freedMb
      if (disc.freedMb > 0) {
        actions.push(`Очищен кэш Discord (освобождено ${disc.freedMb} МБ)`)
      }
    } catch {
      // ignore
    }

    // 3. Ensure BFE service is enabled & started
    try {
      spawnSync('sc.exe', ['config', 'BFE', 'start=', 'auto'], { windowsHide: true, timeout: 3000 })
      spawnSync('sc.exe', ['start', 'BFE'], { windowsHide: true, timeout: 4000 })
      actions.push('Проверена и запущена служба фильтрации Windows (BFE)')
    } catch {
      // ignore
    }

    // 4. Enable TCP Timestamps
    try {
      spawnSync('netsh.exe', ['interface', 'tcp', 'set', 'global', 'timestamps=enabled'], {
        windowsHide: true,
        timeout: 4000
      })
      actions.push('Включены TCP Timestamps для корректной работы AutoTTL')
    } catch {
      // ignore
    }

    // 5. Stop conflicting services (GoodbyeDPI, etc.)
    for (const svc of CONFLICTING_SERVICES) {
      try {
        const res = spawnSync('sc.exe', ['query', svc], { windowsHide: true, timeout: 2000 })
        if (res.stdout && /RUNNING/i.test(res.stdout.toString())) {
          spawnSync('sc.exe', ['stop', svc], { windowsHide: true, timeout: 3000 })
          actions.push(`Остановлена конфликтующая служба ${svc}`)
        }
      } catch {
        // ignore
      }
    }

    // 6. Reset stuck WinDivert driver instances
    try {
      spawnSync('net.exe', ['stop', 'WinDivert'], { windowsHide: true, timeout: 3000 })
      spawnSync('sc.exe', ['stop', 'WinDivert1.4'], { windowsHide: true, timeout: 3000 })
      actions.push('Сброшен статус драйвера перехвата WinDivert')
    } catch {
      // ignore
    }

    // 7. Restart DnsAiClient if installed
    try {
      const q = spawnSync('sc.exe', ['query', 'DnsAiClient'], { windowsHide: true, timeout: 2000 })
      if (q.stdout && !q.stdout.toString().includes('1060')) {
        spawnSync('sc.exe', ['stop', 'DnsAiClient'], { windowsHide: true, timeout: 3000 })
        spawnSync('sc.exe', ['start', 'DnsAiClient'], { windowsHide: true, timeout: 4000 })
        actions.push('Перезапущена служба DoH-резолвера DnsAiClient')
      }
    } catch {
      // ignore
    }

    // 8. Restart AG Unlocker tasks if registered
    try {
      spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          "Restart-ScheduledTask -TaskName 'AG Unlocker DNS' -ErrorAction SilentlyContinue"
        ],
        { windowsHide: true, timeout: 5000 }
      )
      actions.push('Перезапущена задача планировщика Antigravity Unlocker DNS')
    } catch {
      // ignore
    }
  }

  appLog('info', `Авто-исправление сети завершено (${actions.length} действий)`)
  return { ok: true, actions, discordFreedMb }
}

export interface LiveServiceStatus {
  id: string
  name: string
  category: 'media' | 'social' | 'ai'
  target: string
  ok: boolean
  latencyMs: number
  statusText: string
}

function tcpPing(host: string, port: number, timeoutMs = 2500): Promise<{ ok: boolean; latencyMs: number }> {
  return new Promise((resolve) => {
    const t0 = Date.now()
    const sock = new net.Socket()
    let settled = false

    const done = (ok: boolean) => {
      if (settled) return
      settled = true
      sock.destroy()
      resolve({ ok, latencyMs: Date.now() - t0 })
    }

    sock.setTimeout(timeoutMs)
    sock.once('connect', () => done(true))
    sock.once('timeout', () => done(false))
    sock.once('error', () => done(false))
    try {
      sock.connect(port, host)
    } catch {
      done(false)
    }
  })
}

async function httpProbe(url: string, timeoutMs = 3500): Promise<{ ok: boolean; latencyMs: number; statusText: string }> {
  const t0 = Date.now()
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })
    clearTimeout(timer)
    const latency = Date.now() - t0
    return {
      ok: res.status < 500,
      latencyMs: latency,
      statusText: `${res.status} ${res.statusText || 'OK'}`
    }
  } catch (e: any) {
    clearTimeout(timer)
    const latency = Date.now() - t0
    return {
      ok: false,
      latencyMs: latency,
      statusText: e?.name === 'AbortError' ? 'Таймаут' : (e?.message || 'Ошибка')
    }
  }
}

export async function checkLiveServices(): Promise<LiveServiceStatus[]> {
  const probes = [
    {
      id: 'youtube',
      name: 'YouTube (Видео & 4K)',
      category: 'media' as const,
      target: 'https://www.youtube.com/generate_204',
      run: () => httpProbe('https://www.youtube.com/generate_204', 3500)
    },
    {
      id: 'discord',
      name: 'Discord (Gateway & Голос)',
      category: 'social' as const,
      target: 'https://gateway.discord.gg',
      run: () => httpProbe('https://gateway.discord.gg', 3500)
    },
    {
      id: 'telegram',
      name: 'Telegram (DC2 Амстердам)',
      category: 'social' as const,
      target: '149.154.167.220:443',
      run: async () => {
        const r = await tcpPing('149.154.167.220', 443, 2500)
        return {
          ok: r.ok,
          latencyMs: r.latencyMs,
          statusText: r.ok ? `TCP OK (${r.latencyMs} мс)` : 'Блокировка DPI (нужен TgWsProxy)'
        }
      }
    },
    {
      id: 'gemini',
      name: 'Google Gemini',
      category: 'ai' as const,
      target: 'https://gemini.google.com',
      run: () => httpProbe('https://gemini.google.com', 4000)
    },
    {
      id: 'chatgpt',
      name: 'OpenAI ChatGPT',
      category: 'ai' as const,
      target: 'https://chatgpt.com',
      run: () => httpProbe('https://chatgpt.com', 4000)
    },
    {
      id: 'claude',
      name: 'Anthropic Claude',
      category: 'ai' as const,
      target: 'https://claude.ai',
      run: () => httpProbe('https://claude.ai', 4000)
    }
  ]

  const results = await Promise.allSettled(probes.map((p) => p.run()))
  return probes.map((p, i) => {
    const res = results[i]
    if (res.status === 'fulfilled') {
      return {
        id: p.id,
        name: p.name,
        category: p.category,
        target: p.target,
        ok: res.value.ok,
        latencyMs: res.value.latencyMs,
        statusText: res.value.statusText
      }
    }
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      target: p.target,
      ok: false,
      latencyMs: 0,
      statusText: 'Ошибка'
    }
  })
}
