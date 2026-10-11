import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { app } from 'electron'
import { getAppConfig, patchAppConfig } from '../config'
import { userOverridesPath, zapretBundleDir } from '../utils/dirs'
import { loadUserOverrides, type UserCollectionOverridesMap } from './zapret-files'
import { appLog } from '../utils/app-logger'

export interface GhosterNetBackup {
  format: 'ghosternet-backup'
  version: string
  appVersion: string
  exportedAt: number
  config: AppConfig
  overrides: UserCollectionOverridesMap
  userLists: Record<string, string>
}

const USER_LIST_FILENAMES = [
  'list-general-user.txt',
  'list-exclude-user.txt',
  'ipset-all-user.txt',
  'ipset-exclude-user.txt'
]

export async function exportFullConfig(): Promise<string> {
  const config = await getAppConfig()
  const overrides = loadUserOverrides()
  const userLists: Record<string, string> = {}

  const listsDir = path.join(zapretBundleDir(), 'lists')
  for (const filename of USER_LIST_FILENAMES) {
    const full = path.join(listsDir, filename)
    if (existsSync(full)) {
      try {
        userLists[filename] = readFileSync(full, 'utf8')
      } catch {
        // ignore
      }
    }
  }

  const payload: GhosterNetBackup = {
    format: 'ghosternet-backup',
    version: '2.3.0',
    appVersion: app.getVersion(),
    exportedAt: Date.now(),
    config,
    overrides,
    userLists
  }

  appLog('info', 'Экспорт конфигурации и профилей GhosterNet сформирован')
  return JSON.stringify(payload, null, 2)
}

export async function importFullConfig(
  rawJson: string
): Promise<{ ok: boolean; activeProfileId?: string; message: string }> {
  let data: GhosterNetBackup
  try {
    data = JSON.parse(rawJson) as GhosterNetBackup
  } catch {
    throw new Error('Некорректный JSON файл резервной копии')
  }

  if (!data || typeof data !== 'object' || (!data.config && !(data as any).appTheme)) {
    throw new Error('Файл не содержит корректных настроек GhosterNet')
  }

  const importedConfig = data.config || (data as unknown as AppConfig)

  // 1. Restore user overrides if present
  if (data.overrides) {
    try {
      const p = userOverridesPath()
      const dir = path.dirname(p)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      writeFileSync(p, JSON.stringify(data.overrides, null, 2), 'utf8')
    } catch (e) {
      appLog('warn', `Восстановление пользовательских списков не удалось: ${e}`)
    }
  }

  // 2. Restore user raw list text files
  if (data.userLists && typeof data.userLists === 'object') {
    const listsDir = path.join(zapretBundleDir(), 'lists')
    if (!existsSync(listsDir)) mkdirSync(listsDir, { recursive: true })
    for (const [filename, content] of Object.entries(data.userLists)) {
      if (typeof content === 'string') {
        try {
          writeFileSync(path.join(listsDir, filename), content, 'utf8')
        } catch {
          // ignore
        }
      }
    }
  }

  // 3. Patch application config
  await patchAppConfig(importedConfig)
  appLog('info', `Импорт конфигурации GhosterNet успешно применён (версия бэкапа: ${data.version ?? 'legacy'})`)

  return {
    ok: true,
    activeProfileId: importedConfig.activeProfileId,
    message: 'Настройки и списки успешно импортированы'
  }
}
