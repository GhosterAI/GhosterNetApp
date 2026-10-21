import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, dialog, Menu, powerMonitor, shell } from 'electron'
import windowStateKeeper from 'electron-window-state'
import { join } from 'path'
import icon from '../../resources/icon.png?asset'
import { registerIpcMainHandlers } from './utils/ipc'
import { init } from './utils/init'
import { getAppConfig, getAppConfigSync } from './config'
import { createTray, isTrayActive, refreshTray } from './resolve/tray'
import { createApplicationMenu } from './resolve/menu'
import { initShortcut } from './resolve/shortcut'
import { getTgwsStatus, restartTgws, startTgws, stopTgws } from './core/tgws'
import { getZapretStatus, restartZapret, startZapret, stopZapret } from './core/zapret'
import { getVpnStatus, restartVpn, startVpn, stopVpn } from './core/vpn'
import { appLog } from './utils/app-logger'
import { enableAutoRun, disableAutoRun } from './sys/autoRun'
import { isRunningAsAdmin } from './utils/elevation'

// Lock the userData / cache / log folder names.
app.setName(is.dev ? 'ghosternet-dev' : 'ghosternet')

export let mainWindow: BrowserWindow | null = null

export function showError(title: string, message: string): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('showError', title, message)
  } else {
    dialog.showErrorBox(title, message)
  }
}

/* Single-instance lock */
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

process.on('uncaughtException', (err) => {
  appLog('error', `uncaughtException: ${err.stack || err.message}`)
})
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? (reason.stack || reason.message) : String(reason)
  appLog('error', `unhandledRejection: ${msg}`)
})

app.on('second-instance', () => showMainWindow())

const syncConfig = getAppConfigSync()
if (syncConfig.disableGPU) app.disableHardwareAcceleration()

const initPromise = init()

let wasTgwsRunningBeforeSleep = false
let wasZapretRunningBeforeSleep = false
let wasVpnRunningBeforeSleep = false

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.ghosternet.app')
  appLog('info', `GhosterNet запущен (v${app.getVersion()}, ${process.platform}-${process.arch})`)

  if (process.platform === 'win32' && !is.dev && !(await isRunningAsAdmin())) {
    dialog.showErrorBox(
      'GhosterNet — нужны права администратора',
      'GhosterNet должен быть запущен с правами администратора, иначе Zapret\n' +
        '(WinDivert), DNS-менеджер и автозапуск через Task Scheduler не будут работать.\n\n' +
        'Закройте приложение и запустите его через «Запустить от имени администратора».'
    )
    app.quit()
    return
  }

  try {
    await initPromise
    appLog('info', 'Инициализация завершена')
  } catch (e) {
    appLog('error', `Ошибка инициализации: ${e}`)
    dialog.showErrorBox('GhosterNet init failed', `${e}`)
    app.quit()
    return
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcMainHandlers()
  const appConfig = await getAppConfig()

  if (appConfig.tgws?.autoStart) {
    appLog('info', 'Автозапуск Telegram WS — старт')
    startTgws().catch((e) => {
      appLog('error', `Автозапуск Telegram WS упал: ${e}`)
      showError('TG WS start failed', `${e}`)
    })
  }
  if (appConfig.zapret?.autoStart) {
    appLog('info', 'Автозапуск Zapret — старт')
    startZapret().catch((e) => {
      appLog('error', `Автозапуск Zapret упал: ${e}`)
      showError('Zapret start failed', `${e}`)
    })
  }
  if (appConfig.vpn?.autoStart) {
    appLog('info', 'Автозапуск VPN — старт')
    startVpn().catch((e) => {
      appLog('error', `Автозапуск VPN упал: ${e}`)
      showError('VPN start failed', `${e}`)
    })
  }

  try {
    if (appConfig.autoLaunch) await enableAutoRun()
    else await disableAutoRun()
  } catch (e) {
    appLog('warn', `autoLaunch sync failed: ${e}`)
  }

  // Power management: auto-restart services on wake from sleep/hibernation
  powerMonitor.on('suspend', () => {
    wasTgwsRunningBeforeSleep = getTgwsStatus().state === 'running'
    wasZapretRunningBeforeSleep = getZapretStatus().state === 'running'
    wasVpnRunningBeforeSleep = getVpnStatus().state === 'running'
    appLog(
      'info',
      `Система уходит в сон (tgws=${wasTgwsRunningBeforeSleep}, zapret=${wasZapretRunningBeforeSleep}, vpn=${wasVpnRunningBeforeSleep})`
    )
  })

  powerMonitor.on('resume', async () => {
    const cfg = await getAppConfig()
    if (cfg.autoRestartOnWake === false) return
    appLog('info', 'Система пробудилась — проверка сервисов…')
    setTimeout(async () => {
      if (wasTgwsRunningBeforeSleep || getTgwsStatus().state === 'running') {
        appLog('info', 'Перезапуск Telegram WS после сна…')
        restartTgws().catch((e) => appLog('warn', `Ошибка перезапуска TG WS после сна: ${e}`))
      }
      if (wasZapretRunningBeforeSleep || getZapretStatus().state === 'running') {
        appLog('info', 'Перезапуск Zapret после сна…')
        restartZapret().catch((e) => appLog('warn', `Ошибка перезапуска Zapret после сна: ${e}`))
      }
      if (wasVpnRunningBeforeSleep || getVpnStatus().state === 'running') {
        appLog('info', 'Перезапуск VPN после сна…')
        restartVpn().catch((e) => appLog('warn', `Ошибка перезапуска VPN после сна: ${e}`))
      }
    }, 2500)
  })

  await createWindow(appConfig)

  const uiTasks: Promise<unknown>[] = [initShortcut()]
  if (!appConfig.disableTray) uiTasks.push(createTray())
  await Promise.all(uiTasks)

  app.on('activate', () => {
    showMainWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})

let cleanupRan = false
let isQuitting = false

function syncKillChildren(): void {
  if (process.platform !== 'win32') return
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { spawnSync } = require('child_process') as typeof import('child_process')
    const opts = { windowsHide: true, timeout: 2000 } as const

    spawnSync('taskkill.exe', ['/F', '/IM', 'TgWsProxy_windows.exe', '/T'], opts)
    spawnSync('taskkill.exe', ['/F', '/IM', 'winws.exe', '/T'], opts)
    spawnSync('taskkill.exe', ['/F', '/IM', 'sing-box.exe', '/T'], opts)
    spawnSync('taskkill.exe', ['/F', '/IM', 'wireproxy.exe', '/T'], opts)

    for (const svc of ['WinDivert', 'windivert', 'WinDivert64', 'windivert64']) {
      spawnSync('sc.exe', ['stop', svc], opts)
    }
  } catch { /* noop */ }
}

async function cleanupServices(): Promise<void> {
  if (cleanupRan) return
  cleanupRan = true
  await Promise.race([
    Promise.all([stopTgws(), stopZapret(), stopVpn()]).catch(() => void 0),
    new Promise<void>((r) => setTimeout(r, 3000))
  ])
  syncKillChildren()
}

app.on('before-quit', async (e) => {
  isQuitting = true
  if (cleanupRan) return
  appLog('info', 'Выход из приложения, остановка всех сервисов…')
  e.preventDefault()
  await cleanupServices()
  app.exit(0)
})

process.on('exit', () => syncKillChildren())
process.on('SIGINT', () => { syncKillChildren(); process.exit(0) })
process.on('SIGTERM', () => { syncKillChildren(); process.exit(0) })

export async function createWindow(appConfig?: AppConfig): Promise<void> {
  const config = appConfig ?? (await getAppConfig())
  const launchedHidden = process.argv.includes('--hidden') || process.argv.includes('--tray')
  const silentStart = Boolean(config.silentStart || launchedHidden)

  const mainWindowState = windowStateKeeper({
    defaultWidth: 1080,
    defaultHeight: 740,
    file: 'window-state.json'
  })

  if (process.platform === 'darwin') {
    await createApplicationMenu()
  } else {
    Menu.setApplicationMenu(null)
  }

  const initialSkipTaskbar = !!config.hideTaskbarIcon && !config.disableTray

  mainWindow = new BrowserWindow({
    minWidth: 900,
    minHeight: 620,
    width: mainWindowState.width,
    height: mainWindowState.height,
    x: mainWindowState.x,
    y: mainWindowState.y,
    show: false,
    frame: false,
    fullscreenable: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    skipTaskbar: initialSkipTaskbar,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      spellcheck: false,
      sandbox: false
    }
  })
  mainWindowState.manage(mainWindow)

  mainWindow.on('ready-to-show', () => {
    if (silentStart && !config.disableTray) return
    mainWindow?.show()
    mainWindow?.focus()
  })

  mainWindow.on('close', (e) => {
    if (isQuitting) return
    const cfg = getAppConfigSync()
    const trayOn = !cfg.disableTray
    const hideTaskbarOn = !!cfg.hideTaskbarIcon

    if (trayOn && isTrayActive()) {
      e.preventDefault()
      if (hideTaskbarOn) {
        appLog('info', 'Окно скрыто в трей (таскбар отключён)')
        mainWindow?.setSkipTaskbar(true)
        mainWindow?.hide()
      } else {
        appLog('info', 'Окно свёрнуто (доступно в панели задач и в трее)')
        mainWindow?.setSkipTaskbar(false)
        mainWindow?.minimize()
      }
      return
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  const onWindowVisibilityChange = (kind: string): void => {
    refreshTray().catch(() => void 0)
    try {
      mainWindow?.webContents.send('window:visibility', kind)
    } catch {
      /* noop */
    }
  }
  mainWindow.on('show', () => onWindowVisibilityChange('show'))
  mainWindow.on('hide', () => onWindowVisibilityChange('hide'))
  mainWindow.on('minimize', () => onWindowVisibilityChange('minimize'))
  mainWindow.on('restore', () => onWindowVisibilityChange('restore'))
  mainWindow.on('focus', () => onWindowVisibilityChange('focus'))
  mainWindow.on('blur', () => onWindowVisibilityChange('blur'))

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

export async function showMainWindow(): Promise<void> {
  if (!mainWindow) await createWindow()
  const w = mainWindow as BrowserWindow | null
  if (!w) return
  if (w.isMinimized()) w.restore()
  const cfg = getAppConfigSync()
  const shouldSkip = !!cfg.hideTaskbarIcon && !cfg.disableTray
  w.setSkipTaskbar(shouldSkip)
  w.show()
  w.focus()
}

export function closeMainWindow(): void {
  mainWindow?.close()
}

export async function triggerMainWindow(): Promise<void> {
  if (mainWindow && mainWindow.isVisible()) {
    mainWindow.hide()
  } else {
    await showMainWindow()
  }
}