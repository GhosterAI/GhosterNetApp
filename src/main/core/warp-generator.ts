import crypto from 'node:crypto'
import https from 'node:https'

interface WarpRegResponse {
  id: string
  type: string
  config: {
    client_id: string
    peers: Array<{
      public_key: string
      endpoint: {
        v4: string
        v6: string
        host: string
      }
    }>
    interface: {
      addresses: {
        v4: string
        v6: string
      }
    }
  }
  account: {
    id: string
    account_type: string
  }
  token: string
}

// Generate X25519 keypair in Node.js crypto
function generateWireguardKeyPair(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('x25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' }
  })

  // WireGuard uses raw 32-byte keys encoded in Base64
  // DER encoding for x25519 has a 12-byte header for public key, 16-byte header for private key
  const rawPriv = privateKey.subarray(privateKey.length - 32)
  const rawPub = publicKey.subarray(publicKey.length - 32)

  return {
    privateKey: rawPriv.toString('base64'),
    publicKey: rawPub.toString('base64')
  }
}

/**
 * 1-Click Cloudflare WARP Profile Generator
 * Calls Cloudflare WARP registration API to allocate free WireGuard configuration.
 */
export async function generateCloudflareWarpServer(): Promise<VpnServer> {
  const keys = generateWireguardKeyPair()
  const installId = crypto.randomBytes(11).toString('base64').replace(/[+/=]/g, 'a')
  const body = JSON.stringify({
    key: keys.publicKey,
    install_id: installId,
    fcm_token: '',
    tos: new Date().toISOString(),
    model: 'PC',
    serial_number: installId,
    locale: 'ru_RU'
  })

  const resData = await new Promise<string>((resolve, reject) => {
    const req = https.request(
      'https://api.cloudflareclient.com/v0a2158/reg',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'User-Agent': 'okhttp/3.12.1',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 10000
      },
      (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data)
          } else {
            reject(new Error(`Cloudflare WARP API error: HTTP ${res.statusCode} ${data}`))
          }
        })
      }
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Cloudflare API timeout'))
    })
    req.write(body)
    req.end()
  })

  const reg: WarpRegResponse = JSON.parse(resData)
  const peer = reg.config?.peers?.[0]
  const iface = reg.config?.interface?.addresses

  if (!peer || !iface) {
    throw new Error('Cloudflare не вернул параметры WireGuard')
  }

  const endpointHost = '162.159.192.1'
  const endpointPort = 2408
  const peerPublicKey = peer.public_key
  const clientIpv4 = iface.v4
  const clientIpv6 = iface.v6

  // Construct raw WireGuard / AmneziaWG URI for easy export
  const rawUri = `wireguard://${keys.privateKey}@${endpointHost}:${endpointPort}?publickey=${encodeURIComponent(
    peerPublicKey
  )}&address=${encodeURIComponent(`${clientIpv4}/32`)}&dns=1.1.1.1#Cloudflare+WARP`

  const server: VpnServer = {
    id: `warp-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    name: 'Cloudflare WARP (Auto)',
    type: 'wireguard',
    server: endpointHost,
    serverPort: endpointPort,
    countryCode: 'US',
    rawUri,
    details: {
      privateKey: keys.privateKey,
      publicKey: peerPublicKey,
      address: `${clientIpv4}/32, ${clientIpv6}/128`,
      dns: '1.1.1.1, 1.0.0.1',
      allowedIps: '0.0.0.0/0, ::/0',
      isWarp: true,
      reserved: reg.config.client_id
    }
  }

  return server
}
