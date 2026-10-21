import { BrowserWindow } from 'electron'

let monitorInterval: ReturnType<typeof setInterval> | null = null
let lastBytesRecv = 0
let lastBytesSent = 0
let lastCheckTime = Date.now()

function broadcast(channel: string, ...args: unknown[]): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, ...args)
  }
}

/**
 * Traffic Monitor streaming real-time download and upload bitrate to the Live HUD
 */
export function startTrafficMonitor(intervalMs = 1000): void {
  if (monitorInterval) clearInterval(monitorInterval)

  // Simulation/measurement loop: inspects sing-box / network activity
  monitorInterval = setInterval(async () => {
    try {
      const now = Date.now()
      const deltaSec = Math.max(0.5, (now - lastCheckTime) / 1000)

      // Calculate bytes delta (can be populated by sing-box API or synthetic connection tracker)
      const downSpeed = Math.max(0, Math.round((lastBytesRecv / deltaSec)))
      const upSpeed = Math.max(0, Math.round((lastBytesSent / deltaSec)))

      broadcast('traffic:tick', {
        downSpeedBps: downSpeed,
        upSpeedBps: upSpeed,
        timestamp: now
      })

      // Reset window counter
      lastBytesRecv = 0
      lastBytesSent = 0
      lastCheckTime = now
    } catch {
      // ignore
    }
  }, intervalMs)
}

export function recordTrafficBytes(recv: number, sent: number): void {
  lastBytesRecv += recv
  lastBytesSent += sent
}

export function stopTrafficMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval)
    monitorInterval = null
  }
}
