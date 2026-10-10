import { spawn } from 'child_process'
import { lookup } from 'dns/promises'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { dataDir } from '../utils/dirs'
import { getAppConfig, patchAppConfig } from '../config'
import { appLog } from '../utils/app-logger'

export interface DnsPresetDescriptor {
  id: string
  name: string
  description: string
  ipv4: string[]
  ipv6: string[]
  doh: string
}

export interface DnsAdapterSnapshot {
  interface_index: number
  interface_alias: string
  interface_guid: string
  ipv4: string[]
  ipv6: string[]
  ipv4_manual: boolean
  ipv6_manual: boolean
}

export interface DnsManagerStatus {
  active: boolean
  presetId: string
  primary: string
  secondary: string
  dohUrl: string
  adapters: DnsAdapterSnapshot[]
  lastUpdated?: string
  lastError?: string
}

export const DNS_PRESETS: DnsPresetDescriptor[] = [
  {
    id: 'xbox-dns',
    name: 'Xbox DNS (Обход гео-блокировок)',
    description: 'Специальный DNS для Xbox, ИИ-сервисов (ChatGPT/Claude), Spotify и игр',
    ipv4: ['111.88.96.50', '111.88.96.51'],
    ipv6: ['2a00:ab00:1233:26::50', '2a00:ab00:1233:26::51'],
    doh: 'https://xbox-dns.ru/dns-query'
  },
  {
    id: 'comss',
    name: 'Comss.one DNS',
    description: 'Обход региональных ограничений ИИ, обновлений антивирусов и сервисов',
    ipv4: ['83.220.169.155', '212.109.195.93'],
    ipv6: [],
    doh: 'https://dns.comss.one/dns-query'
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare 1.1.1.1 (DoH)',
    description: 'Быстрый приватный DNS от Cloudflare с поддержкой DNS-over-HTTPS',
    ipv4: ['1.1.1.1', '1.0.0.1'],
    ipv6: ['2606:4700:4700::1111', '2606:4700:4700::1001'],
    doh: 'https://cloudflare-dns.com/dns-query'
  },
  {
    id: 'google',
    name: 'Google Public DNS (8.8.8.8)',
    description: 'Надёжный глобальный DNS-сервер Google с поддержкой DoH',
    ipv4: ['8.8.8.8', '8.8.4.4'],
    ipv6: ['2001:4860:4860::8888', '2001:4860:4860::8844'],
    doh: 'https://dns.google/dns-query'
  },
  {
    id: 'quad9',
    name: 'Quad9 Security DNS (9.9.9.9)',
    description: 'Швейцарский DNS с фильтрацией вредоносных доменов и DoH',
    ipv4: ['9.9.9.9', '149.112.112.112'],
    ipv6: ['2620:fe::fe', '2620:fe::9'],
    doh: 'https://dns.quad9.net/dns-query'
  },
  {
    id: 'yandex',
    name: 'Яндекс DNS (77.88.8.8)',
    description: 'Базовый быстрый DNS-сервер Яндекса с минимальной задержкой в РФ',
    ipv4: ['77.88.8.8', '77.88.8.1'],
    ipv6: ['2a02:6b8::feed:0ff', '2a02:6b8:0:1::feed:0ff'],
    doh: 'https://common.dot.dns.yandex.net/dns-query'
  }
]

function dnsStateFilePath(): string {
  return path.join(dataDir(), 'dns-manager-state.json')
}

interface PersistedDnsState {
  active?: boolean
  presetId?: string
  servers?: { ipv4: string[]; ipv6: string[]; doh: string }
  previous_adapters?: DnsAdapterSnapshot[]
  updated_at?: string
  last_error?: string
}

function readDnsStateFile(): PersistedDnsState {
  const p = dnsStateFilePath()
  if (!existsSync(p)) return {}
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as PersistedDnsState
  } catch {
    return {}
  }
}

function writeDnsStateFile(state: PersistedDnsState): void {
  const p = dnsStateFilePath()
  mkdirSync(path.dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(state, null, 2) + '\n', 'utf8')
}

function runPowerShell(script: string, timeoutMs = 12000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const preamble =
      '$OutputEncoding = [System.Text.Encoding]::UTF8; [Console]::OutputEncoding = [System.Text.Encoding]::UTF8;\n'
    let stdout = ''
    let stderr = ''
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', preamble + script],
      { windowsHide: true }
    )
    const timer = setTimeout(() => {
      try { child.kill() } catch { /* noop */ }
      resolve({ code: 1, stdout, stderr: stderr || 'PowerShell timeout' })
    }, timeoutMs)

    child.stdout?.on('data', (b) => { stdout += b.toString('utf8') })
    child.stderr?.on('data', (b) => { stderr += b.toString('utf8') })
    child.on('exit', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() })
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ code: 1, stdout, stderr: err.message })
    })
  })
}

const SNAPSHOT_PS_SCRIPT = `
$rows = @()
function Test-IgnoredAdapter($adapter) {
  $name = (([string]$adapter.Name) + ' ' + ([string]$adapter.InterfaceDescription)).ToLowerInvariant()
  foreach ($pat in @('loopback','wintun','wireguard','openvpn','tap','vpn','v2ray','xray','sing-box','clash','tun')) {
    if ($name.Contains($pat)) { return $true }
  }
  return $false
}
function Get-RegistryDns($guid, $family) {
  if (-not $guid) { return "" }
  $root = if ($family -eq "ipv6") { "Tcpip6" } else { "Tcpip" }
  $path = "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\$root\\Parameters\\Interfaces\\$guid"
  try {
    $value = (Get-ItemProperty -LiteralPath $path -Name NameServer -ErrorAction Stop).NameServer
    return [string]$value
  } catch { return "" }
}
function Split-DnsList($value) {
  @([string]$value -split "[,\\s]+" | Where-Object { [string]$_ -ne "" })
}
$adapters = @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' -and $_.HardwareInterface -and -not (Test-IgnoredAdapter $_) })
if ($adapters.Count -eq 0) {
  $adapters = @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' -and -not (Test-IgnoredAdapter $_) })
}
$adapters | ForEach-Object {
  $ifIndex = [int]$_.ifIndex
  $alias = [string]$_.Name
  $guid = [string]$_.InterfaceGuid
  $v4 = Get-DnsClientServerAddress -InterfaceIndex $ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue
  $v6 = Get-DnsClientServerAddress -InterfaceIndex $ifIndex -AddressFamily IPv6 -ErrorAction SilentlyContinue
  $v4Manual = Get-RegistryDns $guid "ipv4"
  $v6Manual = Get-RegistryDns $guid "ipv6"
  $rows += [pscustomobject]@{
    interface_index = $ifIndex
    interface_alias = $alias
    interface_guid = $guid
    ipv4 = if ($v4Manual) { @(Split-DnsList $v4Manual) } else { @($v4.ServerAddresses) }
    ipv6 = if ($v6Manual) { @(Split-DnsList $v6Manual) } else { @() }
    ipv4_manual = [bool]$v4Manual
    ipv6_manual = [bool]$v6Manual
  }
}
@($rows) | ConvertTo-Json -Compress -Depth 4
`

export async function snapshotWindowsDns(): Promise<DnsAdapterSnapshot[]> {
  if (process.platform !== 'win32') return []
  const res = await runPowerShell(SNAPSHOT_PS_SCRIPT)
  if (res.code !== 0 || !res.stdout) return []
  try {
    const parsed = JSON.parse(res.stdout)
    const arr = Array.isArray(parsed) ? parsed : [parsed]
    return arr
      .filter((x) => x && typeof x === 'object' && x.interface_alias)
      .map((x) => ({
        interface_index: Number(x.interface_index) || 0,
        interface_alias: String(x.interface_alias),
        interface_guid: String(x.interface_guid || ''),
        ipv4: Array.isArray(x.ipv4) ? x.ipv4.map(String).filter(Boolean) : x.ipv4 ? [String(x.ipv4)] : [],
        ipv6: Array.isArray(x.ipv6) ? x.ipv6.map(String).filter(Boolean) : x.ipv6 ? [String(x.ipv6)] : [],
        ipv4_manual: Boolean(x.ipv4_manual),
        ipv6_manual: Boolean(x.ipv6_manual)
      }))
  } catch {
    return []
  }
}

export function listDnsPresets(): DnsPresetDescriptor[] {
  return DNS_PRESETS
}

export async function getDnsStatus(): Promise<DnsManagerStatus> {
  const cfg = await getAppConfig()
  const state = readDnsStateFile()
  const liveAdapters = state.previous_adapters?.length
    ? state.previous_adapters
    : await snapshotWindowsDns()

  return {
    active: Boolean(state.active ?? cfg.dns?.active),
    presetId: cfg.dns?.presetId ?? state.presetId ?? 'xbox-dns',
    primary: cfg.dns?.primary ?? state.servers?.ipv4?.[0] ?? '',
    secondary: cfg.dns?.secondary ?? state.servers?.ipv4?.[1] ?? '',
    dohUrl: cfg.dns?.dohUrl ?? state.servers?.doh ?? '',
    adapters: liveAdapters,
    lastUpdated: state.updated_at,
    lastError: state.last_error
  }
}

async function resolveDohHostIps(dohUrl: string): Promise<string[]> {
  try {
    const u = new URL(dohUrl)
    const records = await lookup(u.hostname, { all: true, family: 4 })
    return records.map((r) => r.address).slice(0, 2)
  } catch {
    return []
  }
}

export async function applyDnsConfig(opts: {
  presetId: string
  primary?: string
  secondary?: string
  dohUrl?: string
}): Promise<DnsManagerStatus> {
  if (process.platform !== 'win32') {
    throw new Error('Управление системным DNS доступно только на Windows')
  }

  let ipv4: string[] = []
  let ipv6: string[] = []
  let doh = (opts.dohUrl ?? '').trim()

  if (opts.presetId === 'custom') {
    if (opts.primary?.trim()) ipv4.push(opts.primary.trim())
    if (opts.secondary?.trim()) ipv4.push(opts.secondary.trim())
    if (ipv4.length === 0 && doh) {
      ipv4 = await resolveDohHostIps(doh)
    }
    if (ipv4.length === 0) {
      throw new Error('Укажите хотя бы один IPv4 DNS-сервер или корректный адрес DoH')
    }
  } else {
    const preset = DNS_PRESETS.find((p) => p.id === opts.presetId) ?? DNS_PRESETS[0]
    ipv4 = [...preset.ipv4]
    ipv6 = [...preset.ipv6]
    doh = preset.doh
  }

  const state = readDnsStateFile()
  let adapters = state.previous_adapters
  if (!adapters || adapters.length === 0) {
    adapters = await snapshotWindowsDns()
  }
  if (!adapters || adapters.length === 0) {
    throw new Error('Не найдены активные сетевые адаптеры для применения DNS')
  }

  const payloadJson = JSON.stringify({ adapters, ipv4, ipv6, doh }).replace(/'/g, "''")
  const applyScript = `
$payload = '${payloadJson}' | ConvertFrom-Json
function Set-HubDoh($ifIndex, $doh, $dohIps) {
  if (-not $doh) { return }
  try {
    if (-not (Get-Command Set-DnsClientDohServerAddress -ErrorAction SilentlyContinue)) { return }
    Get-DnsClientDohServerAddress -InterfaceIndex $ifIndex -ErrorAction SilentlyContinue | ForEach-Object {
      try { Remove-DnsClientDohServerAddress -InterfaceIndex $ifIndex -ServerAddress $_.ServerAddress -DohTemplate $_.DohTemplate -ErrorAction Stop | Out-Null } catch {}
    }
    foreach ($ip in @($dohIps)) {
      if ([string]$ip -eq '') { continue }
      try {
        Set-DnsClientDohServerAddress -InterfaceIndex $ifIndex -ServerAddress ([string]$ip) -DohTemplate ([string]$doh) -AllowFallbackToUdp -ErrorAction Stop | Out-Null
      } catch {}
    }
  } catch {}
}
foreach ($adapter in @($payload.adapters)) {
  $ifIndex = [int]$adapter.interface_index
  if ($ifIndex -le 0) { continue }
  $serverList = @(@($payload.ipv4) + @($payload.ipv6) | Where-Object { [string]$_ -ne '' })
  if ($serverList.Count -gt 0) {
    Set-DnsClientServerAddress -InterfaceIndex $ifIndex -ServerAddresses $serverList -ErrorAction Stop | Out-Null
  }
  Set-HubDoh $ifIndex ([string]$payload.doh) $serverList
}
ipconfig /flushdns | Out-Null
`

  const res = await runPowerShell(applyScript)
  if (res.code !== 0) {
    const err = res.stderr || res.stdout || 'Не удалось применить настройки DNS'
    appLog('error', `DNS Manager ошибка: ${err}`)
    throw new Error(err)
  }

  const nextState: PersistedDnsState = {
    active: true,
    presetId: opts.presetId,
    servers: { ipv4, ipv6, doh },
    previous_adapters: adapters,
    updated_at: new Date().toISOString(),
    last_error: ''
  }
  writeDnsStateFile(nextState)

  await patchAppConfig({
    dns: {
      presetId: opts.presetId as DnsPreset,
      primary: ipv4[0] || '',
      secondary: ipv4[1] || '',
      dohUrl: doh,
      active: true
    }
  })

  appLog('info', `DNS Manager: применён профиль "${opts.presetId}" (${ipv4.join(', ')})`)
  return getDnsStatus()
}

export async function resetDnsToDhcp(): Promise<DnsManagerStatus> {
  if (process.platform !== 'win32') return getDnsStatus()

  const resetScript = `
function Test-IgnoredAdapter($adapter) {
  $name = (([string]$adapter.Name) + ' ' + ([string]$adapter.InterfaceDescription)).ToLowerInvariant()
  foreach ($pat in @('loopback','wintun','wireguard','openvpn','tap','vpn','v2ray','xray','sing-box','clash','tun')) {
    if ($name.Contains($pat)) { return $true }
  }
  return $false
}
$adapters = @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' -and -not (Test-IgnoredAdapter $_) })
foreach ($adapter in $adapters) {
  $ifIndex = [int]$adapter.ifIndex
  $guid = [string]$adapter.InterfaceGuid
  try {
    if (Get-Command Get-DnsClientDohServerAddress -ErrorAction SilentlyContinue) {
      Get-DnsClientDohServerAddress -InterfaceIndex $ifIndex -ErrorAction SilentlyContinue | ForEach-Object {
        try { Remove-DnsClientDohServerAddress -InterfaceIndex $ifIndex -ServerAddress $_.ServerAddress -DohTemplate $_.DohTemplate -ErrorAction Stop | Out-Null } catch {}
      }
    }
    Set-DnsClientServerAddress -InterfaceIndex $ifIndex -ResetServerAddresses -ErrorAction Stop | Out-Null
  } catch {}
}
ipconfig /flushdns | Out-Null
`
  await runPowerShell(resetScript)

  writeDnsStateFile({
    active: false,
    updated_at: new Date().toISOString(),
    last_error: ''
  })

  const cfg = await getAppConfig()
  await patchAppConfig({
    dns: {
      ...(cfg.dns as DnsConfig),
      active: false
    }
  })

  appLog('info', 'DNS Manager: настройки DNS сброшены к стандартным (DHCP)')
  return getDnsStatus()
}
