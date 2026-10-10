interface IpcResult<T> {
  ok: boolean
  value?: T
  message?: string
}

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await window.electron.ipcRenderer.invoke(channel, ...args)) as IpcResult<T>
  if (!res || !res.ok) {
    throw new Error(res?.message ?? `IPC ${channel} failed`)
  }
  return res.value as T
}

// ---- App config -------------------------------------------------------------
export const getAppConfig = (): Promise<AppConfig> => invoke('app:getConfig')
export const patchAppConfig = (patch: Partial<AppConfig>): Promise<void> =>
  invoke('app:patchConfig', patch)
export const getAppVersion = (): Promise<string> => invoke('app:version')

// ---- Theme ------------------------------------------------------------------
export const setNativeTheme = (theme: AppTheme): Promise<void> =>
  invoke('theme:setNative', theme)
export const applyTheme = (file: string): Promise<void> => invoke('theme:apply', file)

// ---- Utility ----------------------------------------------------------------
export const openTelegramLink = (url: string): Promise<void> => invoke('shell:openTelegramLink', url)
export const writeClipboard = (text: string): Promise<void> =>
  invoke('clipboard:writeText', text)
export const exportLogsToFile = (
  content: string
): Promise<{ saved: boolean; path?: string }> => invoke('logs:exportToFile', content)

// ---- TG WS Proxy ------------------------------------------------------------
export const tgwsStatus = (): Promise<CoreStatus> => invoke('tgws:status')
export const tgwsStart = (): Promise<void> => invoke('tgws:start')
export const tgwsStop = (): Promise<void> => invoke('tgws:stop')
export const tgwsRestart = (): Promise<void> => invoke('tgws:restart')
export const tgwsGetLink = (): Promise<string> => invoke('tgws:getLink')

export interface TgwsTuneReport {
  mode: 'bridge' | 'direct' | 'auto'
  summary: string
  bestBridgeDomain?: string
  bestBridgeLatencyMs?: number
  directLatencyMs?: number
  bridges: Array<{ domain: string; latencyMs: number | null }>
  directs: Array<{ dc: number; ip: string; latencyMs: number | null }>
  appliedConfig: {
    cfproxy: boolean
    cfproxyUserDomain: string
    mediaMode: 'default' | 'media_fix' | 'empty'
    dcIp: string[]
  }
}
export const tgwsRunTune = (mode: 'fast' | 'full' = 'fast'): Promise<TgwsTuneReport> =>
  invoke('tgws:runTune', mode)

export interface TgwsUpdateInfo {
  installed?: string
  latest?: string
  hasUpdate: boolean
  assetName?: string
  assetUrl?: string
  assetSize?: number
  releaseUrl?: string
  publishedAt?: string
  dismissed?: boolean
}
export const tgwsCheckUpdate = (force = false): Promise<TgwsUpdateInfo> =>
  invoke('tgws:checkUpdate', force)
export const tgwsInstallUpdate = (
  url: string,
  expectedVersion?: string
): Promise<{ installedVersion?: string; sizeBytes: number }> =>
  invoke('tgws:installUpdate', url, expectedVersion)
export const tgwsDismissUpdate = (tag: string): Promise<void> =>
  invoke('tgws:dismissUpdate', tag)

// ---- Zapret -----------------------------------------------------------------
export interface StrategyDescriptor {
  file: string
  title: string
  description: string
  favorite?: boolean
  modId?: string
  modName?: string
}
export const zapretStatus = (): Promise<CoreStatus> => invoke('zapret:status')
export const zapretListStrategies = (): Promise<StrategyDescriptor[]> =>
  invoke('zapret:listStrategies')
export const zapretToggleFavorite = (file: string): Promise<string[]> =>
  invoke('zapret:toggleFavorite', file)
export const zapretListFakeBins = (): Promise<string[]> => invoke('zapret:listFakeBins')
export const zapretStart = (): Promise<void> => invoke('zapret:start')
export const zapretStop = (): Promise<void> => invoke('zapret:stop')
export const zapretRestart = (): Promise<void> => invoke('zapret:restart')
export const zapretInstallBundle = (bytes: Uint8Array): Promise<{ strategies: number }> =>
  invoke('zapret:installBundle', bytes)

export interface ZapretUpdateInfo {
  installed?: string
  latest?: string
  hasUpdate: boolean
  assetName?: string
  assetUrl?: string
  assetSize?: number
  releaseUrl?: string
  publishedAt?: string
  dismissed?: boolean
}
export const zapretCheckUpdate = (force = false): Promise<ZapretUpdateInfo> =>
  invoke('zapret:checkUpdate', force)
export const zapretInstallUpdate = (
  url: string,
  expectedVersion?: string
): Promise<{ strategies: number; installedVersion?: string }> =>
  invoke('zapret:installUpdate', url, expectedVersion)
export const zapretDismissUpdate = (tag: string): Promise<void> =>
  invoke('zapret:dismissUpdate', tag)

// ---- Zapret strategy tester & benchmark -------------------------------------
export interface StrategyTestResult {
  passed: boolean
  okCount: number
  totalCount: number
  score: number
  tested: true
  failedTargets?: string[]
  blockedTargets?: string[]
}
export interface StrategyTestReport {
  ranAt: number
  durationMs: number
  bundleVersion?: string
  results: Record<string, StrategyTestResult>
  bestStrategy?: string
}
export interface StrategyTestProgress {
  phase: 'starting' | 'testing' | 'completed' | 'error' | 'idle'
  current?: number
  total?: number
  strategy?: string
  report?: StrategyTestReport
  message?: string
}
export interface SettingsBenchmarkReport {
  ranAt: number
  strategy: string
  bestIpsetMode: 'loaded' | 'none' | 'any'
  bestGameFilterMode: 'disabled' | 'tcpudp' | 'tcp' | 'udp'
  bestScore: number
  combinations: Array<{
    ipsetMode: 'loaded' | 'none' | 'any'
    gameFilterMode: 'disabled' | 'tcpudp' | 'tcp' | 'udp'
    okCount: number
    totalCount: number
    score: number
  }>
}
export const zapretRunStrategyTest = (): Promise<StrategyTestReport> =>
  invoke('zapret:runStrategyTest')
export const zapretCancelStrategyTest = (): Promise<boolean> =>
  invoke('zapret:cancelStrategyTest')
export const zapretRunSettingsBenchmark = (): Promise<SettingsBenchmarkReport> =>
  invoke('zapret:runSettingsBenchmark')
export const zapretGetStrategyTestResults = (): Promise<StrategyTestReport | null> =>
  invoke('zapret:getStrategyTestResults')
export const zapretIsStrategyTestRunning = (): Promise<boolean> =>
  invoke('zapret:isStrategyTestRunning')

// ---- Zapret IP list & Collections -------------------------------------------
export interface CuratedIpSet {
  id: string
  name: string
  description: string
  cidrs: string[]
}
export interface IpListSnapshot {
  total: number
  preview: string[]
  hasBackup: boolean
  filePath: string
}
export interface IpListPatch {
  setIds?: string[]
  customCidrs?: string[]
  replace?: boolean
}
export type ZapretListCollectionKey = 'domains' | 'exclude_domains' | 'all_ips' | 'ips'
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
export const zapretGetCuratedIpSets = (): Promise<CuratedIpSet[]> =>
  invoke('zapret:getCuratedIpSets')
export const zapretGetIpList = (): Promise<IpListSnapshot> => invoke('zapret:getIpList')
export const zapretApplyIpListPatch = (patch: IpListPatch): Promise<IpListSnapshot> =>
  invoke('zapret:applyIpListPatch', patch)
export const zapretClearIpList = (): Promise<IpListSnapshot> => invoke('zapret:clearIpList')
export const zapretRestoreIpListBackup = (): Promise<IpListSnapshot> =>
  invoke('zapret:restoreIpListBackup')

export const zapretGetCollections = (): Promise<ZapretCollectionSnapshot[]> =>
  invoke('zapret:getCollections')
export const zapretSaveCollection = (
  key: ZapretListCollectionKey,
  entries: string[]
): Promise<ZapretCollectionSnapshot[]> => invoke('zapret:saveCollection', key, entries)
export const zapretReadRawList = (
  filename: string
): Promise<{ filename: string; content: string }> => invoke('zapret:readRawList', filename)
export const zapretWriteRawList = (
  filename: string,
  content: string
): Promise<{ filename: string; lines: number }> => invoke('zapret:writeRawList', filename, content)

// ---- Services Catalog -------------------------------------------------------
export const servicesList = (): Promise<ServicePresetInfo[]> => invoke('services:list')
export const servicesToggle = (
  serviceId: string,
  enabled: boolean
): Promise<ServicePresetInfo[]> => invoke('services:toggle', serviceId, enabled)
export const servicesSetAll = (serviceIds: string[]): Promise<ServicePresetInfo[]> =>
  invoke('services:setAll', serviceIds)

// ---- System Hosts -----------------------------------------------------------
export interface SystemHostsState {
  managed: boolean
  activeInFile: boolean
  entryCount: number
  entries: string[]
  path: string
}
export const hostsStatus = (): Promise<SystemHostsState> => invoke('hosts:status')
export const hostsApply = (): Promise<SystemHostsState> => invoke('hosts:apply')
export const hostsRevert = (): Promise<SystemHostsState> => invoke('hosts:revert')

// ---- DNS Manager ------------------------------------------------------------
export interface DnsPresetDescriptor {
  id: string
  name: string
  description: string
  ipv4: string[]
  ipv6: string[]
  doh: string
}
export interface DnsManagerStatus {
  active: boolean
  presetId: string
  primary: string
  secondary: string
  dohUrl: string
  adapters: Array<{
    interface_index: number
    interface_alias: string
    interface_guid: string
    ipv4: string[]
    ipv6: string[]
  }>
  lastUpdated?: string
  lastError?: string
}
export const dnsListPresets = (): Promise<DnsPresetDescriptor[]> => invoke('dns:listPresets')
export const dnsGetStatus = (): Promise<DnsManagerStatus> => invoke('dns:status')
export const dnsApplyConfig = (opts: {
  presetId: string
  primary?: string
  secondary?: string
  dohUrl?: string
}): Promise<DnsManagerStatus> => invoke('dns:apply', opts)
export const dnsResetDhcp = (): Promise<DnsManagerStatus> => invoke('dns:reset')

// ---- Mods -------------------------------------------------------------------
export const modsList = (): Promise<InstalledMod[]> => invoke('mods:list')
export const modsToggle = (modId: string, enabled: boolean): Promise<InstalledMod[]> =>
  invoke('mods:toggle', modId, enabled)
export const modsReorder = (modOrder: string[]): Promise<InstalledMod[]> =>
  invoke('mods:reorder', modOrder)
export const modsRemove = (modId: string): Promise<InstalledMod[]> =>
  invoke('mods:remove', modId)
export const modsImportZip = (
  bytes: Uint8Array,
  fileName?: string
): Promise<InstalledMod[]> => invoke('mods:importZip', bytes, fileName)

// ---- Diagnostics & Discord Cache --------------------------------------------
export const diagnosticsRun = (): Promise<DiagnosticCheckItem[]> => invoke('diagnostics:run')
export const diagnosticsFix = (checkId: string): Promise<DiagnosticCheckItem[]> =>
  invoke('diagnostics:fix', checkId)
export const diagnosticsClearDiscordCache = (): Promise<{
  cleanedDirs: number
  freedBytes: number
  freedMb: number
}> => invoke('diagnostics:clearDiscordCache')

// ---- Profiles ---------------------------------------------------------------
export const profilesList = (): Promise<{
  activeProfileId: string
  profiles: ConfigProfile[]
}> => invoke('profiles:list')
export const profilesSwitch = (
  profileId: string
): Promise<{ activeProfileId: string; profiles: ConfigProfile[] }> =>
  invoke('profiles:switch', profileId)
export const profilesSave = (
  profileId?: string,
  customName?: string
): Promise<{ activeProfileId: string; profiles: ConfigProfile[] }> =>
  invoke('profiles:save', profileId, customName)
export const profilesCreate = (
  name: string
): Promise<{ activeProfileId: string; profiles: ConfigProfile[] }> =>
  invoke('profiles:create', name)
export const profilesDelete = (
  profileId: string
): Promise<{ activeProfileId: string; profiles: ConfigProfile[] }> =>
  invoke('profiles:delete', profileId)

// ---- GhosterNet self-update -------------------------------------------------
export interface AppUpdateInfo {
  installed: string
  latest?: string
  hasUpdate: boolean
  tag?: string
  assetName?: string
  assetUrl?: string
  assetSize?: number
  releaseUrl?: string
  releaseNotes?: string
  publishedAt?: string
  dismissed?: boolean
}
export const appCheckUpdate = (force = false): Promise<AppUpdateInfo> =>
  invoke('app:checkUpdate', force)
export const appInstallUpdate = (
  url: string,
  expectedVersion?: string
): Promise<{ scheduled: true }> =>
  invoke('app:installUpdate', url, expectedVersion)
export const appDismissUpdate = (tag: string): Promise<void> =>
  invoke('app:dismissUpdate', tag)

// ---- App control ------------------------------------------------------------
export const appQuit = (): Promise<void> => invoke('app:quit')
export const appRelaunch = (): Promise<void> => invoke('app:relaunch')

export const needsFirstRunAdmin = async (): Promise<boolean> => false
export const restartAsAdmin = async (): Promise<void> => {
  await appRelaunch()
}
