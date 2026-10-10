import { randomBytes } from 'crypto'

/**
 * Bump this any time we want to force a partial reset of fields that older
 * (dev / stale) configs may have polluted.
 */
export const CONFIG_VERSION = 5

export const defaultConfig: AppConfig = {
  configVersion: CONFIG_VERSION,
  appTheme: 'dark',
  accentColor: 'emerald',
  disableTray: false,
  hideTaskbarIcon: false,
  autoLaunch: false,
  silentStart: false,
  autoRestartOnWake: true,
  firstRunDone: false,
  language: 'ru-RU',
  autoCheckUpdate: true,
  maxLogDays: 7,
  disableGPU: false,
  activeProfileId: 'default',
  profiles: [
    {
      id: 'default',
      name: 'Основной',
      activeStrategy: undefined,
      gameFilter: false,
      gameFilterMode: 'disabled',
      ipsetMode: 'loaded',
      blockQuic: false,
      selectedServices: [
        'youtube',
        'discord',
        'telegram',
        'cloudflare',
        'clouds',
        'github'
      ],
      enabledMods: [],
      dnsPresetId: 'system'
    }
  ],
  dns: {
    presetId: 'system',
    primary: '',
    secondary: '',
    dohUrl: '',
    active: false,
    snapshot: undefined
  },
  tgws: {
    enabled: false,
    autoStart: false,
    host: '127.0.0.1',
    port: 1443,
    secret: randomBytes(16).toString('hex'),
    secretPrefix: 'dd',
    dcIp: [],
    bufKb: 256,
    poolSize: 4,
    verbose: false,
    cfproxy: true,
    cfproxyPriority: true,
    cfproxyUserDomain: '',
    cfproxyWorkerDomain: '',
    fakeTlsDomain: '',
    mediaMode: 'default',
    disableH2: false,
    disableSecure: false
  },
  zapret: {
    enabled: false,
    autoStart: false,
    activeStrategy: undefined,
    favoriteStrategies: [],
    gameFilter: false,
    gameFilterMode: 'disabled',
    ipsetMode: 'loaded',
    useService: false,
    blockQuic: false,
    vpnCoexistence: true,
    udpExcludePorts: '51820',
    discordUdpFakeBin: 'quic_initial_www_google_com.bin',
    gameUdpFakeBin: 'quic_initial_www_google_com.bin',
    selectedServices: [
      'youtube',
      'discord',
      'telegram',
      'cloudflare',
      'clouds',
      'github'
    ],
    enabledMods: [],
    modOrder: [],
    systemHostsManaged: false
  }
}