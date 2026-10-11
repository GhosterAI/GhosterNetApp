import { ipcMain, app, shell, clipboard, BrowserWindow, dialog } from 'electron'
import { getAppConfig, patchAppConfig } from '../config'
import { applyTheme, setNativeTheme } from '../resolve/theme'
import {
  getTgwsStatus,
  startTgws,
  stopTgws,
  restartTgws,
  getTgwsLink,
  pingTelegramDatacenters
} from '../core/tgws'
import { runTgwsTune } from '../core/tgws-tuner'
import {
  getZapretStatus,
  startZapret,
  stopZapret,
  restartZapret,
  listStrategies,
  installZapretBundle,
  toggleFavoriteStrategy,
  listFakeBinPayloads,
  materializeZapretRuntime
} from '../core/zapret'
import {
  checkZapretUpdate,
  installZapretUpdate,
  dismissZapretUpdate
} from '../core/zapret-updater'
import {
  runStrategyTests,
  cancelStrategyTests,
  runSettingsBenchmark,
  getStrategyTestResults,
  isStrategyTestRunning
} from '../core/zapret-tester'
import {
  getCuratedIpSets,
  getIpListSnapshot,
  applyIpListPatch,
  clearIpList,
  restoreIpListBackup,
  type IpListPatch
} from '../core/zapret-iplist'
import {
  getZapretCollections,
  saveZapretUserCollection,
  readRawZapretListFile,
  writeRawZapretListFile,
  type ZapretListCollectionKey
} from '../core/zapret-files'
import { getServicePresetsWithState } from '../core/service-catalog'
import {
  getSystemHostsState,
  applySystemHosts,
  revertSystemHosts
} from '../core/system-hosts'
import {
  listDnsPresets,
  getDnsStatus,
  applyDnsConfig,
  resetDnsToDhcp
} from '../core/dns-manager'
import {
  listInstalledMods,
  toggleMod,
  reorderMods,
  removeMod,
  importModFromZip
} from '../core/mods'
import {
  runSystemDiagnostics,
  fixDiagnosticIssue,
  clearDiscordCache,
  autoFixNetwork,
  checkLiveServices
} from '../core/diagnostics'
import {
  exportFullConfig,
  importFullConfig
} from '../core/config-backup'
import {
  listProfiles,
  switchProfile,
  saveCurrentToProfile,
  createProfile,
  deleteProfile
} from '../core/profiles'
import {
  checkTgwsUpdate,
  installTgwsUpdate,
  dismissTgwsUpdate
} from '../core/tgws-updater'
import {
  checkAppUpdate,
  installAppUpdate,
  dismissAppUpdate
} from '../core/app-updater'
import {
  checkDnsAiUpdate,
  installDnsAiUpdate,
  dismissDnsAiUpdate
} from '../core/dns-ai-updater'
import {
  checkAgUpdate,
  installAgUpdate,
  dismissAgUpdate
} from '../core/ag-updater'
import {
  getDnsAiStatus,
  enableDnsAi,
  disableDnsAi,
  setDnsAiSettings,
  installDnsAiService,
  uninstallDnsAiService,
  testDnsAiDoh,
  checkDnsAiServices
} from '../core/dns-ai'
import {
  getAgStatus,
  patchAgInstall,
  unpatchAgInstall,
  setAgCapability,
  enableAgAll,
  disableAgAll,
  repairAgService,
  setAgOwnProxy,
  setAgGroupKey,
  setAgProvider,
  reorderAgProviders,
  addAgManualPath,
  removeAgManualPath,
  getAgLogs
} from '../core/ag-unlocker'
import {
  getPsiphonStatus,
  startPsiphon,
  stopPsiphon,
  restartPsiphon,
  togglePsiphonSystemProxy,
  setPsiphonRegion
} from '../core/psiphon'
import { execFile } from 'node:child_process'
import { writeFileSync, unlinkSync } from 'node:fs'
import path from 'node:path'

function logTgError(stage: string, err: Error | null, stderr?: string): void {
  if (!err && !stderr) return
  const msg = err?.message ?? stderr ?? 'unknown'
  console.error(`[openTelegramLink] ${stage}: ${msg.trim()}`)
}

function tryFallbackOpen(url: string): void {
  shell.openExternal(url).catch((e) => logTgError('shell.openExternal', e))
}

function openTgLinkViaScheduler(url: string, fellBack: { v: boolean }): boolean {
  try {
    const taskName = `GhosterNet_OpenTG_${Date.now()}_${Math.floor(Math.random() * 10000)}`
    const vbsPath = path.join(app.getPath('temp'), `${taskName}.vbs`)
    const vbsSafeUrl = url.replace(/"/g, '""')
    const vbsContent =
      'On Error Resume Next\r\n' +
      `CreateObject("Shell.Application").ShellExecute "${vbsSafeUrl}"\r\n`
    writeFileSync(vbsPath, vbsContent, 'utf8')

    const trCommand = `wscript.exe //B //Nologo "${vbsPath}"`

    const cleanup = (): void => {
      execFile(
        'schtasks.exe',
        ['/Delete', '/F', '/TN', taskName],
        { windowsHide: true },
        () => {
          try { unlinkSync(vbsPath) } catch { /* noop */ }
        }
      )
    }

    execFile(
      'schtasks.exe',
      [
        '/Create', '/F',
        '/TN', taskName,
        '/TR', trCommand,
        '/SC', 'ONCE',
        '/ST', '23:59',
        '/SD', '01/01/2099',
        '/IT',
        '/RL', 'LIMITED'
      ],
      { windowsHide: true },
      (createErr, _stdout, createStderr) => {
        if (createErr) {
          logTgError('schtasks /Create', createErr, createStderr)
          if (!fellBack.v) {
            fellBack.v = true
            tryFallbackOpen(url)
          }
          try { unlinkSync(vbsPath) } catch { /* noop */ }
          return
        }
        execFile(
          'schtasks.exe',
          ['/Run', '/TN', taskName],
          { windowsHide: true },
          (runErr, _so, runStderr) => {
            if (runErr) {
              logTgError('schtasks /Run', runErr, runStderr)
              if (!fellBack.v) {
                fellBack.v = true
                tryFallbackOpen(url)
              }
            }
            setTimeout(cleanup, 5000)
          }
        )
      }
    )
    return true
  } catch (e) {
    logTgError('openTgLinkViaScheduler sync', e as Error)
    return false
  }
}

const TG_INFLIGHT_LOCK_MS = 600
let tgInflightUntil = 0

function openTelegramLink(url: string): Promise<void> {
  const now = Date.now()
  if (now < tgInflightUntil) return Promise.resolve()
  tgInflightUntil = now + TG_INFLIGHT_LOCK_MS
  if (process.platform === 'win32') {
    const fellBack = { v: false }
    if (openTgLinkViaScheduler(url, fellBack)) return Promise.resolve()
    if (!fellBack.v) tryFallbackOpen(url)
    return Promise.resolve()
  }
  tryFallbackOpen(url)
  return Promise.resolve()
}

function h<T>(fn: (...args: unknown[]) => Promise<T> | T) {
  return async (_event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => {
    try {
      const value = await fn(...args)
      return { ok: true, value }
    } catch (e: unknown) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
  }
}

export function registerIpcMainHandlers(): void {
  // ---- App config ---------------------------------------------------------
  ipcMain.handle('app:getConfig', h(() => getAppConfig()))
  ipcMain.handle('app:patchConfig', h((patch) => patchAppConfig(patch as Partial<AppConfig>)))
  ipcMain.handle('app:version', h(() => app.getVersion()))

  // ---- Theme --------------------------------------------------------------
  ipcMain.handle('theme:setNative', h((theme) => setNativeTheme(theme as AppTheme)))
  ipcMain.handle('theme:apply', h((file) => applyTheme(file as string)))

  // ---- Utility ------------------------------------------------------------
  ipcMain.handle('shell:openTelegramLink', h((url) => openTelegramLink(url as string)))
  ipcMain.handle('clipboard:writeText', h((text) => { clipboard.writeText(text as string) }))
  ipcMain.handle(
    'logs:exportToFile',
    h(async (content) => {
      const res = await dialog.showSaveDialog({
        title: 'Экспорт журнала GhosterNet',
        defaultPath: `ghosternet-logs-${new Date().toISOString().slice(0, 10)}.log`,
        filters: [{ name: 'Log Files', extensions: ['log', 'txt'] }]
      })
      if (res.canceled || !res.filePath) return { saved: false }
      writeFileSync(res.filePath, String(content || ''), 'utf8')
      return { saved: true, path: res.filePath }
    })
  )

  // ---- TG WS Proxy --------------------------------------------------------
  ipcMain.handle('tgws:status', h(() => getTgwsStatus()))
  ipcMain.handle('tgws:start', h(() => startTgws()))
  ipcMain.handle('tgws:stop', h(() => stopTgws()))
  ipcMain.handle('tgws:restart', h(() => restartTgws()))
  ipcMain.handle('tgws:getLink', h(() => getTgwsLink()))
  ipcMain.handle('tgws:runTune', h((mode) => runTgwsTune((mode as 'fast' | 'full') || 'fast')))
  ipcMain.handle('tgws:checkUpdate', h((force) => checkTgwsUpdate(Boolean(force))))
  ipcMain.handle('tgws:installUpdate', h((url, expectedVersion) =>
    installTgwsUpdate(url as string, expectedVersion as string | undefined)
  ))
  ipcMain.handle('tgws:dismissUpdate', h((tag) => dismissTgwsUpdate(tag as string)))
  ipcMain.handle('tgws:pingDcs', h(() => pingTelegramDatacenters()))

  // ---- Zapret -------------------------------------------------------------
  ipcMain.handle('zapret:status', h(() => getZapretStatus()))
  ipcMain.handle('zapret:listStrategies', h(() => listStrategies()))
  ipcMain.handle('zapret:toggleFavorite', h((file) => toggleFavoriteStrategy(file as string)))
  ipcMain.handle('zapret:listFakeBins', h(() => listFakeBinPayloads()))
  ipcMain.handle('zapret:start', h(() => startZapret()))
  ipcMain.handle('zapret:stop', h(() => stopZapret()))
  ipcMain.handle('zapret:restart', h(() => restartZapret()))
  ipcMain.handle('zapret:installBundle', h((bytes) =>
    installZapretBundle(bytes as Uint8Array)
  ))
  ipcMain.handle('zapret:checkUpdate', h((force) => checkZapretUpdate(Boolean(force))))
  ipcMain.handle('zapret:installUpdate', h((url, expectedVersion) =>
    installZapretUpdate(url as string, expectedVersion as string | undefined)
  ))
  ipcMain.handle('zapret:dismissUpdate', h((tag) => dismissZapretUpdate(tag as string)))

  // ---- Zapret strategy tester & benchmark ---------------------------------
  ipcMain.handle('zapret:runStrategyTest', h(() => runStrategyTests()))
  ipcMain.handle('zapret:cancelStrategyTest', h(() => { cancelStrategyTests(); return true }))
  ipcMain.handle('zapret:runSettingsBenchmark', h(() => runSettingsBenchmark()))
  ipcMain.handle('zapret:getStrategyTestResults', h(() => getStrategyTestResults()))
  ipcMain.handle('zapret:isStrategyTestRunning', h(() => isStrategyTestRunning()))

  // ---- Zapret IP list (ipset-all.txt) & Collections -----------------------
  ipcMain.handle('zapret:getCuratedIpSets', h(() => getCuratedIpSets()))
  ipcMain.handle('zapret:getIpList', h(() => getIpListSnapshot()))
  ipcMain.handle('zapret:applyIpListPatch', h((patch) =>
    applyIpListPatch((patch ?? {}) as IpListPatch)
  ))
  ipcMain.handle('zapret:clearIpList', h(() => clearIpList()))
  ipcMain.handle('zapret:restoreIpListBackup', h(() => restoreIpListBackup()))

  ipcMain.handle('zapret:getCollections', h(() => getZapretCollections()))
  ipcMain.handle('zapret:saveCollection', h(async (key, entries) => {
    const res = saveZapretUserCollection(key as ZapretListCollectionKey, entries as string[])
    await materializeZapretRuntime().catch(() => void 0)
    return res
  }))
  ipcMain.handle('zapret:readRawList', h((filename) => readRawZapretListFile(filename as string)))
  ipcMain.handle('zapret:writeRawList', h((filename, content) =>
    writeRawZapretListFile(filename as string, content as string)
  ))

  // ---- Services Catalog ---------------------------------------------------
  ipcMain.handle('services:list', h(async () => {
    const cfg = await getAppConfig()
    return getServicePresetsWithState(cfg.zapret?.selectedServices ?? [])
  }))
  ipcMain.handle('services:toggle', h(async (serviceId, enabled) => {
    const cfg = await getAppConfig()
    const current = new Set<string>(cfg.zapret?.selectedServices ?? [])
    if (enabled) current.add(serviceId as string)
    else current.delete(serviceId as string)
    const nextList = Array.from(current)
    await patchAppConfig({
      zapret: {
        ...(cfg.zapret as ZapretConfig),
        selectedServices: nextList
      }
    })
    await materializeZapretRuntime().catch(() => void 0)
    if (getZapretStatus().state === 'running') {
      await restartZapret().catch(() => void 0)
    }
    return getServicePresetsWithState(nextList)
  }))
  ipcMain.handle('services:setAll', h(async (serviceIds) => {
    const cfg = await getAppConfig()
    const nextList = Array.isArray(serviceIds) ? serviceIds.map(String) : []
    await patchAppConfig({
      zapret: {
        ...(cfg.zapret as ZapretConfig),
        selectedServices: nextList
      }
    })
    await materializeZapretRuntime().catch(() => void 0)
    if (getZapretStatus().state === 'running') {
      await restartZapret().catch(() => void 0)
    }
    return getServicePresetsWithState(nextList)
  }))

  // ---- System Hosts -------------------------------------------------------
  ipcMain.handle('hosts:status', h(() => getSystemHostsState()))
  ipcMain.handle('hosts:apply', h(() => applySystemHosts()))
  ipcMain.handle('hosts:revert', h(() => revertSystemHosts()))

  // ---- DNS Manager --------------------------------------------------------
  ipcMain.handle('dns:listPresets', h(() => listDnsPresets()))
  ipcMain.handle('dns:status', h(() => getDnsStatus()))
  ipcMain.handle('dns:apply', h((opts) =>
    applyDnsConfig(opts as { presetId: string; primary?: string; secondary?: string; dohUrl?: string })
  ))
  ipcMain.handle('dns:reset', h(() => resetDnsToDhcp()))

  // ---- Mods ---------------------------------------------------------------
  ipcMain.handle('mods:list', h(() => listInstalledMods()))
  ipcMain.handle('mods:toggle', h(async (modId, enabled) => {
    const res = await toggleMod(modId as string, Boolean(enabled))
    await materializeZapretRuntime().catch(() => void 0)
    if (getZapretStatus().state === 'running') {
      await restartZapret().catch(() => void 0)
    }
    return res
  }))
  ipcMain.handle('mods:reorder', h(async (modOrder) => {
    const res = await reorderMods(modOrder as string[])
    await materializeZapretRuntime().catch(() => void 0)
    return res
  }))
  ipcMain.handle('mods:remove', h((modId) => removeMod(modId as string)))
  ipcMain.handle('mods:importZip', h(async (bytes, fileName) => {
    const res = await importModFromZip(bytes as Uint8Array, fileName as string | undefined)
    await materializeZapretRuntime().catch(() => void 0)
    return res
  }))

  // ---- Diagnostics & Discord Cache ----------------------------------------
  ipcMain.handle('diagnostics:run', h(() => runSystemDiagnostics()))
  ipcMain.handle('diagnostics:fix', h((checkId) => fixDiagnosticIssue(checkId as string)))
  ipcMain.handle('diagnostics:clearDiscordCache', h(() => clearDiscordCache()))
  ipcMain.handle('diagnostics:autoFix', h(() => autoFixNetwork()))
  ipcMain.handle('diagnostics:liveServices', h(() => checkLiveServices()))

  // ---- Profiles & Config Backup -------------------------------------------
  ipcMain.handle('profiles:list', h(() => listProfiles()))
  ipcMain.handle('profiles:switch', h((profileId) => switchProfile(profileId as string)))
  ipcMain.handle('profiles:save', h((profileId, customName) =>
    saveCurrentToProfile(profileId as string | undefined, customName as string | undefined)
  ))
  ipcMain.handle('profiles:create', h((name) => createProfile(name as string)))
  ipcMain.handle('profiles:delete', h((profileId) => deleteProfile(profileId as string)))
  ipcMain.handle('config:exportFull', h(() => exportFullConfig()))
  ipcMain.handle('config:importFull', h((raw) => importFullConfig(raw as string)))
  ipcMain.handle('config:exportDialog', async (e) => {
    try {
      const win = BrowserWindow.fromWebContents(e.sender)
      const json = await exportFullConfig()
      const result = win
        ? await dialog.showSaveDialog(win, {
            title: 'Экспорт профиля GhosterNet',
            defaultPath: `ghosternet-profile-${new Date().toISOString().slice(0, 10)}.ghosternet`,
            filters: [
              { name: 'GhosterNet Backup (*.ghosternet)', extensions: ['ghosternet'] },
              { name: 'JSON (*.json)', extensions: ['json'] }
            ]
          })
        : await dialog.showSaveDialog({
            title: 'Экспорт профиля GhosterNet',
            defaultPath: `ghosternet-profile-${new Date().toISOString().slice(0, 10)}.ghosternet`,
            filters: [
              { name: 'GhosterNet Backup (*.ghosternet)', extensions: ['ghosternet'] },
              { name: 'JSON (*.json)', extensions: ['json'] }
            ]
          })
      if (result.canceled || !result.filePath) {
        return { ok: true, value: { saved: false } }
      }
      writeFileSync(result.filePath, json, 'utf8')
      return { ok: true, value: { saved: true, path: result.filePath } }
    } catch (err: unknown) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  })
  ipcMain.handle('config:importDialog', async (e) => {
    try {
      const win = BrowserWindow.fromWebContents(e.sender)
      const result = win
        ? await dialog.showOpenDialog(win, {
            title: 'Импорт профиля GhosterNet',
            filters: [
              { name: 'GhosterNet Backup (*.ghosternet, *.json)', extensions: ['ghosternet', 'json'] }
            ],
            properties: ['openFile']
          })
        : await dialog.showOpenDialog({
            title: 'Импорт профиля GhosterNet',
            filters: [
              { name: 'GhosterNet Backup (*.ghosternet, *.json)', extensions: ['ghosternet', 'json'] }
            ],
            properties: ['openFile']
          })
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: true, value: { ok: false, message: 'Отменено' } }
      }
      const { readFileSync } = await import('node:fs')
      const content = readFileSync(result.filePaths[0], 'utf8')
      const imported = await importFullConfig(content)
      return { ok: true, value: imported }
    } catch (err: unknown) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  })

  // ---- GhosterNet self-update ---------------------------------------------
  ipcMain.handle('app:checkUpdate', h((force) => checkAppUpdate(Boolean(force))))
  ipcMain.handle('app:installUpdate', h((url, expectedVersion) =>
    installAppUpdate(url as string, expectedVersion as string | undefined)
  ))
  ipcMain.handle('app:dismissUpdate', h((tag) => dismissAppUpdate(tag as string)))

  // ---- DNS-AI (Encrypted DoH for AI services) -----------------------------
  ipcMain.handle('dnsAi:status', h(() => getDnsAiStatus()))
  ipcMain.handle('dnsAi:enable', h(() => enableDnsAi()))
  ipcMain.handle('dnsAi:disable', h(() => disableDnsAi()))
  ipcMain.handle(
    'dnsAi:setSettings',
    h((partial) => setDnsAiSettings((partial ?? {}) as Record<string, unknown>))
  )
  ipcMain.handle('dnsAi:installService', h(() => installDnsAiService()))
  ipcMain.handle('dnsAi:uninstallService', h(() => uninstallDnsAiService()))
  ipcMain.handle(
    'dnsAi:testDoh',
    h((domain, qtype) =>
      testDnsAiDoh(domain as string | undefined, qtype as string | undefined)
    )
  )
  ipcMain.handle('dnsAi:checkServices', h(() => checkDnsAiServices()))
  ipcMain.handle('dnsAi:checkUpdate', h((force) => checkDnsAiUpdate(Boolean(force))))
  ipcMain.handle('dnsAi:installUpdate', h((url, expectedVersion) =>
    installDnsAiUpdate(url as string, expectedVersion as string | undefined)
  ))
  ipcMain.handle('dnsAi:dismissUpdate', h((tag) => dismissDnsAiUpdate(tag as string)))

  // ---- Antigravity Unlocker -----------------------------------------------
  ipcMain.handle('ag:status', h((deep) => getAgStatus(Boolean(deep))))
  ipcMain.handle('ag:checkUpdate', h((force) => checkAgUpdate(Boolean(force))))
  ipcMain.handle('ag:installUpdate', h((url, expectedVersion) =>
    installAgUpdate(url as string, expectedVersion as string | undefined)
  ))
  ipcMain.handle('ag:dismissUpdate', h((tag) => dismissAgUpdate(tag as string)))
  ipcMain.handle('ag:patch', h((targetPath) => patchAgInstall(targetPath as string | undefined)))
  ipcMain.handle(
    'ag:unpatch',
    h((targetPath) => unpatchAgInstall(targetPath as string | undefined))
  )
  ipcMain.handle(
    'ag:setCap',
    h((cap, enabled) => setAgCapability(cap as string, Boolean(enabled)))
  )
  ipcMain.handle('ag:enableAll', h(() => enableAgAll()))
  ipcMain.handle('ag:disableAll', h(() => disableAgAll()))
  ipcMain.handle('ag:repair', h(() => repairAgService()))
  ipcMain.handle('ag:setOwnProxy', h((proxyStr) => setAgOwnProxy(proxyStr as string)))
  ipcMain.handle('ag:setGroupKey', h((groupKey) => setAgGroupKey(groupKey as string)))
  ipcMain.handle(
    'ag:setProvider',
    h((name, enabled) => setAgProvider(name as string, Boolean(enabled)))
  )
  ipcMain.handle(
    'ag:reorderProviders',
    h((order) => reorderAgProviders(order as string[]))
  )
  ipcMain.handle('ag:addManualPath', h((dirPath) => addAgManualPath(dirPath as string)))
  ipcMain.handle('ag:removeManualPath', h((dirPath) => removeAgManualPath(dirPath as string)))
  ipcMain.handle('ag:logs', h(() => getAgLogs()))
  ipcMain.handle('ag:pickFolder', async (e) => {
    try {
      const win = BrowserWindow.fromWebContents(e.sender)
      const result = win
        ? await dialog.showOpenDialog(win, {
            title: 'Выберите папку установки Antigravity',
            properties: ['openDirectory']
          })
        : await dialog.showOpenDialog({
            title: 'Выберите папку установки Antigravity',
            properties: ['openDirectory']
          })
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: true, value: null }
      }
      return { ok: true, value: result.filePaths[0] }
    } catch (err: unknown) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  })

  // ---- Psiphon VPN & Proxy ------------------------------------------------
  ipcMain.handle('psiphon:status', h(() => getPsiphonStatus()))
  ipcMain.handle('psiphon:start', h(() => startPsiphon()))
  ipcMain.handle('psiphon:stop', h(() => stopPsiphon()))
  ipcMain.handle('psiphon:restart', h(() => restartPsiphon()))
  ipcMain.handle('psiphon:setSystemProxy', h((enable) => togglePsiphonSystemProxy(Boolean(enable))))
  ipcMain.handle('psiphon:setRegion', h((region) => setPsiphonRegion(String(region || ''))))

  // ---- Quit / restart -----------------------------------------------------
  ipcMain.handle('app:quit', h(() => app.quit()))
  ipcMain.handle('app:relaunch', h(() => {
    app.relaunch()
    app.exit(0)
  }))

  // ---- Window controls ----------------------------------------------------
  ipcMain.handle('setLanguage', async (_e, _lang: string) => undefined)
  ipcMain.handle('windowIsMaximized', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    return win?.isMaximized() ?? false
  })
  ipcMain.handle('windowMinimize', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize()
  })
  ipcMain.handle('windowMaximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.handle('windowClose', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close()
  })
}

export function setupIpc(): void {
  registerIpcMainHandlers()
}
