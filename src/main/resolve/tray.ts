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
import { getDnsAiStatus, enableDnsAi, disableDnsAi } from '../core/dns-ai'
import { getAgStatus, enableAgAll, disableAgAll } from '../core/ag-unlocker'
import { getPsiphonStatus, startPsiphon, stopPsiphon, restartPsiphon } from '../core/psiphon'
import { getVpnStatus, startVpn, stopVpn, restartVpn } from '../core/vpn'
import { checkAppUpdate } from '../core/app-updater'
import { checkZapretUpdate } from '../core/zapret-updater'
import { checkTgwsUpdate } from '../core/tgws-updater'
import { checkDnsAiUpdate } from '../core/dns-ai-updater'
import { checkAgUpdate } from '../core/ag-updater'
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
    const psiphon = getPsiphonStatus()
    const vpn = getVpnStatus()
    const cfg = await getAppConfig().catch(() => null)
    const strategies = await listStrategies().catch(() => [])
    const profileData = await listProfiles().catch(() => ({ activeProfileId: 'default', profiles: [] }))
    const anyRunning = tgws.state === 'running' || zapret.state === 'running' || psiphon.state === 'running' || vpn.state === 'running'
    const dnsAi = await getDnsAiStatus().catch(() => null)
    const ag = await getAgStatus(false).catch(() => null)

    const dnsAiRunning = Boolean(dnsAi?.enabled || dnsAi?.stubRunning)
    const agRunning = Boolean(ag && (ag.relayRunning || ag.nrptApplied || ag.proxyEnvSet))

    const activeNow = anyRunning || dnsAiRunning || agRunning
    if (activeNow !== currentIconOn) {
      tray.setImage(loadTrayImage(activeNow))
      currentIconOn = activeNow
    }

    const activeModules: string[] = []
    if (zapret.state === 'running') activeModules.push('Zapret')
    if (tgws.state === 'running') activeModules.push('Telegram')
    if (psiphon.state === 'running') activeModules.push('Psiphon')
    if (vpn.state === 'running') activeModules.push('VPN')
    if (dnsAiRunning) activeModules.push('DNS-AI')
    if (agRunning) activeModules.push('Antigravity')

    const tooltip = activeModules.length > 0
      ? `GhosterNet — Защита активна (${activeModules.join(', ')})`
      : 'GhosterNet — Защита отключена'
    tray.setToolTip(tooltip)

    const activeStrat = cfg?.zapret?.activeStrategy
    const stratItems: Electron.MenuItemConstructorOptions[] = strategies.slice(0, 12).map((s) => ({
      label: s.favorite ? `* ${s.title}` : s.title,
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
      {
        label: `DNS-AI (DoH): ${dnsAiRunning ? 'Активен' : 'Отключён'}`,
        submenu: [
          {
            label: 'Включить DNS-AI',
            enabled: !dnsAiRunning,
            click: async () => {
              await enableDnsAi().catch(() => void 0)
              await rebuild()
            }
          },
          {
            label: 'Отключить DNS-AI',
            enabled: dnsAiRunning,
            click: async () => {
              await disableDnsAi().catch(() => void 0)
              await rebuild()
            }
          }
        ]
      },
      {
        label: `Antigravity Unlocker: ${agRunning ? 'Активен' : 'Отключён'}`,
        submenu: [
          {
            label: 'Включить защиту',
            enabled: !agRunning,
            click: async () => {
              await enableAgAll().catch(() => void 0)
              await rebuild()
            }
          },
          {
            label: 'Отключить защиту',
            enabled: agRunning,
            click: async () => {
              await disableAgAll().catch(() => void 0)
              await rebuild()
            }
          }
        ]
      },
      {
        label: `Psiphon VPN: ${stateLabel(psiphon.state)}`,
        submenu: [
          {
            label: 'Запустить Psiphon',
            enabled: psiphon.state !== 'running' && psiphon.state !== 'starting',
            click: () => {
              startPsiphon().then(() => rebuild()).catch(() => void 0)
            }
          },
          {
            label: 'Перезапустить Psiphon',
            enabled: psiphon.state === 'running',
            click: () => {
              restartPsiphon().then(() => rebuild()).catch(() => void 0)
            }
          },
          {
            label: 'Остановить Psiphon',
            enabled: psiphon.state === 'running',
            click: () => {
              stopPsiphon().then(() => rebuild()).catch(() => void 0)
            }
          }
        ]
      },
      {
        label: `VPN (sing-box): ${stateLabel(vpn.state)}`,
        submenu: [
          {
            label: 'Запустить VPN',
            enabled: vpn.state !== 'running' && vpn.state !== 'starting',
            click: () => {
              startVpn().then(() => rebuild()).catch(() => void 0)
            }
          },
          {
            label: 'Перезапустить VPN',
            enabled: vpn.state === 'running',
            click: () => {
              restartVpn().then(() => rebuild()).catch(() => void 0)
            }
          },
          {
            label: 'Остановить VPN',
            enabled: vpn.state === 'running',
            click: () => {
              stopVpn().then(() => rebuild()).catch(() => void 0)
            }
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
      {
        label: 'Проверить все обновления',
        click: async () => {
          try {
            await Promise.allSettled([
              checkAppUpdate(true),
              checkZapretUpdate(true),
              checkTgwsUpdate(true),
              checkDnsAiUpdate(true),
              checkAgUpdate(true)
            ])
            appLog('info', 'Трей: проверка обновлений всех компонентов выполнена')
          } catch {
            // ignore
          }
        }
      },
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