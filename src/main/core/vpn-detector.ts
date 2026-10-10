import { spawn } from 'child_process'
import { appLog } from '../utils/app-logger'

export interface VpnPriorityContext {
  adapterIndexes: number[]
  remoteIps: string[]
  detectedProcesses: string[]
}

const DETECT_VPN_PS = `
$vpnExes = @(
  'nekobox.exe','nekoray.exe','v2rayn.exe','xray.exe','xrayw.exe',
  'sing-box.exe','singbox.exe','clash.exe','clash-verge.exe','verge-mihomo.exe','mihomo.exe',
  'hiddify.exe','hiddifynext.exe','outline.exe','wireguard.exe','openvpn.exe',
  'amneziavpn.exe','amneziawg.exe','warp-svc.exe'
)
$adapterPatterns = @('wintun','wireguard','openvpn','tap-','tap_windows','nekobox','nekoray','sing-box','clash','mihomo','hiddify','amnezia')

$procById = @{}
$procNames = New-Object System.Collections.Generic.HashSet[string]
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | ForEach-Object {
  if ([int]$_.ProcessId -eq $PID) { return }
  $name = ([string]$_.Name).ToLowerInvariant()
  if ($vpnExes -contains $name) {
    $procById[[int]$_.ProcessId] = $true
    [void]$procNames.Add([string]$_.Name)
  }
}

$remoteIps = New-Object System.Collections.Generic.HashSet[string]
if ($procById.Count -gt 0) {
  Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue | ForEach-Object {
    $pidVal = [int]$_.OwningProcess
    if (-not $procById.ContainsKey($pidVal)) { return }
    $ip = ([string]$_.RemoteAddress).Trim()
    if (-not $ip) { return }
    if ($ip -in @('127.0.0.1','0.0.0.0','::','::1') -or $ip.StartsWith('127.')) { return }
    [void]$remoteIps.Add($ip)
  }
}

$adapterIndexes = New-Object System.Collections.Generic.HashSet[int]
Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' } | ForEach-Object {
  $joined = (([string]$_.Name) + ' ' + ([string]$_.InterfaceDescription)).ToLowerInvariant()
  foreach ($pattern in $adapterPatterns) {
    if ($joined.Contains($pattern)) {
      [void]$adapterIndexes.Add([int]$_.ifIndex)
      break
    }
  }
}

[pscustomobject]@{
  adapterIndexes = @($adapterIndexes | Sort-Object)
  remoteIps = @($remoteIps | Sort-Object)
  detectedProcesses = @($procNames | Sort-Object)
} | ConvertTo-Json -Compress
`

function looksLikeIp(val: string): boolean {
  const c = val.trim()
  if (!c) return false
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(c)) return true
  return c.includes(':') && /^[0-9a-fA-F:]+$/.test(c)
}

export async function detectVpnPriorityContext(): Promise<VpnPriorityContext> {
  if (process.platform !== 'win32') {
    return { adapterIndexes: [], remoteIps: [], detectedProcesses: [] }
  }
  return new Promise((resolve) => {
    let stdout = ''
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', DETECT_VPN_PS],
      { windowsHide: true }
    )
    const timer = setTimeout(() => {
      try { child.kill() } catch { /* noop */ }
      resolve({ adapterIndexes: [], remoteIps: [], detectedProcesses: [] })
    }, 6000)

    child.stdout?.on('data', (b) => { stdout += b.toString('utf8') })
    child.on('exit', (code) => {
      clearTimeout(timer)
      if (code !== 0 || !stdout.trim()) {
        resolve({ adapterIndexes: [], remoteIps: [], detectedProcesses: [] })
        return
      }
      try {
        const parsed = JSON.parse(stdout.trim()) as {
          adapterIndexes?: unknown
          remoteIps?: unknown
          detectedProcesses?: unknown
        }
        const rawIdx = Array.isArray(parsed.adapterIndexes)
          ? parsed.adapterIndexes
          : parsed.adapterIndexes != null
            ? [parsed.adapterIndexes]
            : []
        const rawIps = Array.isArray(parsed.remoteIps)
          ? parsed.remoteIps
          : parsed.remoteIps != null
            ? [parsed.remoteIps]
            : []
        const rawProcs = Array.isArray(parsed.detectedProcesses)
          ? parsed.detectedProcesses
          : parsed.detectedProcesses != null
            ? [parsed.detectedProcesses]
            : []

        const adapterIndexes = rawIdx
          .map((x) => Number(x))
          .filter((n) => Number.isFinite(n) && n > 0)
        const remoteIps = rawIps
          .map((x) => String(x).trim())
          .filter(looksLikeIp)
        const detectedProcesses = rawProcs
          .map((x) => String(x).trim())
          .filter(Boolean)

        resolve({ adapterIndexes, remoteIps, detectedProcesses })
      } catch (e) {
        appLog('warn', `Ошибка парсинга ответа VpnDetector: ${e}`)
        resolve({ adapterIndexes: [], remoteIps: [], detectedProcesses: [] })
      }
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve({ adapterIndexes: [], remoteIps: [], detectedProcesses: [] })
    })
  })
}

export function parsePortRanges(value: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  const seen = new Set<string>()
  for (const raw of String(value || '').split(/[\s,;]+/)) {
    const token = raw.trim()
    if (!token) continue
    const [left, right] = token.includes('-') ? token.split('-', 2) : [token, token]
    let start = parseInt(left, 10)
    let end = parseInt(right, 10)
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    if (start > end) [start, end] = [end, start]
    if (start < 1 || end > 65535) continue
    const key = `${start}-${end}`
    if (seen.has(key)) continue
    seen.add(key)
    ranges.push([start, end])
  }
  return ranges
}

export function formatPortRanges(ranges: Array<[number, number]>): string {
  return ranges.map(([s, e]) => (s === e ? `${s}` : `${s}-${e}`)).join(',')
}

export function subtractPortRanges(
  ranges: Array<[number, number]>,
  excluded: Array<[number, number]>
): Array<[number, number]> {
  const result: Array<[number, number]> = []
  for (const [start, end] of ranges) {
    let segments: Array<[number, number]> = [[start, end]]
    for (const [exStart, exEnd] of excluded) {
      const next: Array<[number, number]> = []
      for (const [segStart, segEnd] of segments) {
        if (exEnd < segStart || exStart > segEnd) {
          next.push([segStart, segEnd])
          continue
        }
        if (segStart < exStart) {
          next.push([segStart, exStart - 1])
        }
        if (exEnd < segEnd) {
          next.push([exEnd + 1, segEnd])
        }
      }
      segments = next
    }
    for (const seg of segments) {
      if (seg[0] <= seg[1]) result.push(seg)
    }
  }
  return result
}

export function excludeUdpPortsFromCommand(
  args: string[],
  udpExcludePortsStr: string
): string[] {
  const excluded = parsePortRanges(udpExcludePortsStr)
  if (!excluded.length) return args
  return args.map((arg) => {
    if (arg.startsWith('--wf-udp=') || arg.startsWith('--filter-udp=')) {
      const eq = arg.indexOf('=')
      const key = arg.slice(0, eq)
      const val = arg.slice(eq + 1)
      const ranges = parsePortRanges(val)
      if (ranges.length > 0) {
        const filtered = subtractPortRanges(ranges, excluded)
        const formatted = formatPortRanges(filtered) || '12'
        return `${key}=${formatted}`
      }
    }
    return arg
  })
}
