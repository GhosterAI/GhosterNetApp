/**
 * Sing-box v1.10+ JSON configuration builder
 */
export function buildSingBoxOutbound(server: VpnServer): Record<string, unknown> {
  const d = (server.details ?? {}) as Record<string, unknown>

  switch (server.type) {
    case 'vless': {
      const isReality = d.security === 'reality'
      const isTls = d.security === 'tls' || isReality

      const outbound: Record<string, unknown> = {
        type: 'vless',
        tag: 'proxy',
        server: server.server,
        server_port: server.serverPort,
        uuid: d.uuid
      }

      if (d.flow) outbound.flow = d.flow

      if (isTls) {
        const tlsObj: Record<string, unknown> = {
          enabled: true,
          server_name: d.sni || server.server,
          utls: {
            enabled: true,
            fingerprint: d.fp || 'chrome'
          }
        }

        if (isReality) {
          tlsObj.reality = {
            enabled: true,
            public_key: d.pbk,
            short_id: d.sid || ''
          }
        }

        outbound.tls = tlsObj
      }

      if (d.network && d.network !== 'tcp') {
        const transport: Record<string, unknown> = {
          type: d.network
        }
        if (d.path) transport.path = d.path
        if (d.host) {
          transport.headers = { Host: d.host }
        }
        if (d.serviceName) transport.service_name = d.serviceName
        outbound.transport = transport
      }

      return outbound
    }

    case 'vmess': {
      const isTls = d.security === 'tls'
      const outbound: Record<string, unknown> = {
        type: 'vmess',
        tag: 'proxy',
        server: server.server,
        server_port: server.serverPort,
        uuid: d.uuid,
        alter_id: d.alterId ?? 0,
        security: 'auto'
      }

      if (isTls) {
        outbound.tls = {
          enabled: true,
          server_name: d.sni || server.server
        }
      }

      if (d.network && d.network !== 'tcp') {
        const transport: Record<string, unknown> = {
          type: d.network
        }
        if (d.path) transport.path = d.path
        if (d.host) {
          transport.headers = { Host: d.host }
        }
        outbound.transport = transport
      }

      return outbound
    }

    case 'trojan': {
      return {
        type: 'trojan',
        tag: 'proxy',
        server: server.server,
        server_port: server.serverPort,
        password: d.password,
        tls: {
          enabled: true,
          server_name: d.sni || server.server
        }
      }
    }

    case 'shadowsocks': {
      return {
        type: 'shadowsocks',
        tag: 'proxy',
        server: server.server,
        server_port: server.serverPort,
        method: d.method || 'aes-256-gcm',
        password: d.password
      }
    }

    case 'hysteria2': {
      const outbound: Record<string, unknown> = {
        type: 'hysteria2',
        tag: 'proxy',
        server: server.server,
        server_port: server.serverPort,
        password: d.password,
        tls: {
          enabled: true,
          server_name: d.sni || server.server,
          insecure: Boolean(d.insecure)
        }
      }

      if (d.obfs) {
        outbound.obfs = {
          type: d.obfs,
          password: d.obfsPassword || ''
        }
      }

      return outbound
    }

    case 'tuic': {
      return {
        type: 'tuic',
        tag: 'proxy',
        server: server.server,
        server_port: server.serverPort,
        uuid: d.uuid,
        password: d.password,
        congestion_control: d.congestionControl || 'bbr',
        tls: {
          enabled: true,
          server_name: d.sni || server.server
        }
      }
    }

    case 'awg':
    case 'wireguard': {
      // Wireproxy runs on local loopback port 2082
      return {
        type: 'socks',
        tag: 'proxy',
        server: '127.0.0.1',
        server_port: 2082,
        version: '5'
      }
    }

    default:
      return {
        type: 'direct',
        tag: 'proxy'
      }
  }
}

/**
 * Build wireproxy INI configuration for AmneziaWG / WireGuard with DPI obfuscation
 */
export function buildWireproxyConfig(server: VpnServer, localPort = 2082): string {
  const d = (server.details ?? {}) as Record<string, unknown>
  const lines: string[] = []

  lines.push('[Interface]')
  lines.push(`Address = ${d.address || '10.8.0.2/24'}`)
  lines.push(`PrivateKey = ${d.privateKey || ''}`)
  if (d.dns) lines.push(`DNS = ${d.dns}`)

  // AmneziaWG obfuscation parameters
  if (d.jc !== undefined && d.jc !== '') lines.push(`Jc = ${d.jc}`)
  if (d.jmin !== undefined && d.jmin !== '') lines.push(`Jmin = ${d.jmin}`)
  if (d.jmax !== undefined && d.jmax !== '') lines.push(`Jmax = ${d.jmax}`)
  if (d.s1 !== undefined && d.s1 !== '') lines.push(`S1 = ${d.s1}`)
  if (d.s2 !== undefined && d.s2 !== '') lines.push(`S2 = ${d.s2}`)
  if (d.h1 !== undefined && d.h1 !== '') lines.push(`H1 = ${d.h1}`)
  if (d.h2 !== undefined && d.h2 !== '') lines.push(`H2 = ${d.h2}`)
  if (d.h3 !== undefined && d.h3 !== '') lines.push(`H3 = ${d.h3}`)
  if (d.h4 !== undefined && d.h4 !== '') lines.push(`H4 = ${d.h4}`)

  lines.push('')
  lines.push('[Peer]')
  lines.push(`PublicKey = ${d.publicKey || ''}`)
  if (d.presharedKey) lines.push(`PresharedKey = ${d.presharedKey}`)
  lines.push(`Endpoint = ${server.server}:${server.serverPort}`)
  lines.push(`AllowedIPs = ${d.allowedIps || '0.0.0.0/0, ::/0'}`)

  lines.push('')
  lines.push('[Socks5]')
  lines.push(`BindAddress = 127.0.0.1:${localPort}`)

  return lines.join('\n')
}

export interface BuildSingBoxConfigOptions {
  server: VpnServer
  tunMode: boolean
  routingMode: VpnRoutingMode
  localHttpPort: number
  localSocksPort: number
}

const RU_DOMAIN_SUFFIXES = [
  '.ru',
  '.su',
  '.xn--p1ai',
  'yandex.ru',
  'ya.ru',
  'vk.com',
  'vkvideo.ru',
  'ok.ru',
  'mail.ru',
  'gosuslugi.ru',
  'rambler.ru',
  'avito.ru',
  'ozon.ru',
  'wildberries.ru',
  'sberbank.ru',
  'tbank.ru',
  'tinkoff.ru',
  'kinopoisk.ru',
  'rutube.ru',
  'dzen.ru',
  'kion.ru',
  'ivi.ru',
  '2gis.ru'
]

export function buildSingBoxConfig(opts: BuildSingBoxConfigOptions): Record<string, unknown> {
  const { server, tunMode, routingMode, localHttpPort, localSocksPort } = opts
  const inbounds: Array<Record<string, unknown>> = []

  // Mixed inbound (HTTP + SOCKS5)
  inbounds.push({
    type: 'mixed',
    tag: 'mixed-in',
    listen: '127.0.0.1',
    listen_port: localHttpPort
  })

  // SOCKS5 inbound if separate port configured
  if (localSocksPort && localSocksPort !== localHttpPort) {
    inbounds.push({
      type: 'socks',
      tag: 'socks-in',
      listen: '127.0.0.1',
      listen_port: localSocksPort
    })
  }

  // Wintun TUN inbound
  if (tunMode && routingMode !== 'proxy-only') {
    inbounds.push({
      type: 'tun',
      tag: 'tun-in',
      interface_name: 'GhosterNet-TUN',
      address: ['172.19.0.1/30'],
      auto_route: true,
      strict_route: true,
      stack: 'system'
    })
  }

  const proxyOutbound = buildSingBoxOutbound(server)

  const outbounds: Array<Record<string, unknown>> = [
    proxyOutbound,
    {
      type: 'direct',
      tag: 'direct'
    },
    {
      type: 'block',
      tag: 'block'
    }
  ]

  const rules: Array<Record<string, unknown>> = [
    {
      action: 'sniff'
    },
    {
      protocol: 'dns',
      action: 'hijack-dns'
    },
    {
      outbound: 'direct',
      ip_is_private: true
    }
  ]

  if (routingMode === 'bypass-ru') {
    rules.push({
      outbound: 'direct',
      domain_suffix: RU_DOMAIN_SUFFIXES
    })
    rules.push({
      outbound: 'direct',
      rule_set: ['geosite-ru', 'geoip-ru']
    })
  }

  const dnsServers: Array<Record<string, unknown>> = [
    {
      tag: 'remote-dns',
      type: 'https',
      server: '1.1.1.1',
      domain_resolver: 'direct-dns'
    },
    {
      tag: 'direct-dns',
      type: 'udp',
      server: '77.88.8.8',
      detour: 'direct'
    }
  ]

  const dnsRules: Array<Record<string, unknown>> = []

  if (routingMode === 'bypass-ru') {
    dnsRules.push({
      domain_suffix: RU_DOMAIN_SUFFIXES,
      server: 'direct-dns'
    })
    dnsRules.push({
      rule_set: ['geosite-ru'],
      server: 'direct-dns'
    })
  }

  const routeObj: Record<string, unknown> = {
    rules,
    auto_detect_interface: true,
    default_domain_resolver: 'direct-dns',
    final: 'proxy'
  }

  if (routingMode === 'bypass-ru') {
    routeObj.rule_set = [
      {
        tag: 'geosite-ru',
        type: 'remote',
        format: 'binary',
        url: 'https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-ru.srs',
        download_detour: 'direct'
      },
      {
        tag: 'geoip-ru',
        type: 'remote',
        format: 'binary',
        url: 'https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-ru.srs',
        download_detour: 'direct'
      }
    ]
  }

  return {
    log: {
      level: 'info',
      timestamp: true
    },
    dns: {
      servers: dnsServers,
      rules: dnsRules,
      final: 'remote-dns',
      strategy: 'prefer_ipv4'
    },
    inbounds,
    outbounds,
    route: routeObj
  }
}
