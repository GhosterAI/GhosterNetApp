import { spawn, spawnSync, ChildProcess } from 'child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs'
import path from 'path'
import AdmZip from 'adm-zip'
import { BrowserWindow } from 'electron'
import { zapretBundleDir, zapretRuntimeDir } from '../utils/dirs'
import { getAppConfig, patchAppConfig } from '../config'
import { ALWAYS_APPLY_SERVICE_IDS, SERVICE_RULES } from './service-catalog'
import { listInstalledMods } from './mods'
import { loadUserOverrides } from './zapret-files'
import {
  detectVpnPriorityContext,
  excludeUdpPortsFromCommand
} from './vpn-detector'
import { applySystemHosts } from './system-hosts'

export interface StrategyDescriptor {
  file: string
  title: string
  description: string
  favorite?: boolean
  modId?: string
  modName?: string
}

const KNOWN_STRATEGY_DESCRIPTIONS: Record<string, string> = {
  'general.bat': 'Стандартная универсальная стратегия (multisplit + fake QUIC)',
  'general (alt).bat': 'Альтернативная стратегия #1 (fakedsplit + badseq)',
  'general (alt2).bat': 'Альтернативная стратегия #2 (multisplit seqovl 652)',
  'general (alt3).bat': 'Альтернативная стратегия #3 (fakedsplit + hostfakesplit)',
  'general (alt4).bat': 'Альтернативная стратегия #4 (fake + multisplit badseq)',
  'general (alt5).bat': 'Альтернативная стратегия #5 (syndata + multidisorder)',
  'general (alt6).bat': 'Альтернативная стратегия #6 (multisplit pos=2 + seqovl)',
  'general (alt7).bat': 'Альтернативная стратегия #7 (fake + fakedsplit TLS)',
  'general (alt8).bat': 'Альтернативная стратегия #8 (fake + autottl)',
  'general (alt9).bat': 'Альтернативная стратегия #9 (hostfakesplit + disorder)',
  'general (alt10).bat': 'Альтернативная стратегия #10 (fake + multidisorder pos=1,midsld)',
  'general (alt11).bat': 'Альтернативная стратегия #11 (multisplit + TLS Google pattern)',
  'general (fake tls auto).bat': 'Автоматическая подмена TLS ClientHello (Fake TLS Auto)',
  'general (fake tls auto alt).bat': 'Fake TLS Auto (альтернативный профиль)',
  'general (fake tls auto alt2).bat': 'Fake TLS Auto #2 (расширенный профиль)',
  'general (fake tls auto alt3).bat': 'Fake TLS Auto #3 (агрессивный профиль)',
  'general (simple fake).bat': 'Простой Fake-профиль без фрагментации пакетов',
  'general (simple fake alt).bat': 'Простой Fake-профиль (альтернативный)',
  'general (simple fake alt2).bat': 'Простой Fake-профиль #2'
}

const QUIC_FIREWALL_RULE_NAME = 'GhosterNet Block QUIC'

let child: ChildProcess | null = null
let status: CoreStatus = { state: 'stopped' }

function broadcast(channel: string, ...args: unknown[]): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, ...args)
  }
}

function log(type: ControllerLog['type'], payload: string): void {
  broadcast('log', {
    time: Date.now(),
    type,
    source: 'zapret',
    payload
  } satisfies ControllerLog)
}

function setStatus(next: Partial<CoreStatus>): void {
  status = { ...status, ...next }
  broadcast('zapret:status', status)
}

export function getZapretStatus(): CoreStatus {
  return status
}

function inferStrategyDescription(fileName: string, content: string): string {
  const lower = fileName.toLowerCase()
  if (KNOWN_STRATEGY_DESCRIPTIONS[lower]) {
    return KNOWN_STRATEGY_DESCRIPTIONS[lower]
  }
  const desyncModes = new Set<string>()
  const matches = content.matchAll(/--dpi-desync=([a-zA-Z0-9_,+-]+)/g)
  for (const m of matches) {
    for (const part of m[1].split(',')) {
      if (part.trim()) desyncModes.add(part.trim())
    }
  }
  if (desyncModes.size > 0) {
    return `Методы обхода: ${Array.from(desyncModes).join(', ')}`
  }
  return 'Пользовательская стратегия обхода DPI'
}

export async function listStrategies(): Promise<StrategyDescriptor[]> {
  const dir = zapretBundleDir()
  if (!existsSync(dir)) return []
  const cfg = await getAppConfig()
  const favorites = new Set<string>(cfg.zapret?.favoriteStrategies ?? [])

  // Also check enabled mods so we can tag strategies that came from mods
  const modStrategyMap = new Map<string, { modId: string; modName: string; fullPath: string }>()
  try {
    const mods = await listInstalledMods()
    for (const mod of mods) {
      if (!mod.enabled || !mod.path || !existsSync(mod.path)) continue
      for (const s of mod.strategies) {
        modStrategyMap.set(s.toLowerCase(), {
          modId: mod.id,
          modName: mod.name,
          fullPath: path.join(mod.path, s)
        })
      }
    }
  } catch {
    /* noop */
  }

  const out: StrategyDescriptor[] = []
  const seen = new Set<string>()

  // 1. Base bundle strategies
  for (const f of readdirSync(dir)) {
    if (!f.toLowerCase().endsWith('.bat')) continue
    if (f.toLowerCase().startsWith('service') || f.startsWith('.')) continue
    seen.add(f.toLowerCase())
    const full = path.join(dir, f)
    let raw = ''
    try {
      raw = readFileSync(full, 'utf-8')
    } catch {
      /* noop */
    }
    const modInfo = modStrategyMap.get(f.toLowerCase())
    out.push({
      file: f,
      title: f.replace(/\.bat$/i, ''),
      description: inferStrategyDescription(f, raw),
      favorite: favorites.has(f),
      modId: modInfo?.modId,
      modName: modInfo?.modName
    })
  }

  // 2. Enabled mod strategies that aren't copied into base yet
  for (const [lowerName, info] of modStrategyMap.entries()) {
    if (seen.has(lowerName)) continue
    const fileName = path.basename(info.fullPath)
    let raw = ''
    try {
      raw = readFileSync(info.fullPath, 'utf-8')
    } catch {
      /* noop */
    }
    out.push({
      file: fileName,
      title: fileName.replace(/\.bat$/i, ''),
      description: `[Мод: ${info.modName}] ${inferStrategyDescription(fileName, raw)}`,
      favorite: favorites.has(fileName),
      modId: info.modId,
      modName: info.modName
    })
  }

  return out.sort((a, b) => {
    if (a.favorite && !b.favorite) return -1
    if (!a.favorite && b.favorite) return 1
    return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })
  })
}

export async function toggleFavoriteStrategy(file: string): Promise<string[]> {
  const cfg = await getAppConfig()
  const favs = new Set<string>(cfg.zapret?.favoriteStrategies ?? [])
  if (favs.has(file)) favs.delete(file)
  else favs.add(file)
  const nextFavs = Array.from(favs)
  await patchAppConfig({
    zapret: {
      ...(cfg.zapret as ZapretConfig),
      favoriteStrategies: nextFavs
    }
  })
  return nextFavs
}

export function listFakeBinPayloads(): string[] {
  const binDir = path.join(zapretBundleDir(), 'bin')
  if (!existsSync(binDir)) return []
  return readdirSync(binDir)
    .filter(
      (f) =>
        f.toLowerCase().endsWith('.bin') &&
        !f.toUpperCase().startsWith('ACTIVE_')
    )
    .sort()
}

export function applyQuicFirewallRule(enable: boolean): void {
  if (process.platform !== 'win32') return
  try {
    spawnSync(
      'netsh.exe',
      ['advfirewall', 'firewall', 'delete', 'rule', `name=${QUIC_FIREWALL_RULE_NAME}`],
      { windowsHide: true, timeout: 4000 }
    )
    if (enable) {
      spawnSync(
        'netsh.exe',
        [
          'advfirewall',
          'firewall',
          'add',
          'rule',
          `name=${QUIC_FIREWALL_RULE_NAME}`,
          'dir=out',
          'action=block',
          'protocol=UDP',
          'remoteport=443'
        ],
        { windowsHide: true, timeout: 4000 }
      )
      log('info', 'Правило брандмауэра Block QUIC (UDP 443) активировано')
    }
  } catch (e) {
    log('warn', `Не удалось обновить правило Block QUIC: ${e}`)
  }
}

function readLines(filePath: string): string[] {
  if (!existsSync(filePath)) return []
  try {
    return readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
  } catch {
    return []
  }
}

function writeLines(filePath: string, lines: string[]): void {
  mkdirSync(path.dirname(filePath), { recursive: true })
  const unique = Array.from(new Set(lines.map((l) => l.trim()).filter(Boolean)))
  writeFileSync(filePath, unique.length > 0 ? unique.join('\n') + '\n' : '', 'utf8')
}

/**
 * Materialize service presets, enabled mods, user overrides, game_filter.enabled,
 * ipsetMode, and active UDP fake payloads into the Zapret bundle directory.
 */
export async function materializeZapretRuntime(overrideOpts?: {
  ipsetMode?: 'loaded' | 'none' | 'any'
  gameFilterMode?: 'disabled' | 'tcpudp' | 'tcp' | 'udp'
}): Promise<void> {
  const cfg = await getAppConfig()
  const z = cfg.zapret ?? ({} as ZapretConfig)
  const dir = zapretBundleDir()
  if (!existsSync(dir)) return

  const listsDir = path.join(dir, 'lists')
  const binDir = path.join(dir, 'bin')
  const utilsDir = path.join(dir, 'utils')
  mkdirSync(listsDir, { recursive: true })
  mkdirSync(binDir, { recursive: true })
  mkdirSync(utilsDir, { recursive: true })

  // Ensure user list files exist
  for (const uf of [
    'list-general-user.txt',
    'list-exclude-user.txt',
    'ipset-all-user.txt',
    'ipset-exclude-user.txt'
  ]) {
    const p = path.join(listsDir, uf)
    if (!existsSync(p)) writeFileSync(p, '', 'utf8')
  }

  // 1. Overlay enabled mods (strategies, bin/*.bin, lists/*.txt)
  try {
    const mods = await listInstalledMods()
    for (const mod of mods) {
      if (!mod.enabled || !mod.path || !existsSync(mod.path)) continue
      for (const f of readdirSync(mod.path)) {
        if (f.toLowerCase().endsWith('.bat') && !f.toLowerCase().startsWith('service')) {
          const srcBat = path.join(mod.path, f)
          const dstBat = path.join(dir, f)
          const raw = readFileSync(srcBat, 'utf8').replace(/start\s+"[^"]*"\s+\/min\s+/gi, '')
          writeFileSync(dstBat, raw, 'utf8')
        }
      }
      const modBin = path.join(mod.path, 'bin')
      if (existsSync(modBin)) {
        for (const f of readdirSync(modBin)) {
          if (f.toLowerCase().endsWith('.bin')) {
            copyFileSync(path.join(modBin, f), path.join(binDir, f))
          }
        }
      }
      const modLists = path.join(mod.path, 'lists')
      if (existsSync(modLists)) {
        for (const f of readdirSync(modLists)) {
          if (f.toLowerCase().endsWith('.txt')) {
            const existing = readLines(path.join(listsDir, f))
            const incoming = readLines(path.join(modLists, f))
            writeLines(path.join(listsDir, f), [...existing, ...incoming])
          }
        }
      }
    }
  } catch (e) {
    log('warn', `Ошибка наложения модов: ${e}`)
  }

  // 2. Apply ipsetMode ('loaded' | 'none' | 'any')
  const ipsetMode = overrideOpts?.ipsetMode ?? z.ipsetMode ?? 'loaded'
  const ipsetPath = path.join(listsDir, 'ipset-all.txt')
  const ipsetBackupPath = path.join(listsDir, 'ipset-all.txt.backup')

  if (ipsetMode === 'loaded') {
    if (existsSync(ipsetBackupPath)) {
      const currentSize = existsSync(ipsetPath) ? readFileSync(ipsetPath).length : 0
      const backupSize = readFileSync(ipsetBackupPath).length
      if (currentSize < 128 && backupSize > 128) {
        copyFileSync(ipsetBackupPath, ipsetPath)
      }
    }
  } else if (ipsetMode === 'none') {
    if (existsSync(ipsetPath) && !existsSync(ipsetBackupPath)) {
      const content = readFileSync(ipsetPath, 'utf8')
      if (content.trim().length > 64) {
        writeFileSync(ipsetBackupPath, content, 'utf8')
      }
    }
    writeFileSync(ipsetPath, '203.0.113.113/32\n', 'utf8')
  } else if (ipsetMode === 'any') {
    if (existsSync(ipsetPath) && !existsSync(ipsetBackupPath)) {
      const content = readFileSync(ipsetPath, 'utf8')
      if (content.trim().length > 64) {
        writeFileSync(ipsetBackupPath, content, 'utf8')
      }
    }
    writeFileSync(ipsetPath, '', 'utf8')
  }

  // 3. Apply Selected Services (SERVICE_RULES) with conflict resolution
  const selectedIds = Array.from(
    new Set([...ALWAYS_APPLY_SERVICE_IDS, ...(z.selectedServices ?? [])])
  )

  const listGeneralLines = readLines(path.join(listsDir, 'list-general.txt'))
  const listExcludeLines = readLines(path.join(listsDir, 'list-exclude.txt'))
  const listGoogleLines = readLines(path.join(listsDir, 'list-google.txt'))
  const ipsetExcludeLines = readLines(path.join(listsDir, 'ipset-exclude.txt'))
  const ipsetAllLines = ipsetMode === 'loaded' ? readLines(ipsetPath) : []

  const addedGeneral = new Set<string>()
  const addedExclude = new Set<string>()

  for (const id of selectedIds) {
    const rule = SERVICE_RULES[id]
    if (!rule) continue
    if (rule.listGeneral) {
      for (const d of rule.listGeneral) {
        listGeneralLines.push(d)
        addedGeneral.add(d.toLowerCase())
      }
    }
    if (rule.listExclude) {
      for (const d of rule.listExclude) {
        listExcludeLines.push(d)
        addedExclude.add(d.toLowerCase())
      }
    }
    if (rule.listGoogle) {
      listGoogleLines.push(...rule.listGoogle)
    }
    if (rule.ipsetExclude) {
      ipsetExcludeLines.push(...rule.ipsetExclude)
    }
    if (ipsetMode === 'loaded' && rule.ipsetAll) {
      ipsetAllLines.push(...rule.ipsetAll)
    }
    if (rule.extraLists) {
      for (const extra of rule.extraLists) {
        const extraPath = path.join(listsDir, path.basename(extra.filename))
        const existingExtra = readLines(extraPath)
        writeLines(extraPath, [...existingExtra, ...extra.lines])
      }
    }
  }

  // Conflict resolution: if a service is selected, remove its domains from list-exclude.txt
  const filteredExclude = listExcludeLines.filter(
    (d) => !addedGeneral.has(d.trim().toLowerCase())
  )
  const filteredGeneral = listGeneralLines.filter(
    (d) => !addedExclude.has(d.trim().toLowerCase())
  )

  writeLines(path.join(listsDir, 'list-general.txt'), filteredGeneral)
  writeLines(path.join(listsDir, 'list-exclude.txt'), filteredExclude)
  writeLines(path.join(listsDir, 'list-google.txt'), listGoogleLines)
  writeLines(path.join(listsDir, 'ipset-exclude.txt'), ipsetExcludeLines)
  if (ipsetMode === 'loaded' && ipsetAllLines.length > 0) {
    writeLines(ipsetPath, ipsetAllLines)
  }

  // 4. Apply user collection overrides
  const overrides = loadUserOverrides()
  const overrideMap: Array<[keyof typeof overrides, string]> = [
    ['domains', 'list-general-user.txt'],
    ['exclude_domains', 'list-exclude-user.txt'],
    ['all_ips', 'ipset-all-user.txt'],
    ['ips', 'ipset-exclude-user.txt']
  ]
  for (const [key, userFile] of overrideMap) {
    const ov = overrides[key]
    if (ov && ov.added.length > 0) {
      const up = path.join(listsDir, userFile)
      const current = readLines(up)
      writeLines(up, [...current, ...ov.added])
    }
  }

  // 5. Apply Game Filter mode to utils/game_filter.enabled
  const gameMode =
    overrideOpts?.gameFilterMode ??
    z.gameFilterMode ??
    (z.gameFilter ? 'tcpudp' : 'disabled')
  const gameFilterFile = path.join(utilsDir, 'game_filter.enabled')
  if (gameMode === 'disabled') {
    if (existsSync(gameFilterFile)) {
      try { rmSync(gameFilterFile, { force: true }) } catch { /* noop */ }
    }
  } else {
    const modeText = gameMode === 'tcp' ? 'tcp' : gameMode === 'udp' ? 'udp' : 'all'
    writeFileSync(gameFilterFile, modeText + '\n', 'utf8')
  }

  // 6. Copy selected UDP Fake payloads to ACTIVE_DISCORD_UDP.bin / ACTIVE_GAME_UDP.bin
  const discordFake = z.discordUdpFakeBin || 'quic_initial_www_google_com.bin'
  const gameFake = z.gameUdpFakeBin || 'quic_initial_www_google_com.bin'
  const discordFakeSrc = path.join(binDir, path.basename(discordFake))
  const gameFakeSrc = path.join(binDir, path.basename(gameFake))
  if (existsSync(discordFakeSrc)) {
    try { copyFileSync(discordFakeSrc, path.join(binDir, 'ACTIVE_DISCORD_UDP.bin')) } catch { /* noop */ }
  }
  if (existsSync(gameFakeSrc)) {
    try { copyFileSync(gameFakeSrc, path.join(binDir, 'ACTIVE_GAME_UDP.bin')) } catch { /* noop */ }
  }

  // 7. Apply QUIC firewall block rule
  applyQuicFirewallRule(Boolean(z.blockQuic))

  // 8. Sync system hosts if enabled
  if (z.systemHostsManaged) {
    try {
      await applySystemHosts()
    } catch {
      /* noop */
    }
  }
}

/**
 * Build a runtime batch wrapper `.ghosternet-run.bat` from the selected strategy `.bat`
 * that includes UDP port exclusions, VPN adapter/IP exclusions, and service `winwsArgs`.
 */
export async function buildRuntimeStrategyBatch(
  dir: string,
  strategyFile: string,
  z: ZapretConfig
): Promise<string> {
  let srcBat = path.join(dir, strategyFile)
  if (!existsSync(srcBat)) {
    // Check enabled mods for this strategy
    const mods = await listInstalledMods()
    for (const m of mods) {
      if (m.enabled && m.path) {
        const candidate = path.join(m.path, strategyFile)
        if (existsSync(candidate)) {
          srcBat = candidate
          break
        }
      }
    }
  }
  if (!existsSync(srcBat)) {
    throw new Error(`Стратегия не найдена: ${strategyFile}`)
  }

  let content = readFileSync(srcBat, 'utf8')
  content = content.replace(/start\s+"[^"]*"\s+\/min\s+/gi, '')
  content = content.replace(/cd\s+\/d\s+%BIN%/gi, 'cd /d "%BIN%"')
  content = content.replace(/^\s*call\s+service\.bat\s+.*$/gim, (m) => `rem ${m.trim()} handled by GhosterNet`)

  // Resolve %GameFilterTCP%, %GameFilterUDP%, and %GameFilter% directly before UDP port exclusion
  const gameMode = z.gameFilterMode ?? (z.gameFilter ? 'tcpudp' : 'disabled')
  const gameFilterTcp = gameMode === 'tcpudp' || gameMode === 'tcp' ? '1024-65535' : '12'
  const gameFilterUdp = gameMode === 'tcpudp' || gameMode === 'udp' ? '1024-65535' : '12'
  const gameFilterAll = gameMode !== 'disabled' ? '1024-65535' : '12'

  content = content
    .replace(/%GameFilterTCP%/gi, gameFilterTcp)
    .replace(/%GameFilterUDP%/gi, gameFilterUdp)
    .replace(/%GameFilter%/gi, gameFilterAll)

  // Collect extra winws.exe arguments from selected services (e.g. League of Legends TCP 2099)
  const extraTokens: string[] = []
  const selectedIds = new Set<string>([
    ...ALWAYS_APPLY_SERVICE_IDS,
    ...(z.selectedServices ?? [])
  ])
  const listsDir = path.join(dir, 'lists')

  for (const id of selectedIds) {
    const rule = SERVICE_RULES[id]
    if (!rule?.winwsArgs?.length) continue
    for (const arg of rule.winwsArgs) {
      if (arg.startsWith('--filter-tcp=')) {
        const portPart = arg.slice('--filter-tcp='.length).trim()
        if (/^\d+$/.test(portPart)) {
          content = content.replace(
            /(--wf-tcp=\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*)/i,
            `$1,${portPart}`
          )
        }
      }
      if (arg.includes('{lists}')) {
        const eqIdx = arg.indexOf('=')
        if (eqIdx > 0) {
          const optName = arg.slice(0, eqIdx + 1)
          const fileRel = arg.slice(eqIdx + 1).replace(/\{lists\}[\\/]?/g, '')
          extraTokens.push(`${optName}"%LISTS%${fileRel}"`)
        } else {
          extraTokens.push(arg.replace(/\{lists\}[\\/]?/g, '%LISTS%'))
        }
      } else {
        extraTokens.push(arg)
      }
    }
  }

  // Collect VPN coexistence safeguards if enabled
  if (z.vpnCoexistence !== false) {
    try {
      const vpn = await detectVpnPriorityContext()
      if (vpn.remoteIps.length > 0) {
        const ipsetExcludePath = path.join(listsDir, 'ipset-exclude.txt')
        const existingExclude = readLines(ipsetExcludePath)
        writeLines(ipsetExcludePath, [...existingExclude, ...vpn.remoteIps])
      }
      if (vpn.detectedProcesses.length > 0) {
        log(
          'info',
          `VPN Coexistence: обнаружен VPN (${vpn.detectedProcesses.join(', ')}), исключено IP-маршрутов: ${vpn.remoteIps.length}`
        )
      }
    } catch {
      /* noop */
    }
  }

  // Apply UDP Exclude Ports (e.g. 51820 for WireGuard) safely without consuming trailing commas
  if (z.udpExcludePorts && z.udpExcludePorts.trim()) {
    content = content
      .split(/\r?\n/)
      .map((line) => {
        if (line.includes('--wf-udp=') || line.includes('--filter-udp=')) {
          return line.replace(
            /(--(?:wf|filter)-udp=)(\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*)/g,
            (_match, prefix: string, ports: string) => {
              const res = excludeUdpPortsFromCommand([`${prefix}${ports}`], z.udpExcludePorts!)
              return res[0] || `${prefix}${ports}`
            }
          )
        }
        return line
      })
      .join('\r\n')
  }

  // Apply Discord Voice & Video Fixer (optimized UDP WebRTC STUN desync)
  if (z.discordVoiceFix) {
    extraTokens.push('--filter-udp=50000-50100 --dpi-desync=fake --dpi-desync-repeats=2')
  }

  if (extraTokens.length > 0) {
    const trimmed = content.trimEnd()
    content = `${trimmed} ${extraTokens.join(' ')}\r\n`
  }

  const runtimeBat = path.join(dir, '.ghosternet-run.bat')
  writeFileSync(runtimeBat, content, 'utf8')
  return runtimeBat
}

export async function installZapretBundle(
  zipBytes: Uint8Array
): Promise<{ strategies: number; installedVersion?: string }> {
  if (!zipBytes || zipBytes.length === 0) {
    throw new Error('Пустой архив')
  }

  if (status.state === 'running' || status.state === 'starting') {
    try { await stopZapret() } catch { /* best-effort */ }
  }

  if (process.platform === 'win32') {
    for (const name of WINDIVERT_SERVICE_NAMES) {
      try { spawnSync('sc.exe', ['stop', name], { windowsHide: true, timeout: 3000 }) } catch { /* noop */ }
      try { spawnSync('sc.exe', ['delete', name], { windowsHide: true, timeout: 3000 }) } catch { /* noop */ }
    }
    detectedWinDivertSvc = null
    await new Promise((r) => setTimeout(r, 400))
  }

  let zip: AdmZip
  try {
    zip = new AdmZip(Buffer.from(zipBytes))
  } catch (e) {
    throw new Error(`Не удалось прочитать архив: ${e instanceof Error ? e.message : String(e)}`)
  }

  const entries = zip.getEntries()
  const normalize = (n: string): string => n.replace(/\\/g, '/')

  const generalEntry = entries.find(
    (e) => !e.isDirectory && /(^|\/)general\.bat$/i.test(normalize(e.entryName))
  )
  if (!generalEntry) {
    throw new Error('Архив не содержит general.bat — это не сборка Zapret')
  }

  const generalPath = normalize(generalEntry.entryName)
  const rootPrefix = generalPath.includes('/')
    ? generalPath.slice(0, generalPath.lastIndexOf('/') + 1)
    : ''

  const expectedBin = `${rootPrefix}bin/winws.exe`
  const hasBin = entries.some(
    (e) => !e.isDirectory && normalize(e.entryName).toLowerCase() === expectedBin.toLowerCase()
  )
  if (!hasBin) {
    throw new Error('Архив повреждён или неполный: не найден bin/winws.exe')
  }

  const dest = zapretRuntimeDir()
  if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true })
  }
  mkdirSync(dest, { recursive: true })

  let written = 0
  for (const e of entries) {
    if (e.isDirectory) continue
    const name = normalize(e.entryName)
    if (rootPrefix && !name.startsWith(rootPrefix)) continue
    const rel = name.slice(rootPrefix.length)
    if (!rel || rel.includes('..')) continue
    const out = path.join(dest, rel)
    mkdirSync(path.dirname(out), { recursive: true })
    writeFileSync(out, e.getData())
    written++
  }

  const startWrapperRe = /start\s+"zapret:\s*%~n0"\s+\/min\s+/gi
  for (const f of readdirSync(dest)) {
    if (!f.toLowerCase().endsWith('.bat')) continue
    const full = path.join(dest, f)
    try {
      const before = readFileSync(full, 'utf-8')
      const after = before.replace(startWrapperRe, '')
      if (after !== before) writeFileSync(full, after, 'utf-8')
    } catch { /* best-effort */ }
  }

  let installedVersion: string | undefined
  if (rootPrefix) {
    const m = rootPrefix.match(/zapret-discord-youtube-(.+?)\/?$/i)
    if (m) installedVersion = m[1]
  }

  const list = await listStrategies()
  log(
    'info',
    `Zapret bundle installed: ${written} files, ${list.length} strategies` +
      (installedVersion ? `, version ${installedVersion}` : '')
  )
  return { strategies: list.length, installedVersion }
}

let opLock: Promise<void> = Promise.resolve()
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = opLock.then(fn, fn)
  opLock = next.then(() => undefined, () => undefined)
  return next
}

export function withZapretLock<T>(fn: () => Promise<T>): Promise<T> {
  return withLock(fn)
}

export function startZapret(): Promise<void> {
  return withLock(() => startZapretImpl())
}
export function stopZapret(): Promise<void> {
  return withLock(() => stopZapretImpl())
}

export function killWinws(): Promise<void> {
  return new Promise((resolve) => {
    const p = spawn('taskkill.exe', ['/F', '/IM', 'winws.exe'], { windowsHide: true })
    p.on('exit', () => resolve())
    p.on('error', () => resolve())
  })
}

const WINDIVERT_SERVICE_NAMES = ['WinDivert', 'windivert', 'WinDivert64', 'windivert64', 'WinDivert14'] as const
let detectedWinDivertSvc: string | null = null

interface ScQueryResult {
  exists: boolean
  state: 'running' | 'stopped' | 'start_pending' | 'stop_pending' | 'unknown'
  binaryPath: string | null
}

function scQueryOne(name: string): ScQueryResult {
  const q = spawnSync('sc.exe', ['query', name], { windowsHide: true, timeout: 2000, encoding: 'utf8' })
  if (q.status !== 0 || !q.stdout) return { exists: false, state: 'unknown', binaryPath: null }
  const stateMatch = q.stdout.match(/STATE\s*:\s*\d+\s+(\w+)/i)
  const stateRaw = (stateMatch?.[1] ?? '').toLowerCase()
  const state: ScQueryResult['state'] =
    stateRaw === 'running' ? 'running' :
    stateRaw === 'stopped' ? 'stopped' :
    stateRaw === 'start_pending' ? 'start_pending' :
    stateRaw === 'stop_pending' ? 'stop_pending' : 'unknown'
  const qc = spawnSync('sc.exe', ['qc', name], { windowsHide: true, timeout: 2000, encoding: 'utf8' })
  const pathMatch = qc.stdout?.match(/BINARY_PATH_NAME\s*:\s*(.+)$/im)
  return {
    exists: true,
    state,
    binaryPath: pathMatch?.[1].trim() ?? null
  }
}

function findWinDivertService(): { name: string; info: ScQueryResult } | null {
  const ordered = detectedWinDivertSvc
    ? [detectedWinDivertSvc, ...WINDIVERT_SERVICE_NAMES.filter((n) => n !== detectedWinDivertSvc)]
    : [...WINDIVERT_SERVICE_NAMES]
  for (const name of ordered) {
    const info = scQueryOne(name)
    if (info.exists) {
      detectedWinDivertSvc = name
      return { name, info }
    }
  }
  return null
}

export function ensureWinDivertReady(): void {
  const bundle = zapretBundleDir()
  const sysCandidates = [
    path.join(bundle, 'bin', 'WinDivert64.sys'),
    path.join(bundle, 'bin', 'WinDivert.sys'),
    path.join(bundle, 'WinDivert64.sys'),
    path.join(bundle, 'WinDivert.sys')
  ]
  const expectedSys = sysCandidates.find((p) => existsSync(p))

  const svc = findWinDivertService()
  if (!svc) {
    log('info', 'WinDivert service not registered — winws.exe will register it')
    return
  }

  if (expectedSys && svc.info.binaryPath) {
    const registered = svc.info.binaryPath.replace(/^\\\?\?\\/, '').toLowerCase()
    const expected = expectedSys.toLowerCase()
    if (!existsSync(svc.info.binaryPath.replace(/^\\\?\?\\/, '')) || registered !== expected) {
      log('warn', `WinDivert service points at stale path: ${svc.info.binaryPath}; re-registering`)
      spawnSync('sc.exe', ['stop', svc.name], { windowsHide: true, timeout: 2000 })
      spawnSync('sc.exe', ['delete', svc.name], { windowsHide: true, timeout: 2000 })
      detectedWinDivertSvc = null
      return
    }
  }

  if (svc.info.state !== 'running') {
    log('info', `starting WinDivert service (${svc.name}, was ${svc.info.state})`)
    const r = spawnSync('sc.exe', ['start', svc.name], { windowsHide: true, timeout: 5000, encoding: 'utf8' })
    if (r.status !== 0) {
      const alreadyRunning = /1056/.test(r.stdout ?? '') || /1056/.test(r.stderr ?? '')
      if (!alreadyRunning) {
        log('error', `sc start ${svc.name} failed: ${(r.stdout || r.stderr || '').trim()}`)
      }
    }
  }
}

export function isWinwsRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn('tasklist.exe', ['/FI', 'IMAGENAME eq winws.exe', '/NH'], { windowsHide: true })
    let out = ''
    p.stdout?.on('data', (b) => { out += b.toString() })
    p.on('exit', () => resolve(/winws\.exe/i.test(out)))
    p.on('error', () => resolve(false))
  })
}

let stopRequested = false
let winwsHealth: 'unknown' | 'capturing' | 'failed' = 'unknown'
let winwsLastError: string | null = null

function resetWinwsHealth(): void {
  winwsHealth = 'unknown'
  winwsLastError = null
}

function ingestWinwsLine(raw: string): void {
  if (/windivert\s+initialized|capture\s+is\s+started|windivert.*\bok\b/i.test(raw)) {
    winwsHealth = 'capturing'
    return
  }
  if (
    /windivert.*failed|windivertopen.*failed|driver.*not.*loaded|access\s+is\s+denied|requires.*admin/i.test(raw)
  ) {
    winwsHealth = 'failed'
    winwsLastError = raw.trim()
  }
}

async function startZapretImpl(): Promise<void> {
  if (child) return
  const cfg = await getAppConfig()
  const z = cfg.zapret
  if (!z || !z.activeStrategy) {
    throw new Error('Не выбрана активная стратегия Zapret')
  }
  const dir = zapretBundleDir()

  setStatus({ state: 'starting', startedAt: Date.now(), lastError: undefined })
  stopRequested = false

  try {
    await materializeZapretRuntime()
  } catch (e) {
    log('warn', `Предупреждение материализации конфигурации: ${e}`)
  }

  let runtimeBat: string
  try {
    runtimeBat = await buildRuntimeStrategyBatch(dir, z.activeStrategy, z)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    setStatus({ state: 'error', lastError: msg })
    log('error', msg)
    throw e
  }

  log('info', `Запуск стратегии: ${z.activeStrategy}`)

  if (await isWinwsRunning()) {
    log('info', 'stale winws.exe detected — cleaning up')
    await killWinws()
  }

  ensureWinDivertReady()
  resetWinwsHealth()

  child = spawn('cmd.exe', ['/c', runtimeBat], {
    cwd: dir,
    windowsHide: true,
    detached: false,
    env: {
      ...process.env,
      NO_UPDATE_CHECK: '1'
    }
  })
  child.stdout?.on('data', (buf) => {
    const s = buf.toString()
    log('info', s.trimEnd())
    for (const line of s.split(/\r?\n/)) ingestWinwsLine(line)
  })
  child.stderr?.on('data', (buf) => {
    const s = buf.toString()
    log('warn', s.trimEnd())
    for (const line of s.split(/\r?\n/)) ingestWinwsLine(line)
  })
  child.on('error', (err) => {
    log('error', `child error: ${err.message}`)
    setStatus({ state: 'error', lastError: err.message })
    child = null
  })
  child.on('exit', (code, signal) => {
    log('info', `zapret exited code=${code} signal=${signal ?? 'none'}`)
    child = null
    if (stopRequested) {
      setStatus({ state: 'stopped', pid: undefined, lastError: undefined })
    } else {
      setStatus({
        state: code === 0 || signal === 'SIGTERM' ? 'stopped' : 'error',
        pid: undefined,
        lastError: code && code !== 0 ? `winws.exe exited with code ${code}` : undefined
      })
    }
  })

  const deadline = Date.now() + 7000
  while (Date.now() < deadline) {
    if (!child) return

    if (winwsHealth === 'failed') {
      log('error', `winws.exe reported a fatal error: ${winwsLastError ?? '(no detail)'}`)
      await killWinws()
      setStatus({
        state: 'error',
        pid: undefined,
        lastError:
          winwsLastError ??
          'WinDivert не загрузился. Запустите GhosterNet от администратора и проверьте антивирус.'
      })
      return
    }

    if (winwsHealth === 'capturing' && (await isWinwsRunning())) {
      setStatus({ state: 'running', pid: child.pid })
      log('info', `winws.exe перехватывает пакеты (${Date.now() - (status.startedAt ?? Date.now())} мс)`)
      return
    }

    await new Promise((r) => setTimeout(r, 100))
  }

  if ((await isWinwsRunning()) && child) {
    setStatus({ state: 'running', pid: child.pid })
    log('warn', 'winws.exe запущен, продолжаем работу')
    return
  }

  setStatus({
    state: 'error',
    lastError: 'winws.exe не запустился за 7с — проверьте права администратора и антивирус'
  })
  log('error', 'winws.exe did not appear — check admin rights / antivirus')
}

async function stopZapretImpl(): Promise<void> {
  stopRequested = true
  setStatus({ state: 'stopping', lastError: undefined })

  await killWinws()

  if (child?.pid) {
    await new Promise<void>((resolve) => {
      const p = spawn('taskkill.exe', ['/F', '/T', '/PID', String(child!.pid)], { windowsHide: true })
      p.on('exit', () => resolve())
      p.on('error', () => resolve())
    })
  }
  child = null
  applyQuicFirewallRule(false)
  await new Promise((r) => setTimeout(r, 150))
  setStatus({ state: 'stopped', pid: undefined, lastError: undefined })
  log('info', 'Zapret остановлен')
}

export async function restartZapret(): Promise<void> {
  await stopZapret()
  await new Promise((r) => setTimeout(r, 500))
  await startZapret()
}
