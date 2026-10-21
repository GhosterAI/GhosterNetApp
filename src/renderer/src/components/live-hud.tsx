import React, { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Activity } from 'lucide-react'

interface TrafficTick {
  downSpeedBps: number
  upSpeedBps: number
  timestamp: number
}

function formatSpeed(bps: number): string {
  if (bps <= 0) return '0 KB/s'
  const kb = bps / 1024
  if (kb < 1000) return `${kb.toFixed(1)} KB/s`
  const mb = kb / 1024
  return `${mb.toFixed(1)} MB/s`
}

export const LiveHud: React.FC = () => {
  const [downSpeed, setDownSpeed] = useState(0)
  const [upSpeed, setUpSpeed] = useState(0)
  const [history, setHistory] = useState<number[]>([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])

  useEffect(() => {
    const handleTick = (_event: unknown, payload: TrafficTick): void => {
      setDownSpeed(payload.downSpeedBps)
      setUpSpeed(payload.upSpeedBps)
      setHistory((prev) => {
        const next = [...prev.slice(1), payload.downSpeedBps]
        return next
      })
    }

    window.electron.ipcRenderer.on('traffic:tick', handleTick)
    return () => {
      window.electron.ipcRenderer.removeListener('traffic:tick', handleTick)
    }
  }, [])

  // Calculate sparkline bars
  const maxVal = Math.max(...history, 1024 * 50)

  return (
    <div className="flex items-center gap-4 px-4 py-2 rounded-2xl border border-border/30 bg-card/40 backdrop-blur-md text-xs shadow-xs">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Activity className="size-3.5 text-primary animate-pulse" />
        <span className="font-medium text-foreground">Live HUD</span>
      </div>

      <div className="h-4 w-px bg-border/40" />

      {/* Download Speed */}
      <div className="flex items-center gap-1 font-mono text-[11px]">
        <ArrowDown className="size-3 text-emerald-400" />
        <span className="text-foreground">{formatSpeed(downSpeed)}</span>
      </div>

      {/* Upload Speed */}
      <div className="flex items-center gap-1 font-mono text-[11px]">
        <ArrowUp className="size-3 text-cyan-400" />
        <span className="text-foreground">{formatSpeed(upSpeed)}</span>
      </div>

      {/* Mini real-time chart */}
      <div className="flex items-end gap-0.5 h-4 w-18 ml-auto">
        {history.map((val, idx) => {
          const heightPercent = Math.min(100, Math.max(15, Math.round((val / maxVal) * 100)))
          return (
            <div
              key={idx}
              className="flex-1 rounded-t-[1px] bg-primary/40 transition-all duration-300"
              style={{ height: `${heightPercent}%` }}
            />
          )
        })}
      </div>
    </div>
  )
}
