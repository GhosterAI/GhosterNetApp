import { randomBytes } from 'crypto'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

/**
 * Country flag emoji / ISO code detection from server label
 */
const COUNTRY_PATTERNS: Array<{ code: string; regex: RegExp }> = [
  { code: 'NL', regex: /(?:🇳🇱|\bNL\b|netherlands|нидерланд|амстердам|amsterdam)/i },
  { code: 'DE', regex: /(?:🇩🇪|\bDE\b|germany|германи|франкфурт|frankfurt|берлин|berlin)/i },
  { code: 'US', regex: /(?:🇺🇸|\bUS\b|\bUSA\b|united states|сша|америк|нью-йорк|new york|лонг|вашингтон)/i },
  { code: 'FI', regex: /(?:🇫🇮|\bFI\b|finland|финлянди|хельсинки|helsinki)/i },
  { code: 'SE', regex: /(?:🇸🇪|\bSE\b|sweden|швеци|стокгольм|stockholm)/i },
  { code: 'GB', regex: /(?:🇬🇧|\bGB\b|\bUK\b|united kingdom|london|лондон|великобритан|англи)/i },
  { code: 'FR', regex: /(?:🇫🇷|\bFR\b|france|франци|париж|paris)/i },
  { code: 'PL', regex: /(?:🇵🇱|\bPL\b|poland|польш|варшав|warsaw)/i },
  { code: 'KZ', regex: /(?:🇰🇿|\bKZ\b|kazakhstan|казахстан|алмат|астан)/i },
  { code: 'TR', regex: /(?:🇹🇷|\bTR\b|turkey|турци|стамбул|istanbul)/i },
  { code: 'RU', regex: /(?:🇷🇺|\bRU\b|russia|росси|москв|moscow|питер|spb)/i },
  { code: 'SG', regex: /(?:🇸🇬|\bSG\b|singapore|сингапур)/i },
  { code: 'JP', regex: /(?:🇯🇵|\bJP\b|japan|япони|токио|tokyo)/i },
  { code: 'CH', regex: /(?:🇨🇭|\bCH\b|switzerland|швейцари|цюрих)/i },
  { code: 'AT', regex: /(?:🇦🇹|\bAT\b|austria|австри|вена)/i },
  { code: 'CZ', regex: /(?:🇨🇿|\bCZ\b|czech|чехи|прага)/i },
  { code: 'ES', regex: /(?:🇪🇸|\bES\b|spain|испани|мадрид|барселон)/i },
  { code: 'IT', regex: /(?:🇮🇹|\bIT\b|italy|итали|рим|милан)/i },
  { code: 'CA', regex: /(?:🇨🇦|\bCA\b|canada|канада|торонто)/i },
  { code: 'UA', regex: /(?:🇺🇦|\bUA\b|ukraine|украин|киев)/i }
]

export function detectCountryCode(text: string): string {
  for (const { code, regex } of COUNTRY_PATTERNS) {
    if (regex.test(text)) return code
  }
  return ''
}

function safeBase64Decode(str: string): string {
  try {
    let clean = str.trim().replace(/-/g, '+').replace(/_/g, '/')
    while (clean.length % 4 !== 0) {
      clean += '='
    }
    return Buffer.from(clean, 'base64').toString('utf-8')
  } catch {
    return ''
  }
}

/**
 * Parse a single VLESS URI
 * e.g. vless://uuid@host:port?security=reality&pbk=...&fp=chrome&sni=...&sid=...&type=tcp#Name
 */
export function parseVlessUri(raw: string): VpnServer | null {
  try {
    const url = new URL(raw)
    const uuid = url.username
    const server = url.hostname
    const serverPort = parseInt(url.port || '443', 10)
    const params = url.searchParams
    const name = decodeURIComponent(url.hash.replace(/^#/, '') || `${server}:${serverPort}`)

    const details: Record<string, unknown> = {
      uuid,
      flow: params.get('flow') || '',
      security: params.get('security') || 'none',
      network: params.get('type') || 'tcp',
      sni: params.get('sni') || '',
      fp: params.get('fp') || 'chrome',
      pbk: params.get('pbk') || '',
      sid: params.get('sid') || '',
      spx: params.get('spx') || '',
      path: params.get('path') || '',
      host: params.get('host') || '',
      serviceName: params.get('serviceName') || ''
    }

    return {
      id: randomBytes(8).toString('hex'),
      name,
      type: 'vless',
      server,
      serverPort,
      countryCode: detectCountryCode(name),
      rawUri: raw,
      details
    }
  } catch {
    return null
  }
}

/**
 * Parse a VMess URI (vmess://base64-json)
 */
export function parseVmessUri(raw: string): VpnServer | null {
  try {
    const b64 = raw.replace(/^vmess:\/\//i, '')
    const jsonStr = safeBase64Decode(b64)
    if (!jsonStr) return null
    const json = JSON.parse(jsonStr) as {
      v?: string
      ps?: string
      add?: string
      port?: string | number
      id?: string
      aid?: string | number
      net?: string
      type?: string
      host?: string
      path?: string
      tls?: string
      sni?: string
    }

    const server = json.add || ''
    const serverPort = Number(json.port) || 443
    const name = json.ps || `${server}:${serverPort}`

    const details: Record<string, unknown> = {
      uuid: json.id || '',
      alterId: Number(json.aid) || 0,
      network: json.net || 'tcp',
      security: json.tls ? 'tls' : 'none',
      sni: json.sni || json.host || '',
      host: json.host || '',
      path: json.path || ''
    }

    return {
      id: randomBytes(8).toString('hex'),
      name,
      type: 'vmess',
      server,
      serverPort,
      countryCode: detectCountryCode(name),
      rawUri: raw,
      details
    }
  } catch {
    return null
  }
}

/**
 * Parse Trojan URI (trojan://password@host:port?sni=...#Name)
 */
export function parseTrojanUri(raw: string): VpnServer | null {
  try {
    const url = new URL(raw)
    const password = url.username
    const server = url.hostname
    const serverPort = parseInt(url.port || '443', 10)
    const params = url.searchParams
    const name = decodeURIComponent(url.hash.replace(/^#/, '') || `${server}:${serverPort}`)

    const details: Record<string, unknown> = {
      password,
      sni: params.get('sni') || server,
      network: params.get('type') || 'tcp',
      security: params.get('security') || 'tls',
      path: params.get('path') || '',
      host: params.get('host') || ''
    }

    return {
      id: randomBytes(8).toString('hex'),
      name,
      type: 'trojan',
      server,
      serverPort,
      countryCode: detectCountryCode(name),
      rawUri: raw,
      details
    }
  } catch {
    return null
  }
}

/**
 * Parse Shadowsocks URI (ss://base64@host:port#Name or ss://base64#Name)
 */
export function parseShadowsocksUri(raw: string): VpnServer | null {
  try {
    const urlStr = raw.replace(/^ss:\/\//i, '')
    const [mainPart, hashPart] = urlStr.split('#')
    const name = hashPart ? decodeURIComponent(hashPart) : 'Shadowsocks'

    let method = 'aes-256-gcm'
    let password = ''
    let server = ''
    let serverPort = 8388

    if (mainPart.includes('@')) {
      const [userInfo, hostPort] = mainPart.split('@')
      const [host, portStr] = hostPort.split(':')
      server = host
      serverPort = parseInt(portStr || '8388', 10)

      const decodedUser = safeBase64Decode(userInfo) || userInfo
      const [m, p] = decodedUser.split(':')
      method = m
      password = p
    } else {
      const decoded = safeBase64Decode(mainPart)
      if (decoded && decoded.includes('@')) {
        const [userInfo, hostPort] = decoded.split('@')
        const [host, portStr] = hostPort.split(':')
        server = host
        serverPort = parseInt(portStr || '8388', 10)
        const [m, p] = userInfo.split(':')
        method = m
        password = p
      }
    }

    if (!server || !password) return null

    return {
      id: randomBytes(8).toString('hex'),
      name,
      type: 'shadowsocks',
      server,
      serverPort,
      countryCode: detectCountryCode(name),
      rawUri: raw,
      details: {
        method,
        password
      }
    }
  } catch {
    return null
  }
}

/**
 * Parse Hysteria 2 URI (hysteria2://pass@host:port?sni=...#Name or hy2://...)
 */
export function parseHysteria2Uri(raw: string): VpnServer | null {
  try {
    const cleanUri = raw.replace(/^hy2:\/\//i, 'hysteria2://')
    const url = new URL(cleanUri)
    const password = url.username
    const server = url.hostname
    const serverPort = parseInt(url.port || '443', 10)
    const params = url.searchParams
    const name = decodeURIComponent(url.hash.replace(/^#/, '') || `${server}:${serverPort}`)

    const details: Record<string, unknown> = {
      password,
      sni: params.get('sni') || server,
      insecure: params.get('insecure') === '1' || params.get('insecure') === 'true',
      obfs: params.get('obfs') || '',
      obfsPassword: params.get('obfs-password') || ''
    }

    return {
      id: randomBytes(8).toString('hex'),
      name,
      type: 'hysteria2',
      server,
      serverPort,
      countryCode: detectCountryCode(name),
      rawUri: raw,
      details
    }
  } catch {
    return null
  }
}

/**
 * Parse TUIC URI (tuic://uuid:password@host:port?...#Name)
 */
export function parseTuicUri(raw: string): VpnServer | null {
  try {
    const url = new URL(raw)
    const uuid = url.username
    const password = url.password
    const server = url.hostname
    const serverPort = parseInt(url.port || '443', 10)
    const params = url.searchParams
    const name = decodeURIComponent(url.hash.replace(/^#/, '') || `${server}:${serverPort}`)

    const details: Record<string, unknown> = {
      uuid,
      password,
      sni: params.get('sni') || server,
      congestionControl: params.get('congestion_control') || 'bbr',
      alpn: params.get('alpn') || 'h3'
    }

    return {
      id: randomBytes(8).toString('hex'),
      name,
      type: 'tuic',
      server,
      serverPort,
      countryCode: detectCountryCode(name),
      rawUri: raw,
      details
    }
  } catch {
    return null
  }
}

/**
 * Generic single URI parser
 */
export function parseSingleVpnUri(line: string): VpnServer | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('vless://')) return parseVlessUri(trimmed)
  if (trimmed.startsWith('vmess://')) return parseVmessUri(trimmed)
  if (trimmed.startsWith('trojan://')) return parseTrojanUri(trimmed)
  if (trimmed.startsWith('ss://')) return parseShadowsocksUri(trimmed)
  if (trimmed.startsWith('hysteria2://') || trimmed.startsWith('hy2://')) return parseHysteria2Uri(trimmed)
  if (trimmed.startsWith('tuic://')) return parseTuicUri(trimmed)
  return null
}

export interface ParseResult {
  subscription?: VpnSubscription
  servers: VpnServer[]
}

/**
 * Parse an AmneziaWG / WireGuard INI config format (e.g. from .conf file)
 */
export function parseAmneziaWgConf(text: string, title?: string): VpnServer | null {
  try {
    const lines = text.split(/\r?\n/)
    const details: Record<string, unknown> = {}
    let currentSection = ''
    let server = ''
    let serverPort = 51820
    let isAwg = false

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#') || line.startsWith(';')) continue

      if (line.startsWith('[') && line.endsWith(']')) {
        currentSection = line.slice(1, -1).trim().toLowerCase()
        continue
      }

      const eqIdx = line.indexOf('=')
      if (eqIdx === -1) continue

      const key = line.slice(0, eqIdx).trim().toLowerCase()
      const val = line.slice(eqIdx + 1).trim()

      if (currentSection === 'interface') {
        if (key === 'address') details.address = val
        else if (key === 'privatekey') details.privateKey = val
        else if (key === 'dns') details.dns = val
        else if (key === 'jc') { details.jc = Number(val); isAwg = true }
        else if (key === 'jmin') { details.jmin = Number(val); isAwg = true }
        else if (key === 'jmax') { details.jmax = Number(val); isAwg = true }
        else if (key === 's1') { details.s1 = Number(val); isAwg = true }
        else if (key === 's2') { details.s2 = Number(val); isAwg = true }
        else if (key === 'h1') { details.h1 = Number(val); isAwg = true }
        else if (key === 'h2') { details.h2 = Number(val); isAwg = true }
        else if (key === 'h3') { details.h3 = Number(val); isAwg = true }
        else if (key === 'h4') { details.h4 = Number(val); isAwg = true }
      } else if (currentSection === 'peer') {
        if (key === 'publickey') details.publicKey = val
        else if (key === 'presharedkey') details.presharedKey = val
        else if (key === 'allowedips') details.allowedIps = val
        else if (key === 'endpoint') {
          const lastColon = val.lastIndexOf(':')
          if (lastColon !== -1) {
            server = val.slice(0, lastColon).trim().replace(/^\[|\]$/g, '')
            serverPort = parseInt(val.slice(lastColon + 1).trim(), 10) || 51820
          } else {
            server = val
          }
        }
      }
    }

    if (!server || !details.privateKey || !details.publicKey) {
      return null
    }

    const name =
      title ||
      (isAwg ? `AmneziaWG (${server}:${serverPort})` : `WireGuard (${server}:${serverPort})`)

    return {
      id: randomBytes(8).toString('hex'),
      name,
      type: isAwg ? 'awg' : 'wireguard',
      server,
      serverPort,
      countryCode: detectCountryCode(name),
      rawUri: text,
      details
    }
  } catch {
    return null
  }
}

/**
 * Parse Xray/v2ray JSON array subscription formats
 * e.g. [{"remarks":"...", "outbounds": [{...}]}]
 */
export function parseXrayJsonSubscription(text: string): VpnServer[] {
  const servers: VpnServer[] = []
  try {
    const list = JSON.parse(text)
    if (!Array.isArray(list)) return servers

    for (const item of list) {
      const name = item.remarks || item.ps || ''
      const outbounds = Array.isArray(item.outbounds) ? item.outbounds : [item]
      for (const ob of outbounds) {
        if (!ob || !ob.protocol) continue
        const proto = String(ob.protocol).toLowerCase()

        if (proto === 'vless') {
          const vnext = ob.settings?.vnext?.[0]
          if (!vnext) continue
          const server = vnext.address
          const serverPort = vnext.port
          const uuid = vnext.users?.[0]?.id || ''
          const flow = vnext.users?.[0]?.flow || ''
          const stream = ob.streamSettings || {}
          const security = stream.security || 'none'
          const reality = stream.realitySettings || {}

          servers.push({
            id: randomBytes(8).toString('hex'),
            name: name || `${server}:${serverPort}`,
            type: 'vless',
            server,
            serverPort,
            countryCode: detectCountryCode(name),
            rawUri: '',
            details: {
              uuid,
              flow,
              security,
              sni: reality.serverName || stream.tlsSettings?.serverName || server,
              pbk: reality.publicKey || '',
              sid: reality.shortId || '',
              fp: reality.fingerprint || 'chrome',
              network: stream.network || 'tcp'
            }
          })
        } else if (proto === 'vmess') {
          const vnext = ob.settings?.vnext?.[0]
          if (!vnext) continue
          const server = vnext.address
          const serverPort = vnext.port
          const uuid = vnext.users?.[0]?.id || ''
          const stream = ob.streamSettings || {}

          servers.push({
            id: randomBytes(8).toString('hex'),
            name: name || `${server}:${serverPort}`,
            type: 'vmess',
            server,
            serverPort,
            countryCode: detectCountryCode(name),
            rawUri: '',
            details: {
              uuid,
              security: stream.security || 'none',
              sni: stream.tlsSettings?.serverName || server,
              network: stream.network || 'tcp'
            }
          })
        }
      }
    }
  } catch {
    // ignore
  }
  return servers
}

/**
 * Fetch subscription feed handling cookies, 307 redirects, and bot protection
 */
async function fetchSubscriptionFeed(url: string): Promise<{ body: string; headers: Record<string, string> }> {
  const tmpCookie = path.join(os.tmpdir(), `gh_cookie_${Date.now()}_${Math.random().toString(36).slice(2)}.txt`)
  try {
    const raw = execFileSync('curl.exe', [
      '-i', '-s', '-L',
      '-c', tmpCookie,
      '-b', tmpCookie,
      '-A', 'Happ/1.0 v2rayN/6.42 Clash/1.0',
      '--max-time', '20',
      url
    ], { encoding: 'utf-8', maxBuffer: 15 * 1024 * 1024 })

    const blocks = raw.split(/\r?\n\r?\n/)
    let lastHeaders = ''
    let body = ''
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i].startsWith('HTTP/')) {
        lastHeaders = blocks[i]
        body = blocks.slice(i + 1).join('\r\n\r\n')
      }
    }

    const headerMap: Record<string, string> = {}
    for (const hLine of lastHeaders.split(/\r?\n/)) {
      const colon = hLine.indexOf(':')
      if (colon > 0) {
        headerMap[hLine.slice(0, colon).trim().toLowerCase()] = hLine.slice(colon + 1).trim()
      }
    }

    return { body: body.trim(), headers: headerMap }
  } catch {
    // Fallback to native fetch if curl.exe is not available
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Happ/1.0 v2rayN/6.42 Clash/1.0' }
    })
    const body = await res.text()
    const headerMap: Record<string, string> = {}
    res.headers.forEach((v, k) => { headerMap[k.toLowerCase()] = v })
    return { body: body.trim(), headers: headerMap }
  } finally {
    try { fs.unlinkSync(tmpCookie); } catch { /* ignore */ }
  }
}

/**
 * Fetch and parse a subscription URL or parse raw batch / single key / .conf string
 */
export async function parseVpnInput(input: string): Promise<ParseResult> {
  const trimmed = input.trim()
  if (!trimmed) return { servers: [] }

  // 1. Check if it's an AmneziaWG / WireGuard .conf file
  if (trimmed.includes('[Interface]') && trimmed.includes('[Peer]')) {
    const awgServer = parseAmneziaWgConf(trimmed)
    if (awgServer) {
      return { servers: [awgServer] }
    }
  }

  // 2. Check if it's an HTTP/HTTPS Subscription URL
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const { body, headers } = await fetchSubscriptionFeed(trimmed)
    const subId = randomBytes(6).toString('hex')

    // Parse subscription userinfo header: upload=123; download=456; total=789; expire=12345
    const userInfoHeader = headers['subscription-userinfo'] || ''
    let uploadBytes: number | undefined
    let downloadBytes: number | undefined
    let totalBytes: number | undefined
    let expireTimestamp: number | undefined

    if (userInfoHeader) {
      const parts = userInfoHeader.split(';').map((p) => p.trim())
      for (const p of parts) {
        const [k, v] = p.split('=')
        if (k === 'upload') uploadBytes = Number(v)
        if (k === 'download') downloadBytes = Number(v)
        if (k === 'total') totalBytes = Number(v)
        if (k === 'expire') expireTimestamp = Number(v)
      }
    }

    let servers: VpnServer[] = []

    // 2a. Check if body is Xray JSON array
    if (body.startsWith('[') && body.endsWith(']')) {
      servers = parseXrayJsonSubscription(body)
    }

    // 2b. If not JSON or empty, try base64 decode or line-by-line URIs
    if (servers.length === 0) {
      let bodyText = body
      const decoded = safeBase64Decode(bodyText)
      if (decoded && (decoded.includes('://') || decoded.includes('\n'))) {
        bodyText = decoded
      }

      if (bodyText.includes('[Interface]') && bodyText.includes('[Peer]')) {
        const awg = parseAmneziaWgConf(bodyText)
        if (awg) servers.push(awg)
      } else {
        const lines = bodyText.split(/\r?\n/)
        for (const l of lines) {
          const s = parseSingleVpnUri(l)
          if (s) servers.push(s)
        }
      }
    }

    for (const s of servers) {
      s.subscriptionId = subId
    }

    // Determine subscription name from headers or URL
    const parsedUrl = new URL(trimmed)
    const subName =
      headers['profile-title'] ||
      parsedUrl.searchParams.get('name') ||
      parsedUrl.hostname

    const subscription: VpnSubscription = {
      id: subId,
      name: subName,
      url: trimmed,
      updatedAt: Date.now(),
      uploadBytes,
      downloadBytes,
      totalBytes,
      expireTimestamp,
      serverCount: servers.length
    }

    return { subscription, servers }
  }

  // 3. Raw Xray JSON array pasted directly
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const servers = parseXrayJsonSubscription(trimmed)
    if (servers.length > 0) return { servers }
  }

  // 4. Raw single URI or multi-line batch pasted directly
  let rawText = trimmed
  const decoded = safeBase64Decode(rawText)
  if (decoded && (decoded.includes('://') || decoded.includes('\n') || decoded.includes('[Interface]'))) {
    rawText = decoded
  }

  if (rawText.includes('[Interface]') && rawText.includes('[Peer]')) {
    const awg = parseAmneziaWgConf(rawText)
    if (awg) return { servers: [awg] }
  }

  const lines = rawText.split(/\r?\n/)
  const servers: VpnServer[] = []
  for (const l of lines) {
    const s = parseSingleVpnUri(l)
    if (s) servers.push(s)
  }

  return { servers }
}
