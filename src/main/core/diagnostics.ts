import { spawnSync } from 'child_process'
import { existsSync, readdirSync, rmSync, statSync } from 'fs'
import path from 'path'
import { app } from 'electron'
import { zapretBinaryPath, zapretBundleDir } from '../utils/dirs'
import { isRunningAsAdmin } from '../utils/elevation'
import { applySystemHosts } from './system-hosts'
import { appLog } from '../utils/app-logger'

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
