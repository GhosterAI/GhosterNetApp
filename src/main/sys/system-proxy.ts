import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/**
 * Configure Windows user Internet Settings (WinINet) to route via HTTP proxy
 */
export async function setWindowsSystemProxy(host: string, port: number): Promise<void> {
  if (process.platform !== 'win32') return
  const proxy = `${host}:${port}`
  try {
    await execFileAsync('reg.exe', [
      'add',
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
      '/v',
      'ProxyServer',
      '/t',
      'REG_SZ',
      '/d',
      proxy,
      '/f'
    ])
    await execFileAsync('reg.exe', [
      'add',
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
      '/v',
      'ProxyEnable',
      '/t',
      'REG_DWORD',
      '/d',
      '1',
      '/f'
    ])
  } catch (err) {
    console.error('Failed to set Windows system proxy:', err)
  }
}

/**
 * Disable Windows user Internet Settings HTTP proxy
 */
export async function disableWindowsSystemProxy(): Promise<void> {
  if (process.platform !== 'win32') return
  try {
    await execFileAsync('reg.exe', [
      'add',
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
      '/v',
      'ProxyEnable',
      '/t',
      'REG_DWORD',
      '/d',
      '0',
      '/f'
    ])
  } catch (err) {
    console.error('Failed to disable Windows system proxy:', err)
  }
}
