import { readFile, writeFile, rename, copyFile, unlink } from 'fs/promises'
import { appConfigPath } from '../utils/dirs'
import { parseYaml, stringifyYaml } from '../utils/yaml'
import { deepMerge } from '../utils/merge'
import { defaultConfig, CONFIG_VERSION } from '../utils/template'
import { randomBytes } from 'crypto'
import { readFileSync, existsSync } from 'fs'
import { enableAutoRun, disableAutoRun } from '../sys/autoRun'

let appConfig: AppConfig | undefined
let writePromise: Promise<void> = Promise.resolve()

const VALID_THEMES = new Set(['light', 'dark', 'oled', 'night'])

function isValidConfig(c: unknown): c is AppConfig {
  return !!c && typeof c === 'object' && 'appTheme' in (c as object)
}

async function safeWriteConfig(content: string): Promise<void> {
  const configPath = appConfigPath()
  const tmpPath = `${configPath}.tmp`
  const backupPath = `${configPath}.backup`
  try {
    await writeFile(tmpPath, content, 'utf-8')
    if (existsSync(configPath)) {
      await copyFile(configPath, backupPath)
      if (process.platform === 'win32') {
        await unlink(configPath)
      }
    }
    if (existsSync(tmpPath)) {
      await rename(tmpPath, configPath)
    }
  } catch (e) {
    if (existsSync(tmpPath)) {
      try { await unlink(tmpPath) } catch { /* noop */ }
    }
    throw e
  }
}

export async function getAppConfig(force = false): Promise<AppConfig> {
  if (force || !appConfig) {
    try {
      const data = await readFile(appConfigPath(), 'utf-8')
      const parsed = parseYaml<AppConfig>(data)
      if (!parsed || !isValidConfig(parsed)) {
        const backup = await readFile(`${appConfigPath()}.backup`, 'utf-8')
        appConfig = parseYaml<AppConfig>(backup)
      } else {
        appConfig = parsed
      }
    } catch {
      appConfig = defaultConfig
    }
  }
  if (!appConfig || typeof appConfig !== 'object') appConfig = defaultConfig

  const persistedVersion: number = typeof appConfig.configVersion === 'number'
    ? appConfig.configVersion
    : 0

  // Backfill any missing fields by merging persisted values over default template.
  appConfig = deepMerge(defaultConfig, appConfig) as AppConfig

  if (!VALID_THEMES.has(appConfig.appTheme as string)) {
    appConfig = { ...appConfig, appTheme: 'dark' }
  }

  // Ensure tgws secret is always a valid 32-char hex string
  if (!appConfig.tgws?.secret || !/^[0-9a-fA-F]{32}$/.test(appConfig.tgws.secret)) {
    appConfig = {
      ...appConfig,
      tgws: {
        ...(appConfig.tgws ?? defaultConfig.tgws!),
        secret: randomBytes(16).toString('hex')
      }
    }
  }

  // Keep gameFilter boolean and gameFilterMode in sync
  if (appConfig.zapret) {
    if (appConfig.zapret.gameFilter && (!appConfig.zapret.gameFilterMode || appConfig.zapret.gameFilterMode === 'disabled')) {
      appConfig.zapret.gameFilterMode = 'tcpudp'
    } else if (appConfig.zapret.gameFilterMode && appConfig.zapret.gameFilterMode !== 'disabled') {
      appConfig.zapret.gameFilter = true
    }
  }

  if (persistedVersion < CONFIG_VERSION) {
    appConfig = {
      ...appConfig,
      configVersion: CONFIG_VERSION,
      lastBuildId: typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'
    }
    try {
      await safeWriteConfig(stringifyYaml(appConfig))
    } catch { /* noop */ }
  }

  return appConfig
}

export async function patchAppConfig(patch: Partial<AppConfig>): Promise<void> {
  const previous = writePromise
  const prevAutoLaunch = appConfig?.autoLaunch
  const prevDisableTray = appConfig?.disableTray
  const prevHideTaskbarIcon = appConfig?.hideTaskbarIcon
  writePromise = (async () => {
    await previous
    appConfig = deepMerge(appConfig ?? defaultConfig, patch)
    await safeWriteConfig(stringifyYaml(appConfig))
  })()
  await writePromise
  if (patch.autoLaunch !== undefined && patch.autoLaunch !== prevAutoLaunch) {
    try {
      if (patch.autoLaunch) await enableAutoRun()
      else await disableAutoRun()
    } catch { /* noop */ }
  }
  if (patch.disableTray !== undefined && patch.disableTray !== prevDisableTray) {
    try {
      const tray = await import('../resolve/tray')
      if (patch.disableTray) tray.destroyTray()
      else await tray.createTray()
    } catch { /* noop */ }
  }
  const disableTrayChanged =
    patch.disableTray !== undefined && patch.disableTray !== prevDisableTray
  const hideChanged =
    patch.hideTaskbarIcon !== undefined && patch.hideTaskbarIcon !== prevHideTaskbarIcon
  if (hideChanged || disableTrayChanged) {
    try {
      const { applySkipTaskbar } = await import('../resolve/windowVisibility')
      applySkipTaskbar()
    } catch { /* noop */ }
  }
}

export function getAppConfigSync(): AppConfig {
  try {
    const raw = readFileSync(appConfigPath(), 'utf-8')
    const data = parseYaml<AppConfig>(raw)
    if (data && typeof data === 'object') return deepMerge(defaultConfig, data) as AppConfig
    return defaultConfig
  } catch {
    return defaultConfig
  }
}