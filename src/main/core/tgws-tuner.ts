import { randomBytes } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { createConnection } from 'net'
import tls from 'tls'
import { tgwsCfDomainsPath } from '../utils/dirs'
import { getAppConfig, patchAppConfig } from '../config'
import { getTgwsStatus, restartTgws } from './tgws'
import { appLog } from '../utils/app-logger'

const CFPROXY_DOMAINS_URL =
  'https://raw.githubusercontent.com/Flowseal/tg-ws-proxy/main/.github/cfproxy-domains.txt'

const FALLBACK_ENCODED_DOMAINS = [
  'virkgj.com',
  'vmmzovy.com',
  'mkuosckvso.com',
  'zaewayzmplad.com',
  'twdmbzcm.com',
  'awzwsldi.com',
  'clngqrflngqin.com',
  'tjacxbqtj.com',
  'bxaxtxmrw.com',
  'dmohrsgmohcrwb.com',
  'vwbmtmoi.com',
  'khgrre.com',
  'ulihssf.com',
  'tmhqsdqmfpmk.com',
  'xwuwoqbm.com',
  'orgcnunpj.com',
  'zhkuldz.com',
  'zypoljnslxa.com',
  'efabnxaowuzs.com',
  'zaftuzsftqdq.com'
]

export interface BridgeProbeResult {
  domain: string
  latencyMs: number | null
}

export interface DirectProbeResult {
  dc: number
  ip: string
  latencyMs: number | null
}

export interface TgwsTuneReport {
  mode: 'bridge' | 'direct' | 'auto'
  summary: string
  bestBridgeDomain?: string
  bestBridgeLatencyMs?: number
  directLatencyMs?: number
  bridges: BridgeProbeResult[]
  directs: DirectProbeResult[]
  appliedConfig: {
    cfproxy: boolean
    cfproxyUserDomain: string
    mediaMode: 'default' | 'media_fix' | 'empty'
    dcIp: string[]
  }
}

/**
 * Decode Caesar-ciphered bridge domain from `cfproxy-domains.txt`.
 * In tg-ws-proxy v1.11.1 (`proxy/config.py:_dd`), `.com` is replaced with `.co.uk`.
 */
export function decodeBridgeDomain(raw: string, suffix = '.co.uk'): string {
  const s = raw.trim().toLowerCase()
  if (!s.endsWith('.com')) return s
  const prefix = s.slice(0, -4)
  let letterCount = 0
  for (const ch of prefix) {
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')) letterCount++
  }
  let decoded = ''
  for (const ch of prefix) {
    const code = ch.charCodeAt(0)
    if (code >= 97 && code <= 122) {
      decoded += String.fromCharCode((((code - 97 - letterCount) % 26) + 26) % 26 + 97)
    } else if (code >= 65 && code <= 90) {
      decoded += String.fromCharCode((((code - 65 - letterCount) % 26) + 26) % 26 + 65)
    } else {
      decoded += ch
    }
  }
  return decoded + suffix
}

async function collectCandidateBridgeDomains(userConfigured = ''): Promise<string[]> {
  const domains = new Set<string>()

  // 1. User configured domains
  for (const raw of userConfigured.split(/[\s,;]+/)) {
    const d = raw.trim().toLowerCase()
    if (d) domains.add(d)
  }

  // 2. Try fresh fetch from GitHub
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 4500)
    const res = await fetch(`${CFPROXY_DOMAINS_URL}?t=${Date.now()}`, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'tg-ws-proxy' }
    })
    clearTimeout(timer)
    if (res.ok) {
      const text = await res.text()
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        domains.add(decodeBridgeDomain(trimmed, '.co.uk'))
      }
    }
  } catch {
    /* fallback to local file */
  }

  // 3. Bundled cfproxy-domains.txt
  const localFile = tgwsCfDomainsPath()
  if (existsSync(localFile)) {
    try {
      const text = readFileSync(localFile, 'utf8')
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        domains.add(decodeBridgeDomain(trimmed, '.co.uk'))
      }
    } catch {
      /* noop */
    }
  }

  // 4. Hardcoded fallback list
  for (const enc of FALLBACK_ENCODED_DOMAINS) {
    domains.add(decodeBridgeDomain(enc, '.co.uk'))
  }

  return Array.from(domains)
}

function probeWsUpgradeOnce(host: string, timeoutMs = 3500): Promise<number | null> {
  return new Promise((resolve) => {
    const t0 = Date.now()
    let settled = false
    const finish = (val: number | null): void => {
      if (settled) return
      settled = true
      try {
        socket.destroy()
      } catch {
        /* noop */
      }
      resolve(val)
    }

    const socket = tls.connect({
      host,
      port: 443,
      servername: host,
      rejectUnauthorized: false,
       timeout: timeoutMs
    })

    const timer = setTimeout(() => finish(null), timeoutMs)

    socket.once('secureConnect', () => {
      const wsKey = randomBytes(16).toString('base64')
      const req =
        `GET /apiws HTTP/1.1\r\n` +
        `Host: ${host}\r\n` +
        `Upgrade: websocket\r\n` +
        `Connection: Upgrade\r\n` +
        `Sec-WebSocket-Key: ${wsKey}\r\n` +
        `Sec-WebSocket-Version: 13\r\n` +
        `Sec-WebSocket-Protocol: binary\r\n\r\n`
      socket.write(req)
    })

    let buf = ''
    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8')
      if (buf.includes('\r\n\r\n') || buf.includes('\n\n')) {
        clearTimeout(timer)
        const firstLine = buf.split(/\r?\n/)[0] || ''
        if (/^HTTP\/1\.[01]\s+101\b/i.test(firstLine.trim())) {
          finish(Date.now() - t0)
        } else {
          finish(null)
        }
      }
    })

    socket.once('error', () => {
      clearTimeout(timer)
      finish(null)
    })
    socket.once('timeout', () => {
      clearTimeout(timer)
      finish(null)
    })
  })
}

async function probeBridgeDomain(domain: string): Promise<BridgeProbeResult> {
  const dc2 = await probeWsUpgradeOnce(`kws2.${domain}`, 3200)
  if (dc2 !== null) return { domain, latencyMs: dc2 }
  const dc4 = await probeWsUpgradeOnce(`kws4.${domain}`, 3200)
  return { domain, latencyMs: dc4 }
}

function probeTcpLatency(ip: string, port = 443, timeoutMs = 3000): Promise<number | null> {
  return new Promise((resolve) => {
    const t0 = Date.now()
    const sock = createConnection({ host: ip, port })
    let done = false
    const finish = (val: number | null): void => {
      if (done) return
      done = true
      try {
        sock.destroy()
      } catch {
        /* noop */
      }
      resolve(val)
    }
    sock.setTimeout(timeoutMs)
    sock.once('connect', () => finish(Date.now() - t0))
    sock.once('error', () => finish(null))
    sock.once('timeout', () => finish(null))
  })
}

export async function runTgwsTune(mode: 'fast' | 'full' = 'fast'): Promise<TgwsTuneReport> {
  const cfg = await getAppConfig()
  const t = cfg.tgws ?? ({} as TgwsConfig)
  const candidates = await collectCandidateBridgeDomains(t.cfproxyUserDomain)
  const testSet = mode === 'fast' ? candidates.slice(0, 10) : candidates

  appLog('info', `Запуск ${mode === 'fast' ? 'быстрого' : 'полного'} автоподбора мостов Telegram (${testSet.length} доменов)…`)

  // Run bridge probes in batches of 5
  const bridgeResults: BridgeProbeResult[] = []
  const batchSize = 5
  for (let i = 0; i < testSet.length; i += batchSize) {
    const slice = testSet.slice(i, i + batchSize)
    const batchRes = await Promise.all(slice.map(probeBridgeDomain))
    bridgeResults.push(...batchRes)
  }

  const reachableBridges = bridgeResults
    .filter((b): b is { domain: string; latencyMs: number } => b.latencyMs !== null)
    .sort((a, b) => a.latencyMs - b.latencyMs)

  // Probe direct Telegram DCs
  const dcTargets: Array<{ dc: number; ip: string }> =
    mode === 'full'
      ? [
          { dc: 1, ip: '149.154.175.50' },
          { dc: 2, ip: '149.154.167.220' },
          { dc: 2, ip: '149.154.167.51' },
          { dc: 3, ip: '149.154.175.100' },
          { dc: 4, ip: '149.154.167.220' },
          { dc: 4, ip: '149.154.167.91' },
          { dc: 5, ip: '91.108.56.100' }
        ]
      : [
          { dc: 2, ip: '149.154.167.220' },
          { dc: 2, ip: '149.154.167.51' },
          { dc: 4, ip: '149.154.167.91' }
        ]

  const directResults: DirectProbeResult[] = await Promise.all(
    dcTargets.map(async (d) => ({
      dc: d.dc,
      ip: d.ip,
      latencyMs: await probeTcpLatency(d.ip)
    }))
  )

  const reachableDirects = directResults
    .filter((d): d is { dc: number; ip: string; latencyMs: number } => d.latencyMs !== null)
    .sort((a, b) => a.latencyMs - b.latencyMs)

  const bestBridge = reachableBridges[0]
  const bestDirect = reachableDirects[0]

  let chosenMode: 'bridge' | 'direct' | 'auto' = 'auto'
  let summary = ''
  let cfproxyUserDomain = ''
  let mediaMode: 'default' | 'media_fix' | 'empty' = t.mediaMode ?? 'default'
  let dcIp = t.dcIp ?? []

  if (bestBridge && bestDirect) {
    if (bestBridge.latencyMs <= bestDirect.latencyMs + 60) {
      chosenMode = 'bridge'
      cfproxyUserDomain = reachableBridges
        .slice(0, 3)
        .map((b) => b.domain)
        .join(' ')
      summary = `Выбран быстрый мост ${bestBridge.domain} (${bestBridge.latencyMs} мс, прямое соединение: ${bestDirect.latencyMs} мс)`
    } else {
      chosenMode = 'direct'
      cfproxyUserDomain = reachableBridges
        .slice(0, 2)
        .map((b) => b.domain)
        .join(' ')
      summary = `Прямое соединение с DC${bestDirect.dc} (${bestDirect.latencyMs} мс) быстрее мостов (${bestBridge.latencyMs} мс)`
    }
  } else if (bestBridge) {
    chosenMode = 'bridge'
    cfproxyUserDomain = reachableBridges
      .slice(0, 3)
      .map((b) => b.domain)
      .join(' ')
    summary = `Прямое соединение заблокировано, выбран рабочий мост ${bestBridge.domain} (${bestBridge.latencyMs} мс)`
  } else if (bestDirect) {
    chosenMode = 'direct'
    cfproxyUserDomain = ''
    summary = `Мосты не ответили, используется прямое подключение к DC (${bestDirect.latencyMs} мс)`
  } else {
    chosenMode = 'auto'
    cfproxyUserDomain = ''
    summary = 'Рабочие мосты не обнаружены — включён автоматический баланс tg-ws-proxy'
  }

  if (mode === 'full') {
    // Build optimal DC->IP map from reachable directs
    const bestByDc = new Map<number, string>()
    for (const d of reachableDirects) {
      if (!bestByDc.has(d.dc)) bestByDc.set(d.dc, d.ip)
    }
    if (bestByDc.size >= 3) {
      mediaMode = 'media_fix'
      dcIp = Array.from(bestByDc.entries()).map(([dc, ip]) => `${dc}:${ip}`)
    } else {
      mediaMode = 'default'
      dcIp = ['2:149.154.167.220', '4:149.154.167.220']
    }
  }

  await patchAppConfig({
    tgws: {
      ...t,
      cfproxy: true,
      cfproxyUserDomain,
      mediaMode,
      dcIp
    }
  })

  if (getTgwsStatus().state === 'running') {
    await restartTgws().catch(() => void 0)
  }

  appLog('info', `Автоподбор TG WS завершён: ${summary}`)

  return {
    mode: chosenMode,
    summary,
    bestBridgeDomain: bestBridge?.domain,
    bestBridgeLatencyMs: bestBridge?.latencyMs,
    directLatencyMs: bestDirect?.latencyMs,
    bridges: bridgeResults,
    directs: directResults,
    appliedConfig: {
      cfproxy: true,
      cfproxyUserDomain,
      mediaMode,
      dcIp
    }
  }
}
