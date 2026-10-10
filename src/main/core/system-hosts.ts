import { existsSync, readFileSync, writeFileSync } from 'fs'
import { spawnSync } from 'child_process'
import path from 'path'
import { zapretBundleDir } from '../utils/dirs'
import { getAppConfig, patchAppConfig } from '../config'
import { ALWAYS_APPLY_SERVICE_IDS, SERVICE_RULES } from './service-catalog'
import { listInstalledMods } from './mods'
import { appLog } from '../utils/app-logger'

const SYSTEM_HOSTS_PATH = 'C:\\Windows\\System32\\drivers\\etc\\hosts'
const MARKER_START = '# === GhosterNet START ==='
const MARKER_END = '# === GhosterNet END ==='
const LEGACY_START = '# === Zapret Zen START ==='
const LEGACY_END = '# === Zapret Zen END ==='

export interface SystemHostsState {
  managed: boolean
  activeInFile: boolean
  entryCount: number
  entries: string[]
  path: string
}

export async function collectManagedHostsEntries(): Promise<string[]> {
  const cfg = await getAppConfig()
  const selectedIds = new Set<string>([
    ...ALWAYS_APPLY_SERVICE_IDS,
    ...(cfg.zapret?.selectedServices ?? [])
  ])

  const entries: string[] = []
  const seen = new Set<string>()

  const addLine = (raw: string): void => {
    const trimmed = raw.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const normalized = trimmed.split(/\s+/).join(' ').toLowerCase()
    if (seen.has(normalized)) return
    seen.add(normalized)
    entries.push(trimmed.split(/\s+/).join(' '))
  }

  // 1. Selected service rules hosts
  for (const id of selectedIds) {
    const rule = SERVICE_RULES[id]
    if (!rule?.hosts) continue
    for (const h of rule.hosts) addLine(h)
  }

  // 2. Enabled mods hosts
  try {
    const mods = await listInstalledMods()
    for (const mod of mods) {
      if (!mod.enabled || !mod.path || !existsSync(mod.path)) continue
      const candidates = [
        path.join(mod.path, 'hosts'),
        path.join(mod.path, 'lists', 'hosts.txt'),
        path.join(mod.path, 'lists', 'hosts')
      ]
      for (const c of candidates) {
        if (existsSync(c)) {
          const text = readFileSync(c, 'utf8')
          for (const line of text.split(/\r?\n/)) addLine(line)
        }
      }
    }
  } catch {
    /* noop */
  }

  // 3. Fallback to .service/hosts in bundle if selected services include discord/github/telegram
  const bundleHostsPath = path.join(zapretBundleDir(), '.service', 'hosts')
  if (existsSync(bundleHostsPath)) {
    try {
      const text = readFileSync(bundleHostsPath, 'utf8')
      for (const line of text.split(/\r?\n/)) {
        const lower = line.toLowerCase()
        if (
          (lower.includes('github') && selectedIds.has('github')) ||
          (lower.includes('telegram') && (selectedIds.has('telegram') || selectedIds.has('telegram-desktop'))) ||
          (lower.includes('telesco.pe') && (selectedIds.has('telegram') || selectedIds.has('telegram-desktop'))) ||
          (lower.includes('t.me') && (selectedIds.has('telegram') || selectedIds.has('telegram-desktop'))) ||
          (lower.includes('discord') && selectedIds.has('discord'))
        ) {
          addLine(line)
        }
      }
    } catch {
      /* noop */
    }
  }

  return entries
}

function stripBlock(lines: string[], startMarker: string, endMarker: string): string[] {
  const startIdx = lines.findIndex((l) => l.trim() === startMarker)
  const endIdx = lines.findIndex((l) => l.trim() === endMarker)
  if (startIdx >= 0 && endIdx > startIdx) {
    return [...lines.slice(0, startIdx), ...lines.slice(endIdx + 1)]
  }
  if (startIdx >= 0) {
    return lines.slice(0, startIdx)
  }
  return lines
}

function flushDnsCache(): void {
  if (process.platform !== 'win32') return
  try {
    spawnSync('ipconfig.exe', ['/flushdns'], { windowsHide: true, timeout: 4000 })
  } catch {
    /* noop */
  }
}

export async function getSystemHostsState(): Promise<SystemHostsState> {
  const cfg = await getAppConfig()
  const entries = await collectManagedHostsEntries()
  let activeInFile = false
  if (process.platform === 'win32' && existsSync(SYSTEM_HOSTS_PATH)) {
    try {
      const raw = readFileSync(SYSTEM_HOSTS_PATH, 'utf8')
      activeInFile = raw.includes(MARKER_START) && raw.includes(MARKER_END)
    } catch {
      /* noop */
    }
  }
  return {
    managed: Boolean(cfg.zapret?.systemHostsManaged),
    activeInFile,
    entryCount: entries.length,
    entries,
    path: SYSTEM_HOSTS_PATH
  }
}

export async function applySystemHosts(): Promise<SystemHostsState> {
  if (process.platform !== 'win32') {
    throw new Error('Управление системным файлом hosts поддерживается только на Windows')
  }
  const entries = await collectManagedHostsEntries()
  let content = ''
  if (existsSync(SYSTEM_HOSTS_PATH)) {
    content = readFileSync(SYSTEM_HOSTS_PATH, 'utf8')
  }
  let lines = content.split(/\r?\n/)
  lines = stripBlock(lines, MARKER_START, MARKER_END)
  lines = stripBlock(lines, LEGACY_START, LEGACY_END)

  while (lines.length > 0 && !lines[lines.length - 1].trim()) {
    lines.pop()
  }

  if (entries.length > 0) {
    if (lines.length > 0) lines.push('')
    lines.push(MARKER_START)
    for (const e of entries) lines.push(e)
    lines.push(MARKER_END)
  }
  lines.push('')

  writeFileSync(SYSTEM_HOSTS_PATH, lines.join('\r\n'), 'utf8')
  flushDnsCache()

  const cfg = await getAppConfig()
  await patchAppConfig({
    zapret: {
      ...(cfg.zapret as ZapretConfig),
      systemHostsManaged: true
    }
  })
  appLog('info', `Системный файл hosts обновлён (${entries.length} записей)`)
  return getSystemHostsState()
}

export async function revertSystemHosts(): Promise<SystemHostsState> {
  if (process.platform === 'win32' && existsSync(SYSTEM_HOSTS_PATH)) {
    try {
      const content = readFileSync(SYSTEM_HOSTS_PATH, 'utf8')
      let lines = content.split(/\r?\n/)
      lines = stripBlock(lines, MARKER_START, MARKER_END)
      lines = stripBlock(lines, LEGACY_START, LEGACY_END)
      while (lines.length > 0 && !lines[lines.length - 1].trim()) {
        lines.pop()
      }
      lines.push('')
      writeFileSync(SYSTEM_HOSTS_PATH, lines.join('\r\n'), 'utf8')
      flushDnsCache()
      appLog('info', 'Записи GhosterNet удалены из системного файла hosts')
    } catch (e) {
      appLog('error', `Не удалось очистить системный hosts: ${e}`)
      throw e
    }
  }
  const cfg = await getAppConfig()
  await patchAppConfig({
    zapret: {
      ...(cfg.zapret as ZapretConfig),
      systemHostsManaged: false
    }
  })
  return getSystemHostsState()
}
