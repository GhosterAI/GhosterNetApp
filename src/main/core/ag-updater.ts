import { existsSync, mkdirSync, writeFileSync, copyFileSync } from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { agUnlockerRuntimeDir } from '../utils/dirs'
import { getAppConfig, patchAppConfig } from '../config'
import { loadUpdateCache, saveUpdateCache } from '../utils/update-cache'
import { appLog } from '../utils/app-logger'

const REPO = 'confeden/Antigravity'
const RELEASES_LATEST_URL = `https://api.github.com/repos/${REPO}/releases/latest`
const REQUEST_HEADERS: Record<string, string> = {
  'User-Agent': 'GhosterNet-Updater',
  Accept: 'application/vnd.github+json'
}

export const BUNDLED_AG_VERSION = '2.26.0'

export interface AgUpdateInfo {
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

let cache: { at: number; data: AgUpdateInfo } | null = null
let cacheHydrated = false
const CACHE_TTL_MS = 12 * 60 * 60 * 1000
const CACHE_NAME = 'ag-unlocker'

function hydrateCacheFromDisk(): void {
  if (cacheHydrated) return
  cacheHydrated = true
  const persisted = loadUpdateCache<AgUpdateInfo>(CACHE_NAME)
  if (persisted) cache = persisted
}

let refreshInflight = false
function backgroundRefresh(): void {
  if (refreshInflight) return
  refreshInflight = true
  checkAgUpdate(true)
    .catch(() => void 0)
    .finally(() => {
      refreshInflight = false
    })
}

function effectiveInstalled(cfgInstalled?: string): string {
  return cfgInstalled && cfgInstalled.trim() ? cfgInstalled.trim() : BUNDLED_AG_VERSION
}

export async function checkAgUpdate(force = false): Promise<AgUpdateInfo> {
  hydrateCacheFromDisk()
  const cfg = await getAppConfig()
  const installed = effectiveInstalled(cfg.agUnlocker?.installedVersion)
  const dismissedTag = cfg.agUnlocker?.dismissedUpdateTag

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
    throw new Error(`Не удалось проверить обновления Antigravity Unlocker: ${e instanceof Error ? e.message : String(e)}`)
  }

  const latestRaw = release.tag_name ?? release.name ?? ''
  const latest = latestRaw.replace(/^v/i, '').trim() || undefined

  const assets = release.assets ?? []
  // Matches "AG_2.22.0.exe" or "AG_*.exe" (excluding linux or tar.gz)
  const winAsset =
    assets.find((a) => /^AG_.*\.exe$/i.test(a.name) && !/linux/i.test(a.name)) ??
    assets.find((a) => /\.exe$/i.test(a.name) && !/linux/i.test(a.name))

  const hasUpdate = !!latest && compareVersion(latest, installed) > 0

  const info: AgUpdateInfo = {
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

async function killStaleAgProcesses(): Promise<void> {
  if (process.platform !== 'win32') return
  await new Promise<void>((resolve) => {
    const p = spawn('taskkill.exe', ['/F', '/IM', 'ag_dns.exe', '/T'], {
      windowsHide: true
    })
    p.on('exit', () => resolve())
    p.on('error', () => resolve())
  })
  await new Promise<void>((resolve) => {
    const p = spawn('taskkill.exe', ['/F', '/IM', 'AG_*.exe', '/T'], {
      windowsHide: true
    })
    p.on('exit', () => resolve())
    p.on('error', () => resolve())
  })
  await new Promise((r) => setTimeout(r, 350))
}

export async function installAgUpdate(
  assetUrl: string,
  expectedVersion?: string
): Promise<{ installedVersion?: string; sizeBytes: number }> {
  if (!assetUrl) throw new Error('Пустая ссылка на бинарник Antigravity Unlocker')

  await killStaleAgProcesses()

  let buf: Buffer
  try {
    const res = await fetch(assetUrl, { headers: { 'User-Agent': REQUEST_HEADERS['User-Agent'] } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const ab = await res.arrayBuffer()
    buf = Buffer.from(ab)
  } catch (e) {
    throw new Error(`Не удалось скачать Antigravity Unlocker: ${e instanceof Error ? e.message : String(e)}`)
  }

  if (buf.length < 1024 * 1024) {
    throw new Error(`Загруженный файл Antigravity Unlocker слишком маленький (${buf.length} байт)`)
  }

  const dir = agUnlockerRuntimeDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const versionTag = expectedVersion ? expectedVersion.replace(/^v/i, '') : 'latest'
  const fileName = `AG_${versionTag}.exe`
  const dest = path.join(dir, fileName)
  writeFileSync(dest, buf)

  // Also copy to ProgramData\AGUnlocker\ag_dns.exe for the background scheduled task
  const programDataDir = process.env.ProgramData || 'C:\\ProgramData'
  const agProgramData = path.join(programDataDir, 'AGUnlocker')
  try {
    if (!existsSync(agProgramData)) mkdirSync(agProgramData, { recursive: true })
    const dstAgDns = path.join(agProgramData, 'ag_dns.exe')
    copyFileSync(dest, dstAgDns)
  } catch {
    // best-effort
  }

  const finalVersion = expectedVersion || undefined
  const cfg = await getAppConfig()
  const next = {
    ...(cfg.agUnlocker || {}),
    installedVersion: finalVersion ?? cfg.agUnlocker?.installedVersion,
    dismissedUpdateTag: undefined
  }
  await patchAppConfig({ agUnlocker: next })

  cache = null
  appLog('info', `Antigravity Unlocker обновлён до версии ${finalVersion ?? 'latest'} (${(buf.length / 1024 / 1024).toFixed(1)} МБ)`)
  return { installedVersion: finalVersion, sizeBytes: buf.length }
}

export async function dismissAgUpdate(tag: string): Promise<void> {
  if (!tag) return
  const cfg = await getAppConfig()
  const next = {
    ...(cfg.agUnlocker || {}),
    dismissedUpdateTag: tag
  }
  await patchAppConfig({ agUnlocker: next })
  if (cache) cache.data.dismissed = cache.data.latest === tag
}
