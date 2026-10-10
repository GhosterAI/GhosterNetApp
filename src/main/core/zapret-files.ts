import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { userOverridesPath, zapretBundleDir } from '../utils/dirs'
import { appLog } from '../utils/app-logger'

export type ZapretListCollectionKey = 'domains' | 'exclude_domains' | 'all_ips' | 'ips'

export interface UserCollectionOverride {
  added: string[]
  removed: string[]
}

export type UserCollectionOverridesMap = Record<ZapretListCollectionKey, UserCollectionOverride>

export interface ZapretCollectionSnapshot {
  key: ZapretListCollectionKey
  title: string
  filename: string
  userFilename: string
  userEntries: string[]
  baseCount: number
  added: string[]
  removed: string[]
}

const COLLECTION_MAPPING: Record<
  ZapretListCollectionKey,
  { title: string; filename: string; userFilename: string }
> = {
  domains: {
    title: 'Домены для обхода (list-general)',
    filename: 'list-general.txt',
    userFilename: 'list-general-user.txt'
  },
  exclude_domains: {
    title: 'Исключения доменов (list-exclude)',
    filename: 'list-exclude.txt',
    userFilename: 'list-exclude-user.txt'
  },
  all_ips: {
    title: 'IP и подсети для обхода (ipset-all)',
    filename: 'ipset-all.txt',
    userFilename: 'ipset-all-user.txt'
  },
  ips: {
    title: 'Исключения IP и подсетей (ipset-exclude)',
    filename: 'ipset-exclude.txt',
    userFilename: 'ipset-exclude-user.txt'
  }
}

export function loadUserOverrides(): UserCollectionOverridesMap {
  const defaultMap: UserCollectionOverridesMap = {
    domains: { added: [], removed: [] },
    exclude_domains: { added: [], removed: [] },
    all_ips: { added: [], removed: [] },
    ips: { added: [], removed: [] }
  }
  const p = userOverridesPath()
  if (!existsSync(p)) return defaultMap
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8')) as Partial<UserCollectionOverridesMap>
    for (const k of Object.keys(defaultMap) as ZapretListCollectionKey[]) {
      const item = raw?.[k]
      if (item && typeof item === 'object') {
        defaultMap[k] = {
          added: Array.isArray(item.added) ? item.added.map((s) => String(s).trim()).filter(Boolean) : [],
          removed: Array.isArray(item.removed) ? item.removed.map((s) => String(s).trim()).filter(Boolean) : []
        }
      }
    }
    return defaultMap
  } catch {
    return defaultMap
  }
}

export function saveUserOverrides(map: UserCollectionOverridesMap): void {
  const p = userOverridesPath()
  mkdirSync(path.dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(map, null, 2) + '\n', 'utf8')
}

function readCleanLines(filePath: string): string[] {
  if (!existsSync(filePath)) return []
  try {
    return readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'))
  } catch {
    return []
  }
}

export function getZapretCollections(): ZapretCollectionSnapshot[] {
  const listsDir = path.join(zapretBundleDir(), 'lists')
  mkdirSync(listsDir, { recursive: true })
  const overrides = loadUserOverrides()

  return (Object.keys(COLLECTION_MAPPING) as ZapretListCollectionKey[]).map((key) => {
    const meta = COLLECTION_MAPPING[key]
    const baseLines = readCleanLines(path.join(listsDir, meta.filename))
    const userLines = readCleanLines(path.join(listsDir, meta.userFilename))
    const ov = overrides[key] ?? { added: [], removed: [] }
    const combinedUser = Array.from(new Set([...userLines, ...ov.added]))
    return {
      key,
      title: meta.title,
      filename: meta.filename,
      userFilename: meta.userFilename,
      userEntries: combinedUser,
      baseCount: baseLines.length,
      added: ov.added,
      removed: ov.removed
    }
  })
}

export function saveZapretUserCollection(
  key: ZapretListCollectionKey,
  entries: string[]
): ZapretCollectionSnapshot[] {
  const meta = COLLECTION_MAPPING[key]
  if (!meta) throw new Error(`Неизвестная коллекция: ${key}`)

  const cleaned = Array.from(
    new Set(
      entries
        .flatMap((line) => line.split(/[\r\n,;]+/))
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith('#'))
    )
  )

  const listsDir = path.join(zapretBundleDir(), 'lists')
  mkdirSync(listsDir, { recursive: true })
  const userFile = path.join(listsDir, meta.userFilename)
  writeFileSync(userFile, cleaned.length > 0 ? cleaned.join('\n') + '\n' : '', 'utf8')

  const overrides = loadUserOverrides()
  overrides[key] = {
    added: cleaned,
    removed: overrides[key]?.removed ?? []
  }
  saveUserOverrides(overrides)
  appLog('info', `Обновлён пользовательский список ${meta.userFilename} (${cleaned.length} записей)`)
  return getZapretCollections()
}

export function readRawZapretListFile(filename: string): { filename: string; content: string } {
  const safeName = path.basename(filename)
  if (!safeName.endsWith('.txt')) {
    throw new Error('Разрешены только файлы списков .txt')
  }
  const filePath = path.join(zapretBundleDir(), 'lists', safeName)
  const content = existsSync(filePath) ? readFileSync(filePath, 'utf8') : ''
  return { filename: safeName, content }
}

export function writeRawZapretListFile(
  filename: string,
  content: string
): { filename: string; lines: number } {
  const safeName = path.basename(filename)
  if (!safeName.endsWith('.txt')) {
    throw new Error('Разрешены только файлы списков .txt')
  }
  const listsDir = path.join(zapretBundleDir(), 'lists')
  mkdirSync(listsDir, { recursive: true })
  const filePath = path.join(listsDir, safeName)
  const normalized = content.replace(/\r\n/g, '\n')
  writeFileSync(filePath, normalized.endsWith('\n') || !normalized ? normalized : normalized + '\n', 'utf8')
  const count = normalized.split('\n').filter((l) => l.trim().length > 0).length
  appLog('info', `Сохранён файл списка ${safeName} (${count} строк)`)
  return { filename: safeName, lines: count }
}
