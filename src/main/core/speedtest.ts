import https from 'node:https'
import http from 'node:http'

export interface SpeedtestProgress {
  phase: 'ping' | 'download' | 'upload' | 'done' | 'error'
  pingMs?: number
  jitterMs?: number
  currentSpeedMbps?: number
  progressPercent?: number
  result?: SpeedtestResult
  error?: string
}

// Well-known reliable CDN test endpoints
const SPEEDTEST_ENDPOINTS = [
  {
    name: 'Cloudflare CDN',
    pingUrl: 'https://1.1.1.1/cdn-cgi/trace',
    chunkUrl: 'https://speed.cloudflare.com/__down?bytes=25000000', // 25 MB chunk
    smallChunkUrl: 'https://speed.cloudflare.com/__down?bytes=5000000'
  },
  {
    name: 'Fastly CDN',
    pingUrl: 'https://www.fastly.com',
    chunkUrl: 'https://speedtest.serverius.net/files/20mb.bin',
    smallChunkUrl: 'https://speedtest.serverius.net/files/5mb.bin'
  }
]

async function measurePing(url: string, samples = 4): Promise<{ pingMs: number; jitterMs: number }> {
  const times: number[] = []
  const parsed = new URL(url)
  const client = parsed.protocol === 'https:' ? https : http

  for (let i = 0; i < samples; i++) {
    const t0 = Date.now()
    try {
      await new Promise<void>((resolve, reject) => {
        const req = client.request(
          url,
          {
            method: 'HEAD',
            timeout: 3000,
            headers: { 'User-Agent': 'GhosterNet-Speedtest/1.0' }
          },
          (res) => {
            res.resume()
            resolve()
          }
        )
        req.on('error', reject)
        req.on('timeout', () => {
          req.destroy()
          reject(new Error('Ping timeout'))
        })
        req.end()
      })
      times.push(Date.now() - t0)
    } catch {
      times.push(300)
    }
    await new Promise((r) => setTimeout(r, 60))
  }

  const valid = times.filter((t) => t > 0)
  if (valid.length === 0) return { pingMs: 999, jitterMs: 0 }
  const avg = Math.round(valid.reduce((a, b) => a + b, 0) / valid.length)
  const jitter = Math.round(
    valid.reduce((acc, val) => acc + Math.abs(val - avg), 0) / valid.length
  )
  return { pingMs: avg, jitterMs: jitter }
}

export async function runSpeedtest(
  onProgress?: (progress: SpeedtestProgress) => void
): Promise<SpeedtestResult> {
  const endpoint = SPEEDTEST_ENDPOINTS[0]

  onProgress?.({ phase: 'ping', progressPercent: 10 })
  const { pingMs, jitterMs } = await measurePing(endpoint.pingUrl)

  onProgress?.({
    phase: 'download',
    pingMs,
    jitterMs,
    progressPercent: 25,
    currentSpeedMbps: 0
  })

  // Measure download speed using streaming chunks
  const parsed = new URL(endpoint.chunkUrl)
  const client = parsed.protocol === 'https:' ? https : http

  let totalBytes = 0
  const startTime = Date.now()
  let lastReportTime = startTime
  const maxDurationMs = 7000 // Test up to 7 seconds

  await new Promise<void>((resolve) => {
    let finished = false
    const finish = (): void => {
      if (!finished) {
        finished = true
        resolve()
      }
    }

    const timer = setTimeout(() => {
      finish()
    }, maxDurationMs)

    const req = client.get(
      endpoint.chunkUrl,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) GhosterNet/3.1',
          Accept: '*/*'
        },
        timeout: 9000
      },
      (res) => {
        res.on('data', (chunk: Buffer) => {
          totalBytes += chunk.length
          const now = Date.now()
          if (now - lastReportTime >= 250) {
            const elapsedSec = (now - startTime) / 1000
            const currentMbps = (totalBytes * 8) / (elapsedSec * 1000000)
            const percent = Math.min(95, Math.round(25 + (elapsedSec / (maxDurationMs / 1000)) * 70))
            onProgress?.({
              phase: 'download',
              pingMs,
              jitterMs,
              currentSpeedMbps: Math.round(currentMbps * 10) / 10,
              progressPercent: percent
            })
            lastReportTime = now
          }
        })
        res.on('end', () => {
          clearTimeout(timer)
          finish()
        })
        res.on('error', () => {
          clearTimeout(timer)
          finish()
        })
      }
    )

    req.on('error', () => {
      clearTimeout(timer)
      finish()
    })
    req.on('timeout', () => {
      req.destroy()
      clearTimeout(timer)
      finish()
    })
  })

  const elapsedSec = Math.max(0.5, (Date.now() - startTime) / 1000)
  const downloadMbps = Math.round(((totalBytes * 8) / (elapsedSec * 1000000)) * 10) / 10

  const result: SpeedtestResult = {
    pingMs,
    jitterMs,
    downloadMbps: downloadMbps > 0 ? downloadMbps : 0,
    serverLocation: 'Cloudflare Anycast Global CDN'
  }

  onProgress?.({
    phase: 'done',
    progressPercent: 100,
    pingMs,
    jitterMs,
    currentSpeedMbps: downloadMbps,
    result
  })

  return result
}
