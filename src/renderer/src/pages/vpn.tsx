import React, { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Shield,
  ShieldCheck,
  Globe,
  Zap,
  RefreshCw,
  Trash2,
  Clipboard,
  Plus,
  Search,
  Check,
  Server,
  Layers,
  RotateCw,
  Laptop,
  CheckCircle2,
  FileText
} from 'lucide-react'
import BasePage from '@renderer/components/base/base-page'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Switch } from '@renderer/components/ui/switch'
import { Label } from '@renderer/components/ui/label'
import { Spinner } from '@renderer/components/ui/spinner'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useVpnStore } from '@renderer/store/vpn-store'
import { cn, POWER_ON_BANNER_STYLE, POWER_OFF_BANNER_STYLE } from '@renderer/lib/utils'
import {
  vpnStart,
  vpnStop,
  vpnRestart,
  vpnAddSubscription,
  vpnUpdateSubscription,
  vpnDeleteSubscription,
  vpnSelectServer,
  vpnTestLatency,
  vpnSetRoutingMode,
  vpnSetTunMode
} from '@renderer/utils/ipc'

function getCountryFlag(code?: string): string {
  if (!code || code.length !== 2) return '🌐'
  try {
    const upper = code.toUpperCase()
    const first = upper.codePointAt(0)! - 0x41 + 0x1f1e6
    const second = upper.codePointAt(1)! - 0x41 + 0x1f1e6
    return String.fromCodePoint(first, second)
  } catch {
    return '🌐'
  }
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function formatDate(ts?: number): string {
  if (!ts) return ''
  const ms = ts > 1e11 ? ts : ts * 1000
  const d = new Date(ms)
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function getLatencyBadgeClass(ms?: number | null): string {
  if (ms === null || ms === undefined || ms < 0) {
    return 'bg-muted/40 text-muted-foreground border-border/40'
  }
  if (ms < 100) {
    return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 font-medium'
  }
  if (ms < 200) {
    return 'bg-amber-500/15 text-amber-400 border-amber-500/30 font-medium'
  }
  return 'bg-rose-500/15 text-rose-400 border-rose-500/30 font-medium'
}

const ROUTING_MODES: Array<{
  id: VpnRoutingMode
  title: string
  subtitle: string
  badge: string
}> = [
  {
    id: 'bypass-ru',
    title: 'Умный обход (РФ напрямую)',
    subtitle: 'Российские сайты и сервисы открываются напрямую на полной скорости, остальное через VPN',
    badge: 'Рекомендуется'
  },
  {
    id: 'global',
    title: 'Полный туннель (Global)',
    subtitle: 'Весь сетевой трафик компьютера шифруется и направляется через выбранный VPN сервер',
    badge: '100% защита'
  },
  {
    id: 'proxy-only',
    title: 'Только локальный прокси',
    subtitle: 'Без создания TUN-адаптера. Локальный HTTP (2080) и SOCKS5 (2081) прокси для браузера',
    badge: 'Для браузера'
  }
]

const VpnPage: React.FC = () => {
  const { appConfig, mutateAppConfig } = useAppConfig()
  const vpnStatus = useVpnStore((s) => s.status)
  const isTestingLatency = useVpnStore((s) => s.isTestingLatency)
  const setIsTestingLatency = useVpnStore((s) => s.setIsTestingLatency)

  const vpnCfg = appConfig?.vpn
  const servers = vpnCfg?.servers ?? []
  const subscriptions = vpnCfg?.subscriptions ?? []
  const selectedServerId = vpnCfg?.selectedServerId
  const routingMode = vpnCfg?.routingMode ?? 'bypass-ru'
  const tunMode = vpnCfg?.tunMode ?? true

  const [inputUrl, setInputUrl] = useState('')
  const [addingSub, setAddingSub] = useState(false)
  const [refreshingSubId, setRefreshingSubId] = useState<string | null>(null)
  const [searchFilter, setSearchFilter] = useState('')
  const [isSwitching, setIsSwitching] = useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (event): Promise<void> => {
      const content = event.target?.result as string
      if (content) {
        setAddingSub(true)
        try {
          const res = await vpnAddSubscription(content)
          toast.success(`Файл "${file.name}" импортирован!`, {
            description: `Добавлено серверов: ${res.servers.length}`
          })
          mutateAppConfig()
        } catch (err) {
          toast.error('Не удалось прочитать .conf файл', {
            description: err instanceof Error ? err.message : String(err)
          })
        } finally {
          setAddingSub(false)
        }
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const isConnected = vpnStatus.state === 'running'
  const isStarting = vpnStatus.state === 'starting'
  const isStopping = vpnStatus.state === 'stopping'
  const isBusy = isStarting || isStopping || isSwitching

  const activeServer =
    vpnStatus.activeServer ||
    servers.find((s) => s.id === selectedServerId) ||
    servers[0]

  // Filtered servers
  const filteredServers = useMemo(() => {
    if (!searchFilter.trim()) return servers
    const q = searchFilter.toLowerCase().trim()
    return servers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.server.toLowerCase().includes(q) ||
        (s.countryCode && s.countryCode.toLowerCase().includes(q)) ||
        s.type.toLowerCase().includes(q)
    )
  }, [servers, searchFilter])

  // Connect / Disconnect toggle
  const handleToggleConnect = async (): Promise<void> => {
    if (isBusy) return
    setIsSwitching(true)
    try {
      if (isConnected) {
        await vpnStop()
        toast.info('VPN отключён', { style: POWER_OFF_BANNER_STYLE })
      } else {
        await vpnStart()
        toast.success(`VPN подключён: ${activeServer?.name ?? 'Сервер'}`, {
          style: POWER_ON_BANNER_STYLE
        })
      }
    } catch (e) {
      toast.error('Ошибка VPN', {
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setIsSwitching(false)
      mutateAppConfig()
    }
  }

  // Paste from clipboard
  const handlePasteClipboard = async (): Promise<void> => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        setInputUrl(text.trim())
        toast.success('Скопировано из буфера обмена')
      } else {
        toast.info('Буфер обмена пуст')
      }
    } catch {
      toast.error('Не удалось прочитать буфер обмена')
    }
  }

  // Add subscription or key
  const handleAddSubscription = async (): Promise<void> => {
    if (!inputUrl.trim()) {
      toast.warning('Вставьте ссылку подписки или ключ конфигурации')
      return
    }
    setAddingSub(true)
    try {
      const res = await vpnAddSubscription(inputUrl.trim())
      setInputUrl('')
      if (res.subscription) {
        toast.success(`Подписка "${res.subscription.name}" успешно добавлена!`, {
          description: `Импортировано серверов: ${res.servers.length}`
        })
      } else {
        toast.success('Серверы успешно добавлены!', {
          description: `Импортировано: ${res.servers.length}`
        })
      }
      mutateAppConfig()
    } catch (e) {
      toast.error('Не удалось добавить подписку/ключ', {
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setAddingSub(false)
    }
  }

  // Update subscription
  const handleUpdateSubscription = async (subId: string): Promise<void> => {
    setRefreshingSubId(subId)
    try {
      const updated = await vpnUpdateSubscription(subId)
      toast.success(`Подписка "${updated.name}" обновлена!`, {
        description: `Актуально серверов: ${updated.serverCount ?? 0}`
      })
      mutateAppConfig()
    } catch (e) {
      toast.error('Ошибка обновления подписки', {
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setRefreshingSubId(null)
    }
  }

  // Delete subscription
  const handleDeleteSubscription = async (subId: string): Promise<void> => {
    try {
      await vpnDeleteSubscription(subId)
      toast.success('Подписка удалена')
      mutateAppConfig()
    } catch (e) {
      toast.error('Не удалось удалить подписку', {
        description: e instanceof Error ? e.message : String(e)
      })
    }
  }

  // Select server
  const handleSelectServer = async (serverId: string): Promise<void> => {
    try {
      await vpnSelectServer(serverId)
      mutateAppConfig()
      const srv = servers.find((s) => s.id === serverId)
      if (isConnected) {
        toast.success(`Переключено на ${srv?.name ?? 'сервер'}`)
      }
    } catch (e) {
      toast.error('Ошибка выбора сервера', {
        description: e instanceof Error ? e.message : String(e)
      })
    }
  }

  // Test ping/latency
  const handleTestLatencies = async (): Promise<void> => {
    if (isTestingLatency) return
    setIsTestingLatency(true)
    toast.info('Тестирование задержки серверов…', { icon: <Zap className="size-4 text-amber-400" /> })
    try {
      await vpnTestLatency()
      mutateAppConfig()
      toast.success('Тестирование пинга завершено!')
    } catch (e) {
      toast.error('Ошибка тестирования пинга', {
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setIsTestingLatency(false)
    }
  }

  // Routing mode change
  const handleSetRoutingMode = async (mode: VpnRoutingMode): Promise<void> => {
    try {
      await vpnSetRoutingMode(mode)
      mutateAppConfig()
      toast.success(`Режим изменен: ${ROUTING_MODES.find((m) => m.id === mode)?.title}`)
    } catch (e) {
      toast.error('Ошибка смены режима', {
        description: e instanceof Error ? e.message : String(e)
      })
    }
  }

  // TUN mode toggle
  const handleToggleTun = async (enabled: boolean): Promise<void> => {
    try {
      await vpnSetTunMode(enabled)
      mutateAppConfig()
      toast.success(enabled ? 'TUN-адаптер включен' : 'TUN-адаптер отключен (только прокси)')
    } catch (e) {
      toast.error('Ошибка переключения TUN', {
        description: e instanceof Error ? e.message : String(e)
      })
    }
  }

  return (
    <BasePage>
      <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full pb-10">
        {/* Header Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-sm">
                <Shield className="size-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                  VPN & Подписки
                  <span className="text-xs px-2 py-0.5 rounded-full border border-border/60 bg-muted/50 text-muted-foreground font-normal">
                    sing-box v1.14 • Wintun
                  </span>
                </h1>
                <p className="text-sm text-muted-foreground">
                  Универсальный VPN-клиент с поддержкой Happ, v2rayN, VLESS Reality, VMess, Hysteria 2, Trojan и Shadowsocks
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isConnected && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => vpnRestart().then(() => toast.success('VPN перезапущен')).catch(() => void 0)}
                className="gap-2 h-9"
              >
                <RotateCw className="size-3.5" />
                Перезапустить
              </Button>
            )}
          </div>
        </div>

        {/* Master Connection Card */}
        <Card
          className={cn(
            'overflow-hidden transition-all duration-300 border-2',
            isConnected
              ? 'border-stroke-power-on bg-gradient-to-br from-gradient-start-power-on/30 to-gradient-end-power-on/30 shadow-lg shadow-gradient-end-power-on/10'
              : 'border-border/60 bg-card/50 backdrop-blur-xl'
          )}
        >
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-5 w-full md:w-auto">
                <div
                  className={cn(
                    'size-16 rounded-2xl flex items-center justify-center shrink-0 border transition-all duration-300',
                    isConnected
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                      : isStarting || isStopping
                        ? 'bg-amber-500/20 border-amber-500/40 text-amber-400 animate-pulse'
                        : 'bg-muted/40 border-border/40 text-muted-foreground'
                  )}
                >
                  {isConnected ? (
                    <ShieldCheck className="size-9" />
                  ) : isStarting || isStopping ? (
                    <Spinner className="size-9" />
                  ) : (
                    <Shield className="size-9" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'size-2.5 rounded-full',
                        isConnected
                          ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                          : isStarting || isStopping
                            ? 'bg-amber-400 animate-ping'
                            : 'bg-muted-foreground/40'
                      )}
                    />
                    <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      {isStarting
                        ? 'Подключение…'
                        : isStopping
                          ? 'Отключение…'
                          : isConnected
                            ? 'VPN Подключён'
                            : 'VPN Отключён'}
                    </span>
                  </div>

                  <div className="text-xl font-bold truncate mt-1 flex items-center gap-2 text-foreground">
                    {activeServer ? (
                      <>
                        <span className="text-2xl">{getCountryFlag(activeServer.countryCode)}</span>
                        <span>{activeServer.name}</span>
                        <span
                          className={cn(
                            'text-xs uppercase px-2 py-0.5 rounded border font-mono font-medium',
                            activeServer.type === 'awg'
                              ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                              : 'bg-primary/15 text-primary border-primary/25'
                          )}
                        >
                          {activeServer.type === 'awg' ? 'AmneziaWG' : activeServer.type}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground font-normal text-base">
                        Нет добавленных серверов (вставьте ссылку подписки)
                      </span>
                    )}
                  </div>

                  {activeServer && (
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-1.5">
                      <span className="font-mono">
                        {activeServer.server}:{activeServer.serverPort}
                      </span>
                      {activeServer.latencyMs !== undefined && activeServer.latencyMs !== null && (
                        <span className={cn('px-2 py-0.5 rounded-full border', getLatencyBadgeClass(activeServer.latencyMs))}>
                          {activeServer.latencyMs > 0 ? `${activeServer.latencyMs} ms` : 'Таймаут'}
                        </span>
                      )}
                      <span className="text-muted-foreground/60">•</span>
                      <span>
                        Режим: {routingMode === 'bypass-ru' ? 'РФ напрямую' : routingMode === 'global' ? 'Global' : 'Прокси'}
                      </span>
                      {tunMode && <span className="text-emerald-400 font-medium">TUN активен</span>}
                    </div>
                  )}
                </div>
              </div>

              {/* Big Connect Button */}
              <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                <Button
                  size="lg"
                  disabled={isBusy || servers.length === 0}
                  onClick={handleToggleConnect}
                  className={cn(
                    'h-13 px-8 text-base font-semibold rounded-xl cursor-pointer transition-all duration-300 shadow-md min-w-[170px]',
                    isConnected
                      ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-900/20'
                      : 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-primary/20'
                  )}
                >
                  {isBusy ? (
                    <Spinner className="size-5 mr-2" />
                  ) : isConnected ? (
                    'Отключить'
                  ) : (
                    'Подключить'
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Routing Modes Selection */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Layers className="size-4 text-primary" />
              Режим маршрутизации трафика
            </h2>
            <div className="flex items-center gap-2">
              <Label htmlFor="tun-toggle" className="text-xs text-muted-foreground cursor-pointer">
                Виртуальный TUN-адаптер (Wintun)
              </Label>
              <Switch
                id="tun-toggle"
                checked={tunMode}
                onCheckedChange={handleToggleTun}
                disabled={isBusy}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {ROUTING_MODES.map((mode) => {
              const selected = routingMode === mode.id
              return (
                <div
                  key={mode.id}
                  onClick={() => !isBusy && handleSetRoutingMode(mode.id)}
                  className={cn(
                    'relative p-4 rounded-xl border transition-all duration-200 cursor-pointer flex flex-col justify-between',
                    selected
                      ? 'border-primary bg-primary/10 shadow-sm'
                      : 'border-border/60 bg-card/40 hover:bg-card/70 hover:border-border'
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-sm font-semibold text-foreground">
                        {mode.title}
                      </span>
                      <span
                        className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded-full border',
                          selected
                            ? 'bg-primary/20 border-primary/30 text-primary font-medium'
                            : 'bg-muted/40 border-border/40 text-muted-foreground'
                        )}
                      >
                        {mode.badge}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {mode.subtitle}
                    </p>
                  </div>
                  <div className="mt-3 flex items-center justify-end">
                    <div
                      className={cn(
                        'size-4 rounded-full border flex items-center justify-center transition-all',
                        selected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-muted-foreground/40'
                      )}
                    >
                      {selected && <Check className="size-3 stroke-[3]" />}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Add Subscription or Keys Form */}
        <Card className="border-border/60 bg-card/50 backdrop-blur-xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="size-4 text-primary" />
              Добавить подписку, ключ или AmneziaWG
            </CardTitle>
            <CardDescription className="text-xs">
              Вставьте ссылку подписки (формат Happ, v2rayN, Outline), ключи vless://, vmess://, hysteria2://, ss://, trojan:// или выберите файл конфигурации AmneziaWG (.conf)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".conf,.txt"
              className="hidden"
            />
            <div className="flex flex-col sm:flex-row items-stretch gap-2">
              <div className="relative flex-1">
                <Input
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="https://... или vless://... / hysteria2://... / текст .conf"
                  className="pr-24 font-mono text-xs h-10 bg-background/60"
                  disabled={addingSub}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddSubscription()
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handlePasteClipboard}
                  className="absolute right-1 top-1 h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground gap-1.5"
                >
                  <Clipboard className="size-3.5" />
                  Вставить
                </Button>
              </div>

              <Button
                disabled={addingSub || !inputUrl.trim()}
                onClick={handleAddSubscription}
                className="h-10 px-6 gap-2 font-medium shrink-0"
              >
                {addingSub ? <Spinner className="size-4" /> : <Plus className="size-4" />}
                Импортировать
              </Button>

              <Button
                type="button"
                variant="outline"
                disabled={addingSub}
                onClick={() => fileInputRef.current?.click()}
                className="h-10 px-4 gap-2 font-medium shrink-0"
                title="Импортировать конфигурацию AmneziaWG / WireGuard (.conf файл)"
              >
                <FileText className="size-4 text-purple-400" />
                Файл .conf
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Subscriptions List (if any) */}
        {subscriptions.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Globe className="size-4 text-primary" />
                Активные подписки ({subscriptions.length})
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {subscriptions.map((sub) => {
                const isRefreshing = refreshingSubId === sub.id
                const hasTraffic = Boolean(sub.totalBytes && sub.totalBytes > 0)
                const usedBytes = (sub.uploadBytes ?? 0) + (sub.downloadBytes ?? 0)
                const percent =
                  hasTraffic && sub.totalBytes
                    ? Math.min(100, Math.round((usedBytes / sub.totalBytes) * 100))
                    : null

                return (
                  <Card key={sub.id} className="border-border/60 bg-card/40">
                    <CardContent className="p-4 flex flex-col justify-between gap-3">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="text-sm font-semibold text-foreground truncate">
                              {sub.name}
                            </h3>
                            <p className="text-xs text-muted-foreground truncate font-mono mt-0.5 max-w-[280px]">
                              {sub.url}
                            </p>
                          </div>
                          <span className="text-xs px-2 py-0.5 rounded-full border border-primary/20 bg-primary/10 text-primary font-medium shrink-0">
                            {sub.serverCount ?? 0} серверов
                          </span>
                        </div>

                        {/* Traffic Info if present */}
                        {hasTraffic && percent !== null && (
                          <div className="mt-3">
                            <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                              <span>Трафик: {formatBytes(usedBytes)} / {formatBytes(sub.totalBytes)}</span>
                              <span>{percent}%</span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-muted/60 overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full transition-all"
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-2">
                          {sub.updatedAt && (
                            <span>Обновлено: {formatDate(sub.updatedAt)}</span>
                          )}
                          {sub.expireTimestamp && (
                            <span>Истекает: {formatDate(sub.expireTimestamp)}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/40">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isRefreshing}
                          onClick={() => handleUpdateSubscription(sub.id)}
                          className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                        >
                          <RefreshCw className={cn('size-3', isRefreshing && 'animate-spin')} />
                          Обновить
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteSubscription(sub.id)}
                          className="h-7 text-xs gap-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                        >
                          <Trash2 className="size-3" />
                          Удалить
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        )}

        {/* Servers List */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Server className="size-4 text-primary" />
              <h2 className="text-base font-semibold text-foreground">
                Список серверов ({filteredServers.length}{servers.length !== filteredServers.length ? ` из ${servers.length}` : ''})
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative w-48">
                <Search className="size-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Поиск сервера…"
                  className="h-8 pl-8 text-xs bg-background/60"
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                disabled={isTestingLatency || servers.length === 0}
                onClick={handleTestLatencies}
                className="h-8 text-xs gap-1.5"
              >
                {isTestingLatency ? (
                  <Spinner className="size-3" />
                ) : (
                  <Zap className="size-3 text-amber-400" />
                )}
                Проверить пинг
              </Button>
            </div>
          </div>

          {servers.length === 0 ? (
            <Card className="border-dashed border-2 border-border/60 bg-card/20 p-8 text-center">
              <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                <div className="size-12 rounded-full bg-muted/40 flex items-center justify-center text-muted-foreground mb-1">
                  <Server className="size-6" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">Серверы ещё не добавлены</h3>
                <p className="text-xs text-muted-foreground">
                  Вставьте ссылку подписки или ключи vless:// выше, чтобы здесь появились доступные серверы с авто-проверкой скорости.
                </p>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {filteredServers.map((server) => {
                const isSelected = server.id === (selectedServerId || activeServer?.id)
                return (
                  <div
                    key={server.id}
                    onClick={() => handleSelectServer(server.id)}
                    className={cn(
                      'group relative p-3 rounded-xl border transition-all duration-200 cursor-pointer flex items-center justify-between gap-3',
                      isSelected
                        ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary/40'
                        : 'border-border/60 bg-card/40 hover:bg-card/70 hover:border-border'
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="text-2xl select-none shrink-0">
                        {getCountryFlag(server.countryCode)}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-foreground truncate">
                            {server.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground truncate font-mono mt-0.5">
                          <span
                            className={cn(
                              'uppercase text-[9px] px-1.5 py-0.5 rounded font-mono font-medium',
                              server.type === 'awg'
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                : 'bg-muted/60 text-muted-foreground'
                            )}
                          >
                            {server.type === 'awg' ? 'AmneziaWG' : server.type}
                          </span>
                          <span className="truncate">
                            {server.server}:{server.serverPort}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {server.latencyMs !== undefined && server.latencyMs !== null ? (
                        <span
                          className={cn(
                            'text-[10px] px-2 py-0.5 rounded-full border',
                            getLatencyBadgeClass(server.latencyMs)
                          )}
                        >
                          {server.latencyMs > 0 ? `${server.latencyMs} ms` : '—'}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/60 px-1.5">
                          —
                        </span>
                      )}

                      <div
                        className={cn(
                          'size-4 rounded-full border flex items-center justify-center transition-all',
                          isSelected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-muted-foreground/40 opacity-0 group-hover:opacity-100'
                        )}
                      >
                        {isSelected && <Check className="size-3 stroke-[3]" />}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Local Proxy Ports Info Card */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-border/40 bg-card/30 text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <Laptop className="size-3.5 text-primary" />
              Локальный HTTP прокси:
              <code className="text-foreground font-mono bg-muted/50 px-1.5 py-0.5 rounded">
                127.0.0.1:{vpnStatus.localHttpPort || 2080}
              </code>
            </span>
            <span className="flex items-center gap-1.5">
              Локальный SOCKS5 прокси:
              <code className="text-foreground font-mono bg-muted/50 px-1.5 py-0.5 rounded">
                127.0.0.1:{vpnStatus.localSocksPort || 2081}
              </code>
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px]">
            <CheckCircle2 className="size-3.5 text-emerald-400" />
            <span>Совместимо с Chrome, Firefox, Telegram, Git и игровыми лаунчерами</span>
          </div>
        </div>
      </div>
    </BasePage>
  )
}

export default VpnPage
