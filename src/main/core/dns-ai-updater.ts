import { existsSync, mkdirSync, writeFileSync, copyFileSync } from 'fs'
import path from 'path'
import { spawn, execFile } from 'child_process'
import { promisify } from 'util'
import { dnsAiRuntimeDir, resourcesDir } from '../utils/dirs'
import { getAppConfig, patchAppConfig } from '../config'
import { loadUpdateCache, saveUpdateCache } from '../utils/update-cache'
import { appLog } from '../utils/app-logger'

const execFileAsync = promisify(execFile)

const REPO = 'confeden/DNS-AI'
const RELEASES_LATEST_URL = `https://api.github.com/repos/${REPO}/releases/latest`
const REQUEST_HEADERS: Record<string, string> = {
  'User-Agent': 'GhosterNet-Updater',
  Accept: 'application/vnd.github+json'
}

export const BUNDLED_DNS_AI_VERSION = '1.0.0'

export interface DnsAiUpdateInfo {
  installed?: string
  latest?: string
  hasUpdate: boolean
  assetName?: string
  assetUrl?: string
  assetSize?: number
  releaseUrl?: string
  publishedAt?: string
  dismissed?: boolean
}

function compareVersion(a: string, b: string): number {
  const norm = (v: string): (number | string)[] =>
    v
      .replace(/^v/i, '')
      .split(/[.\-+]/)
      .map((p) => (/^\d+$/.test(p) ? parseInt(p, 10) : p))
  const aa = norm(a)
  const bb = norm(b)
  const len = Math.max(aa.length, bb.length)
  for (let i = 0; i < len; i++) {
    const av = aa[i] ?? 0
    const bv = bb[i] ?? 0
    if (typeof av === 'number' && typeof bv === 'number') {
      if (av > bv) return 1
      if (av < bv) return -1
    } else {
      const as = String(av)
      const bs = String(bv)
      if (as > bs) return 1
      if (as < bs) return -1
    }
  }
  return 0
}

interface GhAsset {
  name: string
  browser_download_url: string
  size: number
}
interface GhRelease {
  tag_name?: string
  name?: string
  html_url?: string
  published_at?: string
  assets?: GhAsset[]
}

let cache: { at: number; data: DnsAiUpdateInfo } | null = null
let cacheHydrated = false
const CACHE_TTL_MS = 12 * 60 * 60 * 1000
const CACHE_NAME = 'dns-ai'

function hydrateCacheFromDisk(): void {
  if (cacheHydrated) return
  cacheHydrated = true
  const persisted = loadUpdateCache<DnsAiUpdateInfo>(CACHE_NAME)
  if (persisted) cache = persisted
}

let refreshInflight = false
function backgroundRefresh(): void {
  if (refreshInflight) return
  refreshInflight = true
  checkDnsAiUpdate(true)
    .catch(() => void 0)
    .finally(() => {
      refreshInflight = false
    })
}

function effectiveInstalled(cfgInstalled?: string): string {
  return cfgInstalled && cfgInstalled.trim() ? cfgInstalled.trim() : BUNDLED_DNS_AI_VERSION
}

export async function checkDnsAiUpdate(force = false): Promise<DnsAiUpdateInfo> {
  hydrateCacheFromDisk()
  const cfg = await getAppConfig()
  const installed = effectiveInstalled(cfg.dnsAi?.installedVersion)
  const dismissedTag = cfg.dnsAi?.dismissedUpdateTag

  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS && cache.data.latest) {
    if (Date.now() - cache.at > 60 * 60 * 1000) backgroundRefresh()
    return {
      ...cache.data,
      installed,
      hasUpdate: compareVersion(cache.data.latest, installed) > 0,
      dismissed: dismissedTag === cache.data.latest
    }
  }

  let release: GhRelease
  try {
    const res = await fetch(RELEASES_LATEST_URL, { headers: REQUEST_HEADERS })
    if (!res.ok) throw new Error(`GitHub API ${res.status}`)
    release = (await res.json()) as GhRelease
  } catch (e) {
    throw new Error(`Не удалось проверить обновления DNS-AI: ${e instanceof Error ? e.message : String(e)}`)
  }

  const latestRaw = release.tag_name ?? release.name ?? ''
  const latest = latestRaw.replace(/^v/i, '').trim() || undefined

  const assets = release.assets ?? []
  const winAsset =
    assets.find((a) => /^DNS-AI\.exe$/i.test(a.name)) ??
    assets.find((a) => /^DNS-AI.*\.exe$/i.test(a.name))

  const hasUpdate = !!latest && compareVersion(latest, installed) > 0

  const info: DnsAiUpdateInfo = {
    installed,
    latest,
    hasUpdate,
    assetName: winAsset?.name,
    assetUrl: winAsset?.browser_download_url,
    assetSize: winAsset?.size,
    releaseUrl: release.html_url,
    publishedAt: release.published_at,
    dismissed: !!latest && dismissedTag === latest
  }

  cache = { at: Date.now(), data: info }
  saveUpdateCache(CACHE_NAME, info)
  return info
}

async function killStaleDnsAiBinary(): Promise<void> {
  if (process.platform !== 'win32') return
  await new Promise<void>((resolve) => {
    const p = spawn('taskkill.exe', ['/F', '/IM', 'DNS-AI.exe', '/T'], {
      windowsHide: true
    })
    p.on('exit', () => resolve())
    p.on('error', () => resolve())
  })
  await new Promise((r) => setTimeout(r, 350))
}

export async function installDnsAiUpdate(
  assetUrl: string,
  expectedVersion?: string
): Promise<{ installedVersion?: string; sizeBytes: number }> {
  if (!assetUrl) throw new Error('Пустая ссылка на бинарник DNS-AI')

  let serviceWasRunning = false
  let serviceWasInstalled = false

  try {
    const { stdout } = await execFileAsync('sc.exe', ['query', 'DnsAiClient'], {
      windowsHide: true,
      timeout: 4000
    })
    serviceWasInstalled = !stdout.includes('1060')
    serviceWasRunning = /STATE\s*:\s*4\s+RUNNING/i.test(stdout)
  } catch {
    // not installed or error
  }

  if (serviceWasRunning) {
    try {
      await execFileAsync('sc.exe', ['stop', 'DnsAiClient'], {
        windowsHide: true,
        timeout: 8000
      })
      await new Promise((r) => setTimeout(r, 800))
    } catch {
      // best-effort
    }
  }

  await killStaleDnsAiBinary()

  let buf: Buffer
  try {
    const res = await fetch(assetUrl, { headers: { 'User-Agent': REQUEST_HEADERS['User-Agent'] } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const ab = await res.arrayBuffer()
    buf = Buffer.from(ab)
  } catch (e) {
    throw new Error(`Не удалось скачать DNS-AI: ${e instanceof Error ? e.message : String(e)}`)
  }

  if (buf.length < 1024 * 1024) {
    throw new Error(`Загруженный файл DNS-AI слишком маленький (${buf.length} байт)`)
  }

  const dir = dnsAiRuntimeDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const dest = path.join(dir, 'DNS-AI.exe')

  // Copy bundled endpoints.json to runtime dir if missing
  const runtimeEndpoints = path.join(dir, 'endpoints.json')
  const bundledEndpoints = path.join(resourcesDir(), 'dns-ai', 'endpoints.json')
  if (!existsSync(runtimeEndpoints) && existsSync(bundledEndpoints)) {
    try {
      copyFileSync(bundledEndpoints, runtimeEndpoints)
    } catch {
      // ignore
    }
  }

  writeFileSync(dest, buf)

  // If service was installed, update service binPath to the new runtime binary
  if (serviceWasInstalled) {
    try {
      await execFileAsync('sc.exe', ['config', 'DnsAiClient', `binPath= "${dest} run-service"`], {
        windowsHide: true,
        timeout: 5000
      })
    } catch {
      // fallback: try reinstalling via binary
      try {
        await execFileAsync(dest, ['install'], { windowsHide: true, timeout: 10000 })
      } catch {
        // ignore
      }
    }

    if (serviceWasRunning) {
      try {
        await execFileAsync('sc.exe', ['start', 'DnsAiClient'], {
          windowsHide: true,
          timeout: 8000
        })
      } catch {
        // ignore
      }
    }
  }

  const finalVersion = expectedVersion || undefined
  const cfg = await getAppConfig()
  const next = {
    ...(cfg.dnsAi || {}),
    installedVersion: finalVersion ?? cfg.dnsAi?.installedVersion,
    dismissedUpdateTag: undefined
  }
  await patchAppConfig({ dnsAi: next })

  cache = null
  appLog('info', `DNS-AI обновлён до версии ${finalVersion ?? 'latest'} (${(buf.length / 1024 / 1024).toFixed(1)} МБ)`)
  return { installedVersion: finalVersion, sizeBytes: buf.length }
}

export async function dismissDnsAiUpdate(tag: string): Promise<void> {
  if (!tag) return
  const cfg = await getAppConfig()
  const next = {
    ...(cfg.dnsAi || {}),
    dismissedUpdateTag: tag
  }
  await patchAppConfig({ dnsAi: next })
  if (cache) cache.data.dismissed = cache.data.latest === tag
}
