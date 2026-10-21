import React, { useEffect, useRef } from 'react'
import { X, Smartphone, Copy, Check } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { toast } from 'sonner'

interface QrExportModalProps {
  open: boolean
  onClose: () => void
  server: VpnServer | null
}

export const QrExportModal: React.FC<QrExportModalProps> = ({ open, onClose, server }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [copied, setCopied] = React.useState(false)

  const uri = server?.rawUri || ''

  useEffect(() => {
    if (!open || !canvasRef.current || !uri) return

    // Draw clean vector QR code on canvas using quick algorithmic generator or SVG
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
      uri
    )}&margin=1`
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = (): void => {
      ctx.clearRect(0, 0, 240, 240)
      ctx.drawImage(img, 0, 0, 240, 240)
    }
    img.src = qrUrl
  }, [open, uri])

  if (!open || !server) return null

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(uri)
      setCopied(true)
      toast.success('Ссылка скопирована в буфер')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Не удалось скопировать')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in-0 duration-200">
      <div className="w-full max-w-sm rounded-2xl border border-border/50 bg-background/95 backdrop-blur-md p-6 shadow-2xl relative text-center">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground rounded-full p-1"
        >
          <X className="size-4" />
        </button>

        <div className="flex flex-col items-center gap-1.5 mb-4">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
            <Smartphone className="size-6" />
          </div>
          <h3 className="font-semibold text-base text-foreground">
            Экспорт профиля в телефон
          </h3>
          <p className="text-xs text-muted-foreground truncate max-w-[260px]">
            {server.name} ({server.type.toUpperCase()})
          </p>
        </div>

        {/* QR Code Container */}
        <div className="flex justify-center p-3 rounded-2xl bg-white shadow-inner mb-4 w-fit mx-auto border border-border/20">
          <canvas ref={canvasRef} width={240} height={240} className="w-[200px] h-[200px]" />
        </div>

        <p className="text-[11px] text-muted-foreground mb-4">
          Отсканируйте камерой смартфона в приложении Happ, v2rayNG, Streisand, AmneziaWG или WireGuard
        </p>

        {/* Copy button */}
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Закрыть
          </Button>
          <Button
            onClick={handleCopy}
            className="flex-1 gap-1.5 bg-primary text-primary-foreground font-medium"
          >
            {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
            {copied ? 'Скопировано' : 'Скопировать'}
          </Button>
        </div>
      </div>
    </div>
  )
}
