import { is } from '@electron-toolkit/utils'
import { existsSync, mkdirSync } from 'fs'
import { app } from 'electron'
import path from 'path'

export const homeDir = app.getPath('home')

export function isPortable(): boolean {
  return existsSync(path.join(exeDir(), 'PORTABLE'))
}

export function dataDir(): string {
  if (isPortable()) {
    return path.join(exeDir(), 'data')
  }
  return app.getPath('userData')
}

export function taskDir(): string {
  const dir = path.join(app.getPath('userData'), 'tasks')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

export function exeDir(): string {
  return path.dirname(exePath())
}

export function exePath(): string {
  return app.getPath('exe')
}

export function resourcesDir(): string {
  if (is.dev) {
    const root = path.join(__dirname, '../..')
    return path.join(root, 'resources')
  }
  if (app.getAppPath().endsWith('asar')) {
    return process.resourcesPath
  }
  return path.join(app.getAppPath(), 'resources')
}

export function resourcesFilesDir(): string {
  return path.join(resourcesDir(), 'files')
}

export function themesDir(): string {
  return path.join(dataDir(), 'themes')
}

export function modsDir(): string {
  return path.join(dataDir(), 'mods')
}

export function userOverridesPath(): string {
  return path.join(dataDir(), 'file-overrides.json')
}

export function appConfigPath(): string {
  return path.join(dataDir(), 'config.yaml')
}

export function logDir(): string {
  return path.join(dataDir(), 'logs')
}

export function logPath(): string {
  const date = new Date()
  const name = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
  return path.join(logDir(), `${name}.log`)
}

export function runtimeDir(): string {
  return path.join(dataDir(), 'runtime')
}

export function tgwsRuntimeDir(): string {
  return path.join(runtimeDir(), 'tgws')
}

export function tgwsBinaryPath(): string {
  const rt = path.join(tgwsRuntimeDir(), 'TgWsProxy_windows.exe')
  if (existsSync(rt)) return rt
  return path.join(resourcesDir(), 'tgws', 'TgWsProxy_windows.exe')
}

export function tgwsCfDomainsPath(): string {
  const rt = path.join(tgwsRuntimeDir(), 'cfproxy-domains.txt')
  if (existsSync(rt)) return rt
  return path.join(resourcesDir(), 'tgws', 'cfproxy-domains.txt')
}

export function zapretRuntimeDir(): string {
  return path.join(runtimeDir(), 'zapret')
}

export function zapretBundleDir(): string {
  const rt = zapretRuntimeDir()
  if (existsSync(path.join(rt, 'general.bat'))) return rt
  return path.join(resourcesDir(), 'zapret')
}

export function zapretBinaryPath(): string {
  return path.join(zapretBundleDir(), 'bin', 'winws.exe')
}