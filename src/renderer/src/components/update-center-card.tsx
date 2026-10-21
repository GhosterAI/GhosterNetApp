import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  RefreshCw,
  Download,
  ExternalLink,
  CheckCircle2,
  Sparkles,
  Loader2,
  ArrowUpCircle,
  Radio,
  Send,
  Globe2,
  Cpu,
  Layers
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Switch } from '@renderer/components/ui/switch'
import { Label } from '@renderer/components/ui/label'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import {
  appCheckUpdate,
  appInstallUpdate,
  zapretCheckUpdate,
  zapretInstallUpdate,
  tgwsCheckUpdate,
  tgwsInstallUpdate,
  dnsAiCheckUpdate,
  dnsAiInstallUpdate,
  agCheckUpdate,
  agInstallUpdate,
  type AppUpdateInfo,
  type ZapretUpdateInfo,
  type TgwsUpdateInfo,
  type DnsAiUpdateInfo,
  type AgUpdateInfo
} from '@renderer/utils/ipc'
import {
  POWER_ON_BANNER_STYLE,
  BUNDLED_TGWS_VERSION,
  BUNDLED_ZAPRET_VERSION,
  BUNDLED_AG_VERSION,
  BUNDLED_DNS_AI_VERSION
} from '@renderer/lib/utils'

interface ComponentUpdateItem {
  id: 'ghosternet' | 'zapret' | 'tgws' | 'dnsai' | 'ag'
  name: string
  subtitle: string
  icon: React.ComponentType<{ className?: string }>
  repoUrl: string
  installed: string
  latest?: string
  hasUpdate: boolean
  assetUrl?: string
  assetName?: string
  checking: boolean
  installing: boolean
  publishedAt?: string
}

export const UpdateCenterCard: React.FC = () => {
  const { appConfig, patchAppConfig } = useAppConfig()

  const [checkingAll, setCheckingAll] = useState(false)

  const [ghosternet, setGhosternet] = useState<AppUpdateInfo | null>(null)
  const [zapret, setZapret] = useState<ZapretUpdateInfo | null>(null)
  const [tgws, setTgws] = useState<TgwsUpdateInfo | null>(null)
  const [dnsAi, setDnsAi] = useState<DnsAiUpdateInfo | null>(null)
  const [ag, setAg] = useState<AgUpdateInfo | null>(null)

  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({})
  const [installingMap, setInstallingMap] = useState<Record<string, boolean>>({})

  const setItemChecking = (id: string, val: boolean): void => {
    setLoadingMap((prev) => ({ ...prev, [id]: val }))
  }

  const setItemInstalling = (id: string, val: boolean): void => {
    setInstallingMap((prev) => ({ ...prev, [id]: val }))
  }

  const checkComponent = async (id: string, force = true): Promise<void> => {
    setItemChecking(id, true)
    try {
      if (id === 'ghosternet') {
        const res = await appCheckUpdate(force)
        setGhosternet(res)
      } else if (id === 'zapret') {
        const res = await zapretCheckUpdate(force)
        setZapret(res)
      } else if (id === 'tgws') {
        const res = await tgwsCheckUpdate(force)
        setTgws(res)
      } else if (id === 'dnsai') {
        const res = await dnsAiCheckUpdate(force)
        setDnsAi(res)
      } else if (id === 'ag') {
        const res = await agCheckUpdate(force)
        setAg(res)
      }
    } catch (e) {
      toast.error(`Ошибка проверки ${id}`, {
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setItemChecking(id, false)
    }
  }

  const checkAll = async (force = true): Promise<void> => {
    setCheckingAll(true)
    try {
      await Promise.allSettled([
        checkComponent('ghosternet', force),
        checkComponent('zapret', force),
        checkComponent('tgws', force),
        checkComponent('dnsai', force),
        checkComponent('ag', force)
      ])
      toast.success('Проверка обновлений всех 5 компонентов завершена')
    } finally {
      setCheckingAll(false)
    }
  }

  useEffect(() => {
    void checkAll(false)
  }, [])

  const handleInstall = async (item: ComponentUpdateItem): Promise<void> => {
    if (!item.assetUrl) {
      toast.error('Ссылка на загрузку обновления недоступна')
      return
    }

    setItemInstalling(item.id, true)
    try {
      if (item.id === 'ghosternet') {
        toast.info('Скачивание обновления GhosterNet… приложение перезапустится', {
          style: POWER_ON_BANNER_STYLE
        })
        await appInstallUpdate(item.assetUrl, item.latest)
      } else if (item.id === 'zapret') {
        const res = await zapretInstallUpdate(item.assetUrl, item.latest)
        toast.success(`Zapret обновлён до v${res.installedVersion ?? item.latest}!`, {
          description: `Установлено стратегий: ${res.strategies}`,
          style: POWER_ON_BANNER_STYLE
        })
        await checkComponent('zapret', true)
      } else if (item.id === 'tgws') {
        const res = await tgwsInstallUpdate(item.assetUrl, item.latest)
        toast.success(`TgWsProxy обновлён до v${res.installedVersion ?? item.latest}!`, {
          description: `Размер: ${(res.sizeBytes / 1024 / 1024).toFixed(1)} МБ`,
          style: POWER_ON_BANNER_STYLE
        })
        await checkComponent('tgws', true)
      } else if (item.id === 'dnsai') {
        const res = await dnsAiInstallUpdate(item.assetUrl, item.latest)
        toast.success(`DNS-AI обновлён до v${res.installedVersion ?? item.latest}!`, {
          description: `Размер: ${(res.sizeBytes / 1024 / 1024).toFixed(1)} МБ`,
          style: POWER_ON_BANNER_STYLE
        })
        await checkComponent('dnsai', true)
      } else if (item.id === 'ag') {
        const res = await agInstallUpdate(item.assetUrl, item.latest)
        toast.success(`Antigravity Unlocker обновлён до v${res.installedVersion ?? item.latest}!`, {
          description: `Размер: ${(res.sizeBytes / 1024 / 1024).toFixed(1)} МБ`,
          style: POWER_ON_BANNER_STYLE
        })
        await checkComponent('ag', true)
      }
    } catch (e) {
      toast.error(`Не удалось установить обновление ${item.name}`, {
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setItemInstalling(item.id, false)
    }
  }

  const openUrl = (url: string): void => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const items: ComponentUpdateItem[] = [
    {
      id: 'ghosternet',
      name: 'GhosterNet (Приложение)',
      subtitle: 'Основная оболочка клиента GhosterNet и UI',
      icon: Sparkles,
      repoUrl: 'https://github.com/GhosterAI/GhosterNetApp/releases',
      installed: ghosternet?.installed ?? '3.1.0',
      latest: ghosternet?.latest,
      hasUpdate: Boolean(ghosternet?.hasUpdate),
      assetUrl: ghosternet?.assetUrl,
      assetName: ghosternet?.assetName,
      checking: Boolean(loadingMap['ghosternet']),
      installing: Boolean(installingMap['ghosternet']),
      publishedAt: ghosternet?.publishedAt
    },
    {
      id: 'zapret',
      name: 'Zapret DPI Bypass',
      subtitle: 'Движок winws.exe, наборы стратегий и списки блокировок',
      icon: Radio,
      repoUrl: 'https://github.com/Flowseal/zapret-discord-youtube/releases',
      installed: zapret?.installed ?? appConfig?.zapret?.installedVersion ?? BUNDLED_ZAPRET_VERSION,
      latest: zapret?.latest,
      hasUpdate: Boolean(zapret?.hasUpdate),
      assetUrl: zapret?.assetUrl,
      assetName: zapret?.assetName,
      checking: Boolean(loadingMap['zapret']),
      installing: Boolean(installingMap['zapret']),
      publishedAt: zapret?.publishedAt
    },
    {
      id: 'tgws',
      name: 'Telegram WS Proxy',
      subtitle: 'Бинарник MTProto TgWsProxy поверх WebSocket и Cloudflare',
      icon: Send,
      repoUrl: 'https://github.com/Flowseal/tg-ws-proxy/releases',
      installed: tgws?.installed ?? appConfig?.tgws?.installedVersion ?? BUNDLED_TGWS_VERSION,
      latest: tgws?.latest,
      hasUpdate: Boolean(tgws?.hasUpdate),
      assetUrl: tgws?.assetUrl,
      assetName: tgws?.assetName,
      checking: Boolean(loadingMap['tgws']),
      installing: Boolean(installingMap['tgws']),
      publishedAt: tgws?.publishedAt
    },
    {
      id: 'dnsai',
      name: 'DNS-AI',
      subtitle: 'Служба DNS-AI.exe, локальный DoH резолвер для нейросетей',
      icon: Globe2,
      repoUrl: 'https://github.com/confeden/DNS-AI/releases',
      installed: dnsAi?.installed ?? appConfig?.dnsAi?.installedVersion ?? BUNDLED_DNS_AI_VERSION,
      latest: dnsAi?.latest,
      hasUpdate: Boolean(dnsAi?.hasUpdate),
      assetUrl: dnsAi?.assetUrl,
      assetName: dnsAi?.assetName,
      checking: Boolean(loadingMap['dnsai']),
      installing: Boolean(installingMap['dnsai']),
      publishedAt: dnsAi?.publishedAt
    },
    {
      id: 'ag',
      name: 'Antigravity Unlocker',
      subtitle: 'Движок AG_*.exe, обход ограничений Google Antigravity IDE',
      icon: Cpu,
      repoUrl: 'https://github.com/confeden/Antigravity/releases',
      installed: ag?.installed ?? appConfig?.agUnlocker?.installedVersion ?? BUNDLED_AG_VERSION,
      latest: ag?.latest,
      hasUpdate: Boolean(ag?.hasUpdate),
      assetUrl: ag?.assetUrl,
      assetName: ag?.assetName,
      checking: Boolean(loadingMap['ag']),
      installing: Boolean(installingMap['ag']),
      publishedAt: ag?.publishedAt
    }
  ]

  const totalUpdatesCount = items.filter((i) => i.hasUpdate).length

  return (
    <Card className="border-border/80">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Layers className="size-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                Центр обновлений GhosterNet
                {totalUpdatesCount > 0 && (
                  <span className="rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 text-xs font-medium">
                    Доступно: {totalUpdatesCount}
                  </span>
                )}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Автоматическая проверка и обновление всех 5 сетевых компонентов из GitHub Releases
              </p>
            </div>
          </div>

          <Button
            size="sm"
            variant="outline"
            disabled={checkingAll}
            onClick={() => void checkAll(true)}
            className="gap-1.5"
          >
            {checkingAll ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            <span>Проверить все</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-border/50 bg-accent/20 px-3.5 py-2.5">
          <div className="flex flex-col">
            <Label className="text-sm font-medium">Автоматически проверять обновления при запуске</Label>
            <span className="text-xs text-muted-foreground">
              Фоновая проверка новых релизов Zapret, TgWsProxy, DNS-AI, Antigravity и GhosterNet
            </span>
          </div>
          <Switch
            checked={appConfig?.autoCheckUpdate ?? true}
            onCheckedChange={(v) => patchAppConfig({ autoCheckUpdate: v })}
          />
        </div>

        <div className="divide-y divide-border/60 rounded-xl border border-border/70 overflow-hidden">
          {items.map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-card/60 hover:bg-accent/20 transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`mt-0.5 size-9 rounded-lg flex items-center justify-center shrink-0 border ${
                      item.hasUpdate
                        ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                        : 'bg-accent/40 border-border text-muted-foreground'
                    }`}
                  >
                    <Icon className="size-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm text-foreground">{item.name}</span>
                      <span className="text-xs font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                        v{item.installed}
                      </span>

                      {item.hasUpdate ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded">
                          <ArrowUpCircle className="size-3" />
                          Доступна v{item.latest}
                        </span>
                      ) : item.checking ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Loader2 className="size-3 animate-spin" />
                          Проверка…
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400/90 font-medium">
                          <CheckCircle2 className="size-3" />
                          Актуально
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {item.subtitle}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                  {item.hasUpdate && (
                    <Button
                      size="sm"
                      variant="default"
                      disabled={item.installing || item.checking || !item.assetUrl}
                      onClick={() => void handleInstall(item)}
                      className="gap-1.5 h-8 px-3 text-xs bg-amber-500 text-black hover:bg-amber-400"
                    >
                      {item.installing ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Download className="size-3.5" />
                      )}
                      <span>Обновить</span>
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    disabled={item.checking || item.installing}
                    onClick={() => void checkComponent(item.id, true)}
                    className="h-8 px-2.5 text-xs gap-1"
                    title="Проверить обновление"
                  >
                    {item.checking ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <RefreshCw className="size-3" />
                    )}
                    <span className="hidden md:inline">Проверить</span>
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openUrl(item.repoUrl)}
                    className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                    title="Открыть репозиторий на GitHub"
                  >
                    <ExternalLink className="size-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

export default UpdateCenterCard
