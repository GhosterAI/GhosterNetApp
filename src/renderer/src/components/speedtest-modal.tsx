import React, { useState } from 'react'
import {
  Gauge,
  Play,
  RotateCw,
  X,
  Activity,
  Wifi
} from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { speedtestRun, type SpeedtestProgress } from '@renderer/utils/ipc'
import { toast } from 'sonner'

interface SpeedtestModalProps {
  open: boolean
  onClose: () => void
}

export const SpeedtestModal: React.FC<SpeedtestModalProps> = ({ open, onClose }) => {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<SpeedtestProgress | null>(null)
  const [result, setResult] = useState<SpeedtestResult | null>(null)

  if (!open) return null

  const handleStart = async (): Promise<void> => {
    setRunning(true)
    setResult(null)
    setProgress({ phase: 'ping', progressPercent: 10 })

    const handler = (_e: unknown, p: SpeedtestProgress): void => {
      setProgress(p)
      if (p.result) setResult(p.result)
    }

    window.electron.ipcRenderer.on('speedtest:progress', handler)

    try {
      const res = await speedtestRun()
      setResult(res)
    } catch (e) {
      toast.error('Ошибка замера скорости', {
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      window.electron.ipcRenderer.removeListener('speedtest:progress', handler)
      setRunning(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in-0 duration-200">
      <div className="w-full max-w-md rounded-2xl border border-border/50 bg-background/95 backdrop-blur-md p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground rounded-full p-1"
        >
          <X className="size-4" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
            <Gauge className="size-6" />
          </div>
          <div>
            <h3 className="font-semibold text-lg text-foreground">Замер скорости (Speedtest)</h3>
            <p className="text-xs text-muted-foreground">
              Тестирование задержки и пропускной способности сети
            </p>
          </div>
        </div>

        {/* Speedometer display */}
        <div className="flex flex-col items-center justify-center my-6 py-6 rounded-2xl bg-muted/20 border border-border/30">
          <div className="text-5xl font-mono font-bold tracking-tight text-foreground mb-1">
            {result
              ? result.downloadMbps
              : progress?.currentSpeedMbps !== undefined
              ? progress.currentSpeedMbps
              : '0.0'}
          </div>
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            Мбит/с (Download)
          </span>

          {/* Progress bar */}
          {running && (
            <div className="w-48 h-1.5 bg-muted rounded-full mt-4 overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300 rounded-full"
                style={{ width: `${progress?.progressPercent ?? 0}%` }}
              />
            </div>
          )}
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="p-3 rounded-xl border border-border/30 bg-card/40 flex items-center gap-3">
            <Wifi className="size-4 text-emerald-400" />
            <div>
              <div className="text-[11px] text-muted-foreground">Пинг (Ping)</div>
              <div className="text-sm font-mono font-semibold text-foreground">
                {result?.pingMs ?? progress?.pingMs ?? '--'} ms
              </div>
            </div>
          </div>
          <div className="p-3 rounded-xl border border-border/30 bg-card/40 flex items-center gap-3">
            <Activity className="size-4 text-cyan-400" />
            <div>
              <div className="text-[11px] text-muted-foreground">Джиттер (Jitter)</div>
              <div className="text-sm font-mono font-semibold text-foreground">
                {result?.jitterMs ?? progress?.jitterMs ?? '--'} ms
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={running}>
            Закрыть
          </Button>
          <Button
            onClick={handleStart}
            disabled={running}
            className="gap-2 bg-primary text-primary-foreground font-medium"
          >
            {running ? (
              <>
                <RotateCw className="size-4 animate-spin" />
                Тестирование...
              </>
            ) : (
              <>
                <Play className="size-4 fill-current" />
                Начать тест
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
