// Автопроверка здоровья DNS-провайдеров Antigravity Unlocker.
//
// Зачем это нужно. Релей выбирает подменённый адрес гонкой провайдеров: побеждает
// первый, кто ответил адресом, не совпадающим с эталонным (настоящим) Google.
// Если провайдер ответит адресом, чей egress мёртв — TCP:443 закрыт, соединения
// принимаются и повисают в чёрной дыре — релей уходит туда всем трафиком, IDE
// получает сброс соединения, при том что остальные провайдеры пула живы и рабочие.
// Именно так 2026-10-28 слёг dns-ai.ru: он продолжал отвечать валидный DNS, но
// по адресу 109.120.131.200, у которого закрыт 443-й порт.
//
// Модуль измеряет ровно то, что решает исход гонки: отвечает ли провайдер на
// запрос по гейт-именам и принимает ли любой из отданных адресов TCP-соединение
// на 443. Провайдер, который просто не подменяет имя (проходит настоящий адрес
// Google), считается живым: настоящий фронтенд принимает TCP, а вреда от него
// нет — гонка его проиграет сама. Проверки не зависят от NRPT-правил и состояния
// релея: UDP и DoH спрашиваются напрямую по адресам провайдера, как это делает
// и сам релей (его NRPT-исключение 127.0.0.53 в этой проверке не участвует).

import dgram from 'dgram'
import http2 from 'node:http2'
import net from 'node:net'

export interface AgProviderHealth {
  name: string
  /** Провайдер жив: ответил и хотя бы один из отданных адресов принимает TCP:443. */
  ok: boolean
  /** Человекочитаемая причина, почему провайдер признан мёртвым. */
  reason: string
  /** Все A-адреса, отданные провайдером по гейт-именам (для отладки/лога). */
  answers: string[]
  checkedAt: number
}

interface ProviderEndpoint {
  name: string
  transport: 'udp' | 'doh'
  addrs: string[]
  dohHost?: string
  dohPath?: string
}

// Адреса зеркалируют src/resolvers.rs релея (v2.26.0). Если автор сменит их,
// проверка увидит «все мёртвы» и не отключит никого (см. guard в контроллере) —
// худшее, что может случиться от устаревшего списка, это отсутствие автопроверки.
export const AG_PROVIDERS: ProviderEndpoint[] = [
  {
    name: 'dns-ai.ru',
    transport: 'doh',
    addrs: ['194.87.196.13', '45.151.102.219', '185.251.90.181'],
    dohHost: 'dns.dns-ai.ru',
    dohPath: '/dns-query'
  },
  { name: 'comss.one', transport: 'udp', addrs: ['83.220.169.155', '212.109.195.93', '195.133.25.16'] },
  { name: 'geohide.ru', transport: 'udp', addrs: ['45.155.204.190', '37.230.192.51'] }
]

const GATE_HOSTS = ['cloudcode-pa.googleapis.com', 'daily-cloudcode-pa.googleapis.com']
const UDP_TIMEOUT_MS = 3500
const DOH_TIMEOUT_MS = 6000
const TCP_PROBE_TIMEOUT_MS = 4500

// ---------------------------------------------------------------------------
// DNS wireformat: минимальный кодек для A-запроса и разбора ответа.

function buildDnsQuery(name: string, id: number): Buffer {
  const parts: number[] = [
    (id >> 8) & 0xff, id & 0xff,
    0x01, 0x00, // RD=1
    0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
  ]
  for (const label of name.split('.')) {
    parts.push(label.length)
    for (let i = 0; i < label.length; i++) parts.push(label.charCodeAt(i))
  }
  parts.push(0, 0, 1, 0, 1) // корень, A, IN
  return Buffer.from(parts)
}

/** Читает сжатое имя, возвращает его и позицию сразу после имени. */
function readDnsName(buf: Buffer, pos: number): { name: string; end: number } {
  const labels: string[] = []
  let end = -1
  for (;;) {
    const len = buf[pos]
    if (len === 0) {
      if (end < 0) end = pos + 1
      break
    }
    if ((len & 0xc0) === 0xc0) {
      if (end < 0) end = pos + 2
      pos = ((len & 0x3f) << 8) | buf[pos + 1]
      continue
    }
    labels.push(buf.toString('latin1', pos + 1, pos + 1 + len))
    pos += len + 1
  }
  return { name: labels.join('.'), end }
}

/** A-адреса из секции ответов (CNAME пропускаются). */
function parseARecords(buf: Buffer): string[] {
  try {
    const ancount = buf.readUInt16BE(6)
    if (ancount === 0) return []
    let pos = 12
    pos = readDnsName(buf, pos).end + 4 // вопрос
    const out: string[] = []
    for (let i = 0; i < ancount; i++) {
      pos = readDnsName(buf, pos).end
      const type = buf.readUInt16BE(pos)
      const rdlen = buf.readUInt16BE(pos + 8)
      if (type === 1 && rdlen === 4) {
        out.push(`${buf[pos + 10]}.${buf[pos + 11]}.${buf[pos + 12]}.${buf[pos + 13]}`)
      }
      pos += 10 + rdlen
    }
    return out
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// UDP: прямой запрос по адресу провайдера.

function udpQuery(addr: string, host: string): Promise<string[] | null> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4')
    const id = Math.floor(Math.random() * 0xffff)
    const query = buildDnsQuery(host, id)
    let settled = false
    const finish = (result: string[] | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        socket.close()
      } catch {
        // уже закрыт
      }
      resolve(result)
    }
    const timer = setTimeout(() => finish(null), UDP_TIMEOUT_MS)
    socket.on('message', (msg: Buffer) => {
      if (msg.length < 12) return
      const respId = msg.readUInt16BE(0)
      if (respId !== id) return // чужой ответ (SPA/мусор) — ждём свой
      const ips = parseARecords(msg)
      if (ips.length > 0) finish(ips)
      else finish([])
    })
    socket.on('error', () => finish(null))
    try {
      socket.send(query, 53, addr, (err) => {
        if (err) finish(null)
      })
    } catch {
      finish(null)
    }
  })
}

// ---------------------------------------------------------------------------
// DoH: dns-ai.ru отвечает 505 на HTTP/1.1 и держит только h2 в ALPN, поэтому
// запрос идёт по HTTP/2 с соединением по адресу и SNI по имени (как в doh.rs).

function dohQuery(addr: string, dohHost: string, dohPath: string, host: string): Promise<string[] | null> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (result: string[] | null): void => {
      if (settled) return
      settled = true
      resolve(result)
    }
    let session: http2.ClientHttp2Session | null = null
    const timer = setTimeout(() => {
      finish(null)
      try {
        session?.destroy()
      } catch {
        // ignore
      }
    }, DOH_TIMEOUT_MS)
    try {
      session = http2.connect(`https://${dohHost}`, { host: addr, rejectUnauthorized: true })
      session.on('error', () => finish(null))
      const dns = buildDnsQuery(host, 0x1234).toString('base64url')
      const req = session.request({
        ':method': 'GET',
        ':path': `${dohPath}?dns=${dns}`,
        accept: 'application/dns-message'
      })
      const chunks: Buffer[] = []
      req.on('data', (d: Buffer) => chunks.push(d))
      req.on('error', () => finish(null))
      req.on('end', () => {
        clearTimeout(timer)
        try {
          session?.close()
        } catch {
          // ignore
        }
        finish(parseARecords(Buffer.concat(chunks)))
      })
      req.end()
    } catch {
      clearTimeout(timer)
      finish(null)
    }
  })
}

// ---------------------------------------------------------------------------
// TCP-проба: принимает ли адрес соединение на 443 (мёртвый egress — не принимает).

function tcpOpens(addr: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    let settled = false
    const finish = (ok: boolean): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      resolve(ok)
    }
    const timer = setTimeout(() => finish(false), TCP_PROBE_TIMEOUT_MS)
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
    try {
      socket.connect(443, addr)
    } catch {
      finish(false)
    }
  })
}

// ---------------------------------------------------------------------------

async function checkProvider(p: ProviderEndpoint): Promise<AgProviderHealth> {
  const answers = new Set<string>()
  let dnsAnswered = false

  // Спрашиваем все адреса провайдера параллельно по обоим гейт-именам: подмена
  // может существовать только на одном из имён, а отвечать может любой узел.
  const jobs: Promise<void>[] = []
  for (const addr of p.addrs) {
    for (const host of GATE_HOSTS) {
      jobs.push(
        (async () => {
          const result =
            p.transport === 'doh'
              ? await dohQuery(addr, p.dohHost || '', p.dohPath || '', host)
              : await udpQuery(addr, host)
          if (result) {
            dnsAnswered = true
            for (const ip of result) answers.add(ip)
          }
        })()
      )
    }
  }
  await Promise.allSettled(jobs)

  const list = [...answers]
  if (!dnsAnswered || list.length === 0) {
    return {
      name: p.name,
      ok: false,
      reason: 'нет ответа DNS',
      answers: list,
      checkedAt: Date.now()
    }
  }

  const probes = await Promise.all(list.map((ip) => tcpOpens(ip)))
  const openCount = probes.filter(Boolean).length
  if (openCount === 0) {
    return {
      name: p.name,
      ok: false,
      reason: `мёртвый egress: ни один из адресов (${list.join(', ')}) не принимает TCP:443`,
      answers: list,
      checkedAt: Date.now()
    }
  }

  return {
    name: p.name,
    ok: true,
    reason: `жив: ${openCount}/${list.length} адресов отвечают`,
    answers: list,
    checkedAt: Date.now()
  }
}

/** Проверяет всех провайдеров параллельно. Общее время — около одной пробы. */
export async function checkAgProviders(): Promise<AgProviderHealth[]> {
  return Promise.all(AG_PROVIDERS.map((p) => checkProvider(p)))
}
