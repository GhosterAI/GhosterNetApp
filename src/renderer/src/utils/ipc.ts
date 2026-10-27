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

export interface TelegramDcBenchmark {
  id: number
  name: string
  location: string
  ip: string
  latencyMs: number
  ok: boolean
  recommended: boolean
}
export const tgwsPingDcs = (): Promise<TelegramDcBenchmark[]> => invoke('tgws:pingDcs')

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

export interface AutoFixReport {
  ok: boolean
  actions: string[]
  discordFreedMb: number
}

export interface LiveServiceStatus {
  id: string
  name: string
  category: 'media' | 'social' | 'ai'
  target: string
  ok: boolean
  latencyMs: number
  statusText: string
}

export const diagnosticsAutoFix = (): Promise<AutoFixReport> => invoke('diagnostics:autoFix')
export const diagnosticsLiveServices = (): Promise<LiveServiceStatus[]> =>
  invoke('diagnostics:liveServices')

// ---- Profiles & Config Backup -----------------------------------------------
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

export const configExportFull = (): Promise<string> => invoke('config:exportFull')
export const configImportFull = (
  raw: string
): Promise<{ ok: boolean; activeProfileId?: string; message: string }> =>
  invoke('config:importFull', raw)
export const configExportDialog = (): Promise<{ saved: boolean; path?: string }> =>
  invoke('config:exportDialog')
export const configImportDialog = (): Promise<{ ok: boolean; activeProfileId?: string; message: string }> =>
  invoke('config:importDialog')

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

// ---- DNS-AI (Encrypted DoH for AI services) ---------------------------------
export type DnsAiMode = 'stub' | 'native'

export interface DnsAiSettings {
  enabled: boolean
  mode: DnsAiMode
  ipv6: boolean
  include_vpn_adapters: boolean
  autostart_tray: boolean
  service_autostart: boolean
}

export interface DnsAiAdapterView {
  alias: string
  index: number
  current_v4: string
  current_v6: string
}

export interface DnsAiStatus {
  available: boolean
  binaryPath: string
  daemonRunning: boolean
  serviceInstalled: boolean
  serviceRunning: boolean
  enabled: boolean
  stubRunning: boolean
  nativeSupported: boolean
  serviceVersion: string
  settings: DnsAiSettings
  adapters: DnsAiAdapterView[]
  endpoints: {
    dohUrl: string
    dotHost: string
    ipv4: string[]
    ipv6: string[]
  }
}

export const dnsAiGetStatus = (): Promise<DnsAiStatus> => invoke('dnsAi:status')
export const dnsAiEnable = (): Promise<DnsAiStatus> => invoke('dnsAi:enable')
export const dnsAiDisable = (): Promise<DnsAiStatus> => invoke('dnsAi:disable')
export const dnsAiSetSettings = (partial: Partial<DnsAiSettings>): Promise<DnsAiStatus> =>
  invoke('dnsAi:setSettings', partial)
export const dnsAiInstallService = (): Promise<DnsAiStatus> => invoke('dnsAi:installService')
export const dnsAiUninstallService = (): Promise<DnsAiStatus> => invoke('dnsAi:uninstallService')
export const dnsAiTestDoh = (
  domain?: string,
  qtype?: string
): Promise<{ ok: boolean; output: string; latencyMs: number }> =>
  invoke('dnsAi:testDoh', domain, qtype)

export interface DnsAiServiceCheckResult {
  name: string
  domain: string
  ip: string
  dnsOk: boolean
  httpOk: boolean
  statusCode: number
  latencyMs: number
  error?: string
}

export const dnsAiCheckServices = (): Promise<DnsAiServiceCheckResult[]> =>
  invoke('dnsAi:checkServices')

export interface DnsAiUpdateInfo {
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
export const dnsAiCheckUpdate = (force = false): Promise<DnsAiUpdateInfo> =>
  invoke('dnsAi:checkUpdate', force)
export const dnsAiInstallUpdate = (
  url: string,
  expectedVersion?: string
): Promise<{ installedVersion?: string; sizeBytes: number }> =>
  invoke('dnsAi:installUpdate', url, expectedVersion)
export const dnsAiDismissUpdate = (tag: string): Promise<void> =>
  invoke('dnsAi:dismissUpdate', tag)
export const dnsAiFixGemini = (): Promise<SystemHostsState> =>
  invoke('dnsAi:fixGemini')

// ---- Antigravity Unlocker ---------------------------------------------------
export interface AgUnlockerSettings {
  client_patch: boolean
  auto_patch: boolean
  group_key: string
  license_key: string
  group_key_at: number
  own_proxy_at: number
  patch_declined: boolean
  dns: boolean
  local_proxy: boolean
  builtin_exits: boolean
  group_proxy: boolean
  disabled_providers: string[]
  rotate_providers: boolean
  provider_order: string[]
  vpn_detect: boolean
  verify_tls: boolean
  own_proxy: string
  own_proxy_enabled: boolean
  manual_paths: string[]
}

export interface AgInstallRow {
  label: string
  path: string | null
  patched: boolean | null
  manual: boolean
}

export interface AgRouteEntry {
  label: string
  usable: boolean
  latency_ms?: number
  proven: boolean
  ok_ago?: number
  refused_ago?: number
  answers: number
  refusals: number
  bench_left?: number
  open: boolean
}

export interface AgBlockerEntry {
  what: string
  addr: string
  cause: string
  by?: string
  error: string
}

export interface AgGateRecord {
  at: number
  route: string
  forced_until: number
  stood_down: boolean
  last_400: {
    at: number
    count: number
    acted: string
    route: string
    bypassed: boolean
  } | null
  last_ok: {
    at: number
    route: string
  } | null
  loopback: boolean
  tunnel: boolean
  vpn_exit: string
  routes: AgRouteEntry[]
  version: number
  blockers: AgBlockerEntry[]
  reached_at: number
  started_at: number
  exe: string
}

export interface AgUnlockerStatus {
  binaryAvailable: boolean
  installedExePath: string
  relayInstalled: boolean
  relayRunning: boolean
  watchdogInstalled: boolean
  nrptApplied: boolean
  proxyEnvSet: boolean
  proxyUrl: string
  pcCode: string
  settings: AgUnlockerSettings
  installs: AgInstallRow[]
  gate: AgGateRecord | null
  providers: Array<{ name: string; enabled: boolean }>
}

export const agGetStatus = (deep = false): Promise<AgUnlockerStatus> => invoke('ag:status', deep)
export const agPatchInstall = (
  targetPath?: string
): Promise<{ ok: boolean; patched: string[]; errors: string[] }> => invoke('ag:patch', targetPath)
export const agUnpatchInstall = (
  targetPath?: string
): Promise<{ ok: boolean; unpatched: string[]; errors: string[] }> =>
  invoke('ag:unpatch', targetPath)
export const agSetCapability = (cap: string, enabled: boolean): Promise<AgUnlockerStatus> =>
  invoke('ag:setCap', cap, enabled)
export const agEnableAll = (): Promise<AgUnlockerStatus> => invoke('ag:enableAll')
export const agDisableAll = (): Promise<AgUnlockerStatus> => invoke('ag:disableAll')
export const agRepairService = (): Promise<AgUnlockerStatus> => invoke('ag:repair')
export const agSetOwnProxy = (proxyStr: string): Promise<AgUnlockerStatus> =>
  invoke('ag:setOwnProxy', proxyStr)
export const agSetGroupKey = (groupKey: string): Promise<AgUnlockerStatus> =>
  invoke('ag:setGroupKey', groupKey)
export const agSetProvider = (name: string, enabled: boolean): Promise<AgUnlockerStatus> =>
  invoke('ag:setProvider', name, enabled)
export const agReorderProviders = (order: string[]): Promise<AgUnlockerStatus> =>
  invoke('ag:reorderProviders', order)
export const agAddManualPath = (dirPath: string): Promise<AgUnlockerStatus> =>
  invoke('ag:addManualPath', dirPath)
export const agRemoveManualPath = (dirPath: string): Promise<AgUnlockerStatus> =>
  invoke('ag:removeManualPath', dirPath)
export const agGetLogs = (): Promise<{ forwarder: string; watchdog: string }> => invoke('ag:logs')
export const agPickFolder = (): Promise<string | null> => invoke('ag:pickFolder')

export interface AgUpdateInfo {
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
export const agCheckUpdate = (force = false): Promise<AgUpdateInfo> =>
  invoke('ag:checkUpdate', force)
export const agInstallUpdate = (
  url: string,
  expectedVersion?: string
): Promise<{ installedVersion?: string; sizeBytes: number }> =>
  invoke('ag:installUpdate', url, expectedVersion)
export const agDismissUpdate = (tag: string): Promise<void> =>
  invoke('ag:dismissUpdate', tag)

// ---- Universal VPN (sing-box + VLESS / Reality / Hysteria2) --------------
export const vpnStatus = (): Promise<VpnStatus> => invoke('vpn:status')
export const vpnStart = (): Promise<void> => invoke('vpn:start')
export const vpnStop = (): Promise<void> => invoke('vpn:stop')
export const vpnRestart = (): Promise<void> => invoke('vpn:restart')
export interface VpnAddResult {
  subscription?: VpnSubscription
  servers: VpnServer[]
}
export const vpnAddSubscription = (input: string): Promise<VpnAddResult> =>
  invoke('vpn:addSubscription', input)
export const vpnUpdateSubscription = (id: string): Promise<VpnSubscription> =>
  invoke('vpn:updateSubscription', id)
export const vpnDeleteSubscription = (id: string): Promise<void> =>
  invoke('vpn:deleteSubscription', id)
export const vpnSelectServer = (serverId: string): Promise<void> =>
  invoke('vpn:selectServer', serverId)
export const vpnTestLatency = (serverId?: string): Promise<Record<string, number | null>> =>
  invoke('vpn:testLatency', serverId)
export const vpnSetRoutingMode = (mode: VpnRoutingMode): Promise<void> =>
  invoke('vpn:setRoutingMode', mode)
export const vpnSetTunMode = (enabled: boolean): Promise<void> =>
  invoke('vpn:setTunMode', enabled)
export const vpnSetProcessRouting = (
  mode: ProcessRoutingMode,
  list: string[]
): Promise<void> => invoke('vpn:setProcessRouting', mode, list)

// ---- Discord Voice & Video Fixer --------------------------------------------
export interface DiscordVoiceFixResult {
  ok: boolean
  freedMb: number
  actions: string[]
}
export const discordFixVoice = (): Promise<DiscordVoiceFixResult> =>
  invoke('discord:fixVoice')

// ---- Zapret Auto-Failover ---------------------------------------------------
export const zapretFailoverSwitch = (): Promise<string | null> =>
  invoke('zapret:failoverSwitch')


// ---- App control ------------------------------------------------------------
export const appQuit = (): Promise<void> => invoke('app:quit')
export const appRelaunch = (): Promise<void> => invoke('app:relaunch')

export const needsFirstRunAdmin = async (): Promise<boolean> => false
export const restartAsAdmin = async (): Promise<void> => {
  await appRelaunch()
}
