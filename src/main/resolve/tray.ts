import { app, Menu, nativeImage, Tray } from 'electron'
import { resolve, join } from 'path'
import { existsSync } from 'fs'
import { mainWindow, triggerMainWindow, showMainWindow } from '..'
import { startTgws, stopTgws, restartTgws, getTgwsStatus } from '../core/tgws'
import {
  startZapret,
  stopZapret,
  restartZapret,
  getZapretStatus,
  listStrategies
} from '../core/zapret'
import { listProfiles, switchProfile } from '../core/profiles'
import { getAppConfig, patchAppConfig } from '../config'
import { appLog } from '../utils/app-logger'

let tray: Tray | null = null
let rebuildInterval: NodeJS.Timeout | null = null
let rebuildTrayMenu: (() => Promise<void>) | null = null
let currentIconOn: boolean | null = null

function loadTrayImage(on: boolean): Electron.NativeImage {
  const ico = iconPath(on)
  let image = nativeImage.createFromPath(ico)
  if (image.isEmpty()) {
    appLog('warn', `Tray image empty for ${ico}, using PNG fallback`)
    image = nativeImage.createFromPath(ico.replace(/\.ico$/i, '.png'))
  }
  return image.isEmpty() ? nativeImage.createEmpty() : image
}

export async function refreshTray(): Promise<void> {
  if (rebuildTrayMenu) await rebuildTrayMenu()
}

function iconPath(on: boolean): string {
  const ico = on ? 'icon_on.ico' : 'icon_off.ico'
  const png = on ? 'icon_on.png' : 'icon_off.png'
  const candidates: string[] = []
  if (process.resourcesPath) {
    candidates.push(join(process.resourcesPath, ico))
    candidates.push(join(process.resourcesPath, png))
  }
  candidates.push(resolve(app.getAppPath(), 'resources', ico))
  candidates.push(resolve(app.getAppPath(), 'resources', png))
  candidates.push(resolve(__dirname, '../../resources', ico))
  candidates.push(resolve(__dirname, '../../resources', png))

  for (const c of candidates) {
    if (existsSync(c)) {
      return c
    }
  }
  return candidates[0] ?? ''
}

export async function createTray(): Promise<void> {
  if (tray) destroyTray()

  try {
    tray = new Tray(loadTrayImage(false))
    currentIconOn = false
  } catch (e) {
    appLog('error', `Tray creation failed: ${e}`)
    return
  }
  tray.setToolTip('GhosterNet')

  const rebuild = async (): Promise<void> => {
    if (!tray) return
    const tgws = getTgwsStatus()
    const zapret = getZapretStatus()
    const cfg = await getAppConfig().catch(() => null)
    const strategies = await listStrategies().catch(() => [])
    const profileData = await listProfiles().catch(() => ({ activeProfileId: 'default', profiles: [] }))

    const anyRunning = tgws.state === 'running' || zapret.state === 'running'
    if (anyRunning !== currentIconOn) {
      tray.setImage(loadTrayImage(anyRunning))
      currentIconOn = anyRunning
    }

    const activeStrat = cfg?.zapret?.activeStrategy
    const stratItems: Electron.MenuItemConstructorOptions[] = strategies.slice(0, 12).map((s) => ({
      label: s.favorite ? `★ ${s.title}` : s.title,
      type: 'radio' as const,
      checked: s.file === activeStrat,
      click: async () => {
        if (!cfg) return
        await patchAppConfig({
          zapret: {
            ...(cfg.zapret as ZapretConfig),
            activeStrategy: s.file
          }
        })
        if (getZapretStatus().state === 'running') {
          await restartZapret().catch(() => void 0)
        }
      }
    }))

    const profileItems: Electron.MenuItemConstructorOptions[] = profileData.profiles.map((p: ConfigProfile) => ({
      label: p.name,
      type: 'radio' as const,
      checked: p.id === profileData.activeProfileId,
      click: () => {
        switchProfile(p.id).catch(() => void 0)
      }
    }))

    const stateLabel = (st: string): string =>
      st === 'running'
        ? 'Активен'
        : st === 'starting'
          ? 'Запуск…'
          : st === 'stopping'
            ? 'Остановка…'
            : st === 'error'
              ? 'Ошибка'
              : 'Остановлен'

    const menu = Menu.buildFromTemplate([
      {
        label: mainWindow?.isVisible() ? 'Скрыть окно GhosterNet' : 'Показать окно GhosterNet',
        click: () => triggerMainWindow()
      },
      { type: 'separator' },
      {
        label: `Zapret DPI: ${stateLabel(zapret.state)}`,
        submenu: [
          {
            label: 'Запустить',
            enabled: zapret.state !== 'running' && zapret.state !== 'starting',
            click: () => { startZapret().catch(() => void 0) }
          },
          {
            label: 'Перезапустить',
            enabled: zapret.state === 'running',
            click: () => { restartZapret().catch(() => void 0) }
          },
          {
            label: 'Остановить',
            enabled: zapret.state === 'running',
            click: () => { stopZapret().catch(() => void 0) }
          },
          ...(stratItems.length > 0
            ? [{ type: 'separator' as const }, ...stratItems]
            : [])
        ]
      },
      {
        label: `Telegram WS: ${stateLabel(tgws.state)}`,
        submenu: [
          {
            label: 'Запустить',
            enabled: tgws.state !== 'running' && tgws.state !== 'starting',
            click: () => { startTgws().catch(() => void 0) }
          },
          {
            label: 'Перезапустить',
            enabled: tgws.state === 'running',
            click: () => { restartTgws().catch(() => void 0) }
          },
          {
            label: 'Остановить',
            enabled: tgws.state === 'running',
            click: () => { stopTgws().catch(() => void 0) }
          }
        ]
      },
      ...(profileItems.length > 0
        ? [
            {
              label: 'Профиль конфигурации',
              submenu: profileItems
            }
          ]
        : []),
      { type: 'separator' },
      { label: 'Выйти из GhosterNet', click: () => { app.quit() } }
    ])
    tray.setContextMenu(menu)
  }

  tray.on('click', () => showMainWindow())
  tray.on('double-click', () => triggerMainWindow())

  rebuildTrayMenu = rebuild
  await rebuild()
  rebuildInterval = setInterval(rebuild, 2500)
}

export function destroyTray(): void {
  if (rebuildInterval) {
    clearInterval(rebuildInterval)
    rebuildInterval = null
  }
  rebuildTrayMenu = null
  currentIconOn = null
  tray?.destroy()
  tray = null
}

export function isTrayActive(): boolean {
  return tray !== null && !tray.isDestroyed()
}