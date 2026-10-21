import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import {
  Sparkles,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Zap
} from 'lucide-react'
import { toast } from 'sonner'
import {
  dnsAiCheckServices,
  dnsAiFixGemini,
  type DnsAiServiceCheckResult
} from '@renderer/utils/ipc'

export const AiDashboardWidget: React.FC = () => {
  const [services, setServices] = useState<DnsAiServiceCheckResult[]>([])
  const [loading, setLoading] = useState(false)
  const [fixing, setFixing] = useState(false)

  const check = async (): Promise<void> => {
    setLoading(true)
    try {
      const res = await dnsAiCheckServices()
      setServices(res)
    } catch (e) {
      toast.error('Не удалось проверить статус нейросетей', {
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setLoading(false)
    }
  }

  const handleFixGemini = async (): Promise<void> => {
    setFixing(true)
    try {
      await dnsAiFixGemini()
      toast.success('Применён 1-Click фикс для Gemini & Google AI Studio')
      await check()
    } catch (e) {
      toast.error('Ошибка применения фикса', {
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setFixing(false)
    }
  }

  useEffect(() => {
    check()
  }, [])

  const allOk = services.length > 0 && services.every((s) => s.httpOk)

  return (
    <Card className="border-border/40 bg-card/50 backdrop-blur-md overflow-hidden">
      <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between border-b border-border/30">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
            <Sparkles className="size-4" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              AI Dashboard — Центр управления ИИ
              {services.length > 0 && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-normal ${
                    allOk
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  }`}
                >
                  {allOk ? 'Все ИИ активны' : 'Есть ограничения'}
                </span>
              )}
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">
              Статус доступности и мгновенный обход ограничений для нейросетей
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={handleFixGemini}
            disabled={fixing}
            className="h-7 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/10"
          >
            <Zap className={`size-3 ${fixing ? 'animate-spin' : ''}`} />
            1-Click AI Fix
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={check}
            disabled={loading}
            className="size-7 text-muted-foreground hover:text-foreground"
            title="Обновить статус"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-3">
        {loading && services.length === 0 ? (
          <div className="flex items-center justify-center py-6 text-xs text-muted-foreground gap-2">
            <RefreshCw className="size-3.5 animate-spin" />
            Проверка доступности AI-сервисов...
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {services.map((s) => {
              const ok = s.httpOk
              return (
                <div
                  key={s.domain}
                  className="p-2.5 rounded-xl border border-border/30 bg-background/40 hover:bg-muted/30 transition-colors flex flex-col justify-between"
                >
                  <div className="flex items-start justify-between gap-1 mb-1.5">
                    <span className="text-xs font-medium text-foreground truncate" title={s.name}>
                      {s.name}
                    </span>
                    {ok ? (
                      <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="size-3.5 text-rose-400 shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="truncate max-w-[110px]">{s.domain}</span>
                    <span
                      className={`font-mono text-[10px] px-1.5 py-0.2 rounded ${
                        ok ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'
                      }`}
                    >
                      {ok ? `${s.latencyMs}ms` : 'Блок'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
