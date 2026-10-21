interface AppVersion {
  version: string
  changelog: string
}

type ZapretGameFilterMode = 'disabled' | 'tcpudp' | 'tcp' | 'udp'
type GameFilterMode = ZapretGameFilterMode
type ZapretIpsetMode = 'none' | 'loaded' | 'any'
type IpsetMode = ZapretIpsetMode
type TgwsMediaMode = 'default' | 'media_fix' | 'empty'
type ListCollectionKind = 'domains' | 'exclude_domains' | 'all_ips' | 'ips'
type UserCollectionKind = ListCollectionKind
type ServiceCategory = 'gaming' | 'socials' | 'workplace'

type DnsPreset = string
type DnsPresetId = string

interface DnsConfig {
  presetId: string
  primary: string
  secondary: string
  dohUrl: string
  active: boolean
  snapshot?: unknown
}

interface ConfigProfile {
  id: string
  name: string
  activeStrategy?: string
  gameFilter: boolean
  gameFilterMode: ZapretGameFilterMode
  ipsetMode: ZapretIpsetMode
  blockQuic: boolean
  selectedServices: string[]
  enabledMods: string[]
  dnsPresetId: string
}

interface ServicePresetInfo {
  id: string
  title: string
  description: string
  category: ServiceCategory
  accent: string
  enabled: boolean
  domainsCount?: number
  ipsCount?: number
  hostsCount?: number
  excludeDomainsCount?: number
}

interface InstalledMod {
  id: string
  name: string
  description: string
  author: string
  version: string
  sourceType: 'zapret_bundle' | 'lists_pack'
  sourceUrl?: string
  enabled: boolean
  bundled?: boolean
  path: string
  strategies: string[]
  lists?: string[]
  bins?: string[]
  hasHosts?: boolean
}

interface DiagnosticCheckItem {
  id: string
  title: string
  status: 'ok' | 'warn' | 'warning' | 'error'
  detail: string
  fixable?: boolean
  canFix?: boolean
  fixAction?: string
}

interface AppConfig {
  // ---- Migration marker
  configVersion?: number
  lastBuildId?: string

  // ---- Appearance & locale
  appTheme: AppTheme
  accentColor?: AccentColor
  customTheme?: string
  disableTray?: boolean
  hideTaskbarIcon?: boolean
  autoLaunch?: boolean
  silentStart?: boolean
  autoRestartOnWake?: boolean
  firstRunDone?: boolean
  launchTelegram?: boolean
  launchDiscord?: boolean
  language?: 'en-US' | 'ru-RU' | 'zh-CN'

  // ---- Profiles & Onboarding
  activeProfileId?: string
  profiles?: ConfigProfile[]
  onboardingCompleted?: boolean

  // ---- Integrations & Notifications
  notificationsEnabled?: boolean
  discordRpc?: boolean
  discordRpcDetail?: string
  syncSystemHosts?: boolean

  // ---- Selected Services
  selectedServiceIds?: string[]

  // ---- Updates
  autoCheckUpdate: boolean
  dismissedAppUpdateTag?: string

  // ---- Logs
  maxLogDays: number

  // ---- Shortcuts
  showWindowShortcut?: string
  restartAppShortcut?: string
  tgwsToggleShortcut?: string
  zapretToggleShortcut?: string

  // ---- GPU / low-level
  disableGPU: boolean

  // ---- Feature-specific sub-configs
  tgws?: TgwsConfig
  zapret?: ZapretConfig
  dns?: DnsConfig
  dnsAi?: DnsAiConfig
  agUnlocker?: AgUnlockerConfig
  vpn?: VpnConfig
}

type VpnRoutingMode = 'bypass-ru' | 'global' | 'proxy-only' | 'ai-socials'
type ProcessRoutingMode = 'all' | 'include' | 'exclude'

interface SpeedtestResult {
  pingMs: number
  jitterMs: number
  downloadMbps: number
  uploadMbps?: number
  isp?: string
  serverLocation?: string
}

interface TrafficStats {
  downSpeedBps: number
  upSpeedBps: number
  totalDownBytes: number
  totalUpBytes: number
  activeConnections?: number
}

interface ZapretFailoverState {
  enabled: boolean
  lastSwitchAt?: number
  currentStrategy?: string
  consecutiveFailures: number
  failureHistory: Array<{ timestamp: number; strategy: string; reason: string }>
}
type VpnProtocolType =
  | 'vless'
  | 'vmess'
  | 'trojan'
  | 'shadowsocks'
  | 'hysteria2'
  | 'tuic'
  | 'wireguard'
  | 'awg'
  | 'unknown'

interface VpnServer {
  id: string
  name: string
  type: VpnProtocolType
  server: string
  serverPort: number
  latencyMs?: number | null
  countryCode?: string
  rawUri: string
  subscriptionId?: string
  details?: Record<string, unknown>
}

interface VpnSubscription {
  id: string
  name: string
  url: string
  updatedAt?: number
  uploadBytes?: number
  downloadBytes?: number
  totalBytes?: number
  expireTimestamp?: number
  serverCount?: number
}

interface VpnConfig {
  enabled: boolean
  autoStart?: boolean
  routingMode: VpnRoutingMode
  tunMode: boolean
  selectedServerId?: string
  subscriptions: VpnSubscription[]
  servers: VpnServer[]
  localHttpPort?: number
  localSocksPort?: number
  processRoutingMode?: ProcessRoutingMode
  processList?: string[]
}

interface VpnStatus extends CoreStatus {
  activeServer?: VpnServer
  routingMode: VpnRoutingMode
  tunMode: boolean
  localHttpPort?: number
  localSocksPort?: number
  uploadSpeedBps?: number
  downloadSpeedBps?: number
  processRoutingMode?: ProcessRoutingMode
  processList?: string[]
}

interface DnsAiConfig {
  installedVersion?: string
  dismissedUpdateTag?: string
}

interface AgUnlockerConfig {
  installedVersion?: string
  dismissedUpdateTag?: string
}

interface TgwsConfig {
  enabled: boolean
  autoStart?: boolean
  host: string
  port: number
  secret: string
  secretPrefix?: 'none' | 'dd' | 'ee'
  mediaMode?: TgwsMediaMode
  dcIp?: string[]
  bufKb?: number
  poolSize?: number
  verbose?: boolean
  cfproxy?: boolean
  cfproxyPriority?: boolean
  cfproxyUserDomain?: string
  cfproxyWorkerDomain?: string
  disableH2?: boolean
  disableSecure?: boolean
  fakeTlsDomain?: string
  binaryPath?: string
  installedVersion?: string
  dismissedUpdateTag?: string
}

interface ZapretConfig {
  enabled: boolean
  autoStart?: boolean
  activeStrategy?: string
  favoriteStrategies?: string[]
  gameFilter?: boolean
  gameFilterMode?: ZapretGameFilterMode
  ipsetMode?: ZapretIpsetMode
  blockQuic?: boolean
  udpExcludePorts?: string
  vpnCoexistence?: boolean
  discordUdpFake?: string
  gameUdpFake?: string
  discordUdpFakeBin?: string
  gameUdpFakeBin?: string
  discordVoiceFix?: boolean
  autoFailover?: boolean
  selectedServices?: string[]
  enabledMods?: string[]
  modOrder?: string[]
  systemHostsManaged?: boolean
  bundlePath?: string
  useService?: boolean
  installedVersion?: string
  dismissedUpdateTag?: string
}

type CoreStatusState = 'stopped' | 'starting' | 'running' | 'stopping' | 'error'

interface CoreStatus {
  state: CoreStatusState
  pid?: number
  startedAt?: number
  lastError?: string
}

