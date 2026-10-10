import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs'
import { spawn } from 'child_process'
import path from 'path'
import { app } from 'electron'
import { modsDir, resourcesDir } from '../utils/dirs'
import { getAppConfig, patchAppConfig } from '../config'
import { appLog } from '../utils/app-logger'

interface ModJsonManifest {
  id?: string
  name?: string
  description?: string
  author?: string
  version?: string
  source_url?: string
}

function scanModDirectory(dirPath: string, isBundled: boolean, enabledIds: Set<string>): InstalledMod | null {
  if (!existsSync(dirPath)) return null
  try {
    const st = statSync(dirPath)
    if (!st.isDirectory()) return null
  } catch {
    return null
  }

  const folderName = path.basename(dirPath)
  let manifest: ModJsonManifest = {}
  const modJsonPath = path.join(dirPath, 'mod.json')
  if (existsSync(modJsonPath)) {
    try {
      manifest = JSON.parse(readFileSync(modJsonPath, 'utf8')) as ModJsonManifest
    } catch {
      /* noop */
    }
  }

  const id = (manifest.id || folderName).trim()
  const name = (manifest.name || folderName).trim()
  const description = (
    manifest.description ||
    (isBundled
      ? 'Встроенный пакет расширенных стратегий и списков'
      : 'Пользовательский пакет стратегий и списков')
  ).trim()
  const version = (manifest.version || '1.0.0').trim()
  const author = (manifest.author || (isBundled ? 'GhosterAI' : 'User')).trim()

  const strategies: string[] = []
  try {
    for (const f of readdirSync(dirPath)) {
      if (f.toLowerCase().endsWith('.bat') && !f.toLowerCase().startsWith('service')) {
        strategies.push(f)
      }
    }
  } catch {
    /* noop */
  }

  return {
    id,
    name,
    version,
    description,
    author,
    enabled: enabledIds.has(id),
    sourceType: 'zapret_bundle',
    path: dirPath,
    strategies: strategies.sort()
  }
}

export async function listInstalledMods(): Promise<InstalledMod[]> {
  const cfg = await getAppConfig()
  const enabledIds = new Set<string>(cfg.zapret?.enabledMods ?? [])
  const order = cfg.zapret?.modOrder ?? []

  const results: InstalledMod[] = []
  const seenIds = new Set<string>()

  // 1. Bundled mods in resources/mods/
  const bundledRoot = path.join(resourcesDir(), 'mods')
  if (existsSync(bundledRoot)) {
    try {
      for (const entry of readdirSync(bundledRoot)) {
        const full = path.join(bundledRoot, entry)
        const mod = scanModDirectory(full, true, enabledIds)
        if (mod && !seenIds.has(mod.id)) {
          seenIds.add(mod.id)
          results.push(mod)
        }
      }
    } catch {
      /* noop */
    }
  }

  // 2. User mods in dataDir()/mods/
  const userRoot = modsDir()
  if (existsSync(userRoot)) {
    try {
      for (const entry of readdirSync(userRoot)) {
        const full = path.join(userRoot, entry)
        const mod = scanModDirectory(full, false, enabledIds)
        if (mod && !seenIds.has(mod.id)) {
          seenIds.add(mod.id)
          results.push(mod)
        }
      }
    } catch {
      /* noop */
    }
  }

  // Sort according to modOrder if specified
  if (order.length > 0) {
    const rank = new Map(order.map((id, idx) => [id, idx]))
    results.sort((a, b) => {
      const ra = rank.get(a.id) ?? 9999
      const rb = rank.get(b.id) ?? 9999
      return ra - rb || a.name.localeCompare(b.name)
    })
  }

  return results
}

export async function toggleMod(modId: string, enabled: boolean): Promise<InstalledMod[]> {
  const cfg = await getAppConfig()
  const current = new Set<string>(cfg.zapret?.enabledMods ?? [])
  if (enabled) current.add(modId)
  else current.delete(modId)

  await patchAppConfig({
    zapret: {
      ...(cfg.zapret as ZapretConfig),
      enabledMods: Array.from(current)
    }
  })
  appLog('info', `Мод "${modId}" ${enabled ? 'включён' : 'выключен'}`)
  return listInstalledMods()
}

export async function reorderMods(modOrder: string[]): Promise<InstalledMod[]> {
  const cfg = await getAppConfig()
  await patchAppConfig({
    zapret: {
      ...(cfg.zapret as ZapretConfig),
      modOrder
    }
  })
  return listInstalledMods()
}

export async function removeMod(modId: string): Promise<InstalledMod[]> {
  const bundledPath = path.join(resourcesDir(), 'mods', modId)
  if (existsSync(bundledPath)) {
    throw new Error('Встроенный мод нельзя удалить — его можно только отключить.')
  }
  const userPath = path.join(modsDir(), modId)
  if (existsSync(userPath)) {
    rmSync(userPath, { recursive: true, force: true })
  }
  const cfg = await getAppConfig()
  const enabledMods = (cfg.zapret?.enabledMods ?? []).filter((id) => id !== modId)
  const modOrder = (cfg.zapret?.modOrder ?? []).filter((id) => id !== modId)
  await patchAppConfig({
    zapret: {
      ...(cfg.zapret as ZapretConfig),
      enabledMods,
      modOrder
    }
  })
  appLog('info', `Пользовательский мод "${modId}" удалён`)
  return listInstalledMods()
}

export async function importModFromZip(
  zipBytes: Uint8Array,
  fileName = 'custom-mod.zip'
): Promise<InstalledMod[]> {
  if (!zipBytes || zipBytes.byteLength < 64) {
    throw new Error('Пустой или повреждённый ZIP-архив мода')
  }
  const baseId = path
    .basename(fileName, path.extname(fileName))
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || `mod-${Date.now()}`

  const tempDir = path.join(app.getPath('temp'), `ghosternet-mod-${Date.now()}`)
  const zipPath = path.join(tempDir, 'mod.zip')
  const extractDir = path.join(tempDir, 'extracted')
  mkdirSync(extractDir, { recursive: true })
  writeFileSync(zipPath, Buffer.from(zipBytes))

  try {
    await new Promise<void>((resolve, reject) => {
      const ps = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`
        ],
        { windowsHide: true }
      )
      let stderr = ''
      ps.stderr?.on('data', (b) => { stderr += b.toString() })
      ps.on('exit', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`Expand-Archive error (${code}): ${stderr.trim()}`))
      })
      ps.on('error', reject)
    })

    // Unwrap single top-level folder if present
    let srcRoot = extractDir
    const topEntries = readdirSync(extractDir)
    if (topEntries.length === 1) {
      const candidate = path.join(extractDir, topEntries[0])
      if (statSync(candidate).isDirectory()) srcRoot = candidate
    }

    // Read mod.json if present to get canonical id
    let modId = baseId
    const modJsonFile = path.join(srcRoot, 'mod.json')
    if (existsSync(modJsonFile)) {
      try {
        const parsed = JSON.parse(readFileSync(modJsonFile, 'utf8')) as ModJsonManifest
        if (parsed.id) modId = parsed.id.replace(/[^a-zA-Z0-9_-]/g, '-')
      } catch {
        /* noop */
      }
    } else {
      const manifest: ModJsonManifest = {
        id: modId,
        name: path.basename(fileName, path.extname(fileName)),
        description: 'Импортированный пользовательский мод',
        author: 'User',
        version: '1.0.0'
      }
      writeFileSync(modJsonFile, JSON.stringify(manifest, null, 2), 'utf8')
    }

    // Patch any .bat files inside srcRoot so they don't spawn a separate cmd window
    for (const f of readdirSync(srcRoot)) {
      if (f.toLowerCase().endsWith('.bat')) {
        const bp = path.join(srcRoot, f)
        try {
          const raw = readFileSync(bp, 'utf8')
          const patched = raw.replace(/start\s+"[^"]*"\s+\/min\s+/gi, '')
          if (patched !== raw) writeFileSync(bp, patched, 'utf8')
        } catch {
          /* noop */
        }
      }
    }

    const destDir = path.join(modsDir(), modId)
    if (existsSync(destDir)) {
      rmSync(destDir, { recursive: true, force: true })
    }
    mkdirSync(path.dirname(destDir), { recursive: true })

    // Copy recursively
    const copyRecursive = (src: string, dst: string): void => {
      mkdirSync(dst, { recursive: true })
      for (const item of readdirSync(src)) {
        const s = path.join(src, item)
        const d = path.join(dst, item)
        if (statSync(s).isDirectory()) copyRecursive(s, d)
        else writeFileSync(d, readFileSync(s))
      }
    }
    copyRecursive(srcRoot, destDir)

    // Auto-enable imported mod
    const cfg = await getAppConfig()
    const enabled = new Set<string>(cfg.zapret?.enabledMods ?? [])
    enabled.add(modId)
    await patchAppConfig({
      zapret: {
        ...(cfg.zapret as ZapretConfig),
        enabledMods: Array.from(enabled)
      }
    })
    appLog('info', `Мод "${modId}" успешно импортирован и включён`)
  } finally {
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {
      /* noop */
    }
  }

  return listInstalledMods()
}
