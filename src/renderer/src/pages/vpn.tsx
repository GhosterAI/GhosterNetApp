import React, { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import NumberFlow from '@number-flow/react'
import {
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
  FileText,
  ChevronDown,
  X,
  Copy
} from 'lucide-react'
import BasePage from '@renderer/components/base/base-page'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Switch } from '@renderer/components/ui/switch'
import { Label } from '@renderer/components/ui/label'
import { Spinner } from '@renderer/components/ui/spinner'
import { CountryFlag, detectCountryCode } from '@renderer/components/ui/country-flag'
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
import PowerIcon from '@renderer/assets/on_icon.svg'
import PauseIcon from '@renderer/assets/pause_icon.svg'

function stripEmojis(str?: string): string {
  if (!str) return ''
  return str
    .replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FE0F}]|[\u{1F300}-\u{1F9FF}]|[\u{2B50}-\u{2B55}]|[\u{200D}]|[\u{2300}-\u{23FF}]/gu, '')
    .trim()
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
  shortTitle: string
  subtitle: string
  badge: string
}> = [
  {
    id: 'bypass-ru',
    title: 'Умный обход (РФ напрямую)',
    shortTitle: 'Обход РФ',
    subtitle: 'Сайты РФ открываются напрямую, остальное через VPN',
    badge: 'Рекомендуется'
  },
  {
    id: 'global',
    title: 'Полный туннель (Global)',
    shortTitle: 'Весь трафик',
    subtitle: 'Весь сетевой трафик компьютера шифруется через VPN',
    badge: '100% защита'
  },
  {
    id: 'proxy-only',
    title: 'Только локальный прокси',
    shortTitle: 'Прокси',
    subtitle: 'Без TUN-адаптера. Локальный HTTP (2080) и SOCKS5 (2081)',
    badge: 'Для браузера'
  }
]

const PROTOCOL_FILTERS = [
  { id: 'all', label: 'Все' },
  { id: 'vless', label: 'VLESS' },
  { id: 'awg', label: 'AmneziaWG' },
  { id: 'hysteria2', label: 'Hysteria 2' },
  { id: 'trojan', label: 'Trojan' },
  { id: 'shadowsocks', label: 'SS' }
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
  const [showManualInput, setShowManualInput] = useState(false)
  const [addingSub, setAddingSub] = useState(false)
  const [refreshingSubId, setRefreshingSubId] = useState<string | null>(null)
  const [searchFilter, setSearchFilter] = useState('')
  const [protocolFilter, setProtocolFilter] = useState('all')
  const [selectedSubFilter, setSelectedSubFilter] = useState<string | null>(null)
  const [isSwitching, setIsSwitching] = useState(false)
  const [showModeDropdown, setShowModeDropdown] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const modeDropdownRef = useRef<HTMLDivElement>(null)

  // Close mode dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent): void => {
      if (modeDropdownRef.current && !modeDropdownRef.current.contains(e.target as Node)) {
        setShowModeDropdown(false)
      }
    }
    if (showModeDropdown) {
      document.addEventListener('mousedown', handleOutsideClick)
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [showModeDropdown])

  const isConnected = vpnStatus.state === 'running'
  const isStarting = vpnStatus.state === 'starting'
  const isStopping = vpnStatus.state === 'stopping'
  const isBusy = isStarting || isStopping || isSwitching

  const activeServer =
    vpnStatus.activeServer ||
    servers.find((s) => s.id === selectedServerId) ||
    servers[0]

  // Timer logic
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!isConnected || !vpnStatus.startedAt) {
      setElapsed(0)
      return
    }
    const tick = (): void => setElapsed(Math.floor((Date.now() - vpnStatus.startedAt!) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [isConnected, vpnStatus.startedAt])

  const h = Math.floor(elapsed / 3600)
  const m = Math.floor((elapsed % 3600) / 60)
  const s = elapsed % 60


  // Filtered servers
  const filteredServers = useMemo(() => {
    return servers.filter((s) => {
      // Subscription filter
      if (selectedSubFilter && s.subscriptionId !== selectedSubFilter) {
        return false
      }
      // Protocol filter
      if (protocolFilter !== 'all' && s.type.toLowerCase() !== protocolFilter.toLowerCase()) {
        return false
      }
      // Search query
      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase().trim()
        const matchesName = s.name.toLowerCase().includes(q)
        const matchesServer = s.server.toLowerCase().includes(q)
        const matchesCountry = s.countryCode && s.countryCode.toLowerCase().includes(q)
        const matchesType = s.type.toLowerCase().includes(q)
        if (!matchesName && !matchesServer && !matchesCountry && !matchesType) return false
      }
      return true
    })
  }, [servers, searchFilter, protocolFilter, selectedSubFilter])

  // Connect / Disconnect toggle
  const handleToggleConnect = async (): Promise<void> => {
    if (isBusy) return
    if (!isConnected && servers.length === 0) {
      toast.warning('Сначала добавьте сервер или подписку')
      return
    }
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

  // Instant paste & import from clipboard (Happ style)
  const handlePasteClipboard = async (): Promise<void> => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text || !text.trim()) {
        toast.warning('Буфер обмена пуст')
        return
      }
      setAddingSub(true)
      const res = await vpnAddSubscription(text.trim())
      if (res.subscription) {
        toast.success(`Подписка "${res.subscription.name}" импортирована!`, {
          description: `Добавлено серверов: ${res.servers.length}`
        })
      } else {
        toast.success('Серверы успешно добавлены!', {
          description: `Импортировано серверов: ${res.servers.length}`
        })
      }
      mutateAppConfig()
    } catch (e) {
      toast.error('Не удалось импортировать из буфера обмена', {
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setAddingSub(false)
    }
  }

  // File upload for AmneziaWG / WireGuard .conf
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
            description: `Добавлено конфигураций: ${res.servers.length}`
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

  // Manual URL/Key submission
  const handleAddManual = async (): Promise<void> => {
    if (!inputUrl.trim()) {
      toast.warning('Введите ссылку подписки или ключ')
      return
    }
    setAddingSub(true)
    try {
      const res = await vpnAddSubscription(inputUrl.trim())
      setInputUrl('')
      setShowManualInput(false)
      if (res.subscription) {
        toast.success(`Подписка "${res.subscription.name}" добавлена!`, {
          description: `Импортировано серверов: ${res.servers.length}`
        })
      } else {
        toast.success('Серверы успешно добавлены!', {
          description: `Импортировано: ${res.servers.length}`
        })
      }
      mutateAppConfig()
    } catch (e) {
      toast.error('Не удалось добавить подписку', {
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
      if (selectedSubFilter === subId) setSelectedSubFilter(null)
      toast.success('Подписка удалена')
      mutateAppConfig()
    } catch (e) {
      toast.error('Не удалось удалить подписку', {
        description: e instanceof Error ? e.message : String(e)
      })
    }
  }

  // Copy subscription URL
  const handleCopySubUrl = async (url: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Ссылка подписки скопирована в буфер')
    } catch {
      toast.error('Не удалось скопировать')
    }
  }

  // Select server (with seamless restart if active)
  const handleSelectServer = async (serverId: string): Promise<void> => {
    if (serverId === selectedServerId && !isConnected) return
    try {
      await vpnSelectServer(serverId)
      mutateAppConfig()
      const srv = servers.find((s) => s.id === serverId)
      if (isConnected) {
        toast.success(`Переключение на ${srv?.name ?? 'сервер'}…`)
        await vpnRestart()
      } else {
        toast.info(`Выбран сервер: ${srv?.name ?? 'сервер'}`)
      }
    } catch (e) {
      toast.error('Ошибка выбора сервера', {
        description: e instanceof Error ? e.message : String(e)
      })
    }
  }

  // Test latency
  const handleTestLatencies = async (): Promise<void> => {
    if (isTestingLatency || servers.length === 0) return
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

  // Change routing mode
  const handleSetRoutingMode = async (mode: VpnRoutingMode): Promise<void> => {
    setShowModeDropdown(false)
    try {
      await vpnSetRoutingMode(mode)
      mutateAppConfig()
      toast.success(`Режим: ${ROUTING_MODES.find((m) => m.id === mode)?.title}`)
    } catch (e) {
      toast.error('Ошибка смены режима', {
        description: e instanceof Error ? e.message : String(e)
      })
    }
  }

  // Toggle TUN mode
  const handleToggleTun = async (enabled: boolean): Promise<void> => {
    try {
      await vpnSetTunMode(enabled)
      mutateAppConfig()
      toast.success(enabled ? 'TUN адаптер включен' : 'TUN адаптер отключен (только прокси)')
    } catch (e) {
      toast.error('Ошибка переключения TUN', {
        description: e instanceof Error ? e.message : String(e)
      })
    }
  }

  const activeModeObj = ROUTING_MODES.find((m) => m.id === routingMode) || ROUTING_MODES[0]

  return (
    <BasePage>
      {/* Hidden file input for AmneziaWG / WireGuard .conf files */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".conf,.txt"
        className="hidden"
      />

      <div className="flex flex-col lg:flex-row gap-5 max-w-7xl mx-auto w-full pb-8 h-[calc(100vh-theme(spacing.20))]">
        {/* ============================================================ */}
        {/* LEFT COLUMN: SERVERS & SUBSCRIPTIONS PANEL (Happ style)     */}
        {/* ============================================================ */}
        <div className="w-full lg:w-[380px] xl:w-[410px] shrink-0 flex flex-col rounded-2xl border border-border/50 bg-card/45 backdrop-blur-xl overflow-hidden shadow-sm">
          {/* Top Panel Header */}
          <div className="p-4 border-b border-border/40 shrink-0">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Server className="size-4 text-primary" />
                <h2 className="text-sm font-semibold tracking-wide uppercase text-foreground">
                  Серверы
                </h2>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-mono font-medium">
                  {filteredServers.length}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={isTestingLatency || servers.length === 0}
                  onClick={handleTestLatencies}
                  title="Замер пинга"
                  className="size-7 rounded-lg text-muted-foreground hover:text-foreground"
                >
                  {isTestingLatency ? (
                    <Spinner className="size-3.5 text-muted-foreground animate-spin" />
                  ) : (
                    <Zap className="size-3.5" />
                  )}
                </Button>
                {subscriptions.length > 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      subscriptions.forEach((sub) => handleUpdateSubscription(sub.id))
                    }}
                    disabled={refreshingSubId !== null}
                    title="Обновить все подписки"
                    className="size-7 rounded-lg text-muted-foreground hover:text-foreground"
                  >
                    <RefreshCw className={cn('size-3.5', refreshingSubId && 'animate-spin text-primary')} />
                  </Button>
                )}
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="size-3.5 absolute left-3 top-2.5 text-muted-foreground" />
              <Input
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Поиск по имени, стране, протоколу…"
                className="h-8 pl-8.5 pr-7 text-xs bg-background/50 border-border/40 rounded-xl"
              />
              {searchFilter && (
                <button
                  type="button"
                  onClick={() => setSearchFilter('')}
                  className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            {/* Protocol Filters Bar */}
            <div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto no-scrollbar py-0.5">
              {PROTOCOL_FILTERS.map((f) => {
                const isActive = protocolFilter === f.id
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setProtocolFilter(f.id)}
                    className={cn(
                      'text-[10px] uppercase font-mono px-2 py-1 rounded-lg transition-all shrink-0 cursor-pointer border',
                      isActive
                        ? 'bg-primary/20 text-primary border-primary/40 font-semibold'
                        : 'bg-muted/30 text-muted-foreground border-transparent hover:bg-muted/50 hover:text-foreground'
                    )}
                  >
                    {f.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Subscriptions Accordion Cards (if any) */}
          {subscriptions.length > 0 && (
            <div className="p-3 border-b border-border/40 bg-muted/10 shrink-0 max-h-40 overflow-y-auto">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center justify-between">
                <span>Подписки ({subscriptions.length})</span>
                {selectedSubFilter && (
                  <button
                    type="button"
                    onClick={() => setSelectedSubFilter(null)}
                    className="text-primary hover:underline lowercase font-normal"
                  >
                    сбросить фильтр
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                {subscriptions.map((sub) => {
                  const isSelected = selectedSubFilter === sub.id
                  const isRefreshing = refreshingSubId === sub.id
                  const hasTraffic = Boolean(sub.totalBytes && sub.totalBytes > 0)
                  const usedBytes = (sub.uploadBytes ?? 0) + (sub.downloadBytes ?? 0)
                  const percent =
                    hasTraffic && sub.totalBytes
                      ? Math.min(100, Math.round((usedBytes / sub.totalBytes) * 100))
                      : null

                  return (
                    <div
                      key={sub.id}
                      className={cn(
                        'p-2 rounded-xl border text-xs transition-all flex flex-col gap-1.5 cursor-pointer',
                        isSelected
                          ? 'border-primary/50 bg-primary/10 shadow-xs'
                          : 'border-border/30 bg-card/40 hover:bg-card/70 hover:border-border/60'
                      )}
                      onClick={() => setSelectedSubFilter(isSelected ? null : sub.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex items-center gap-1.5 truncate">
                          <Globe className="size-3 text-primary shrink-0" />
                          <span className="font-semibold text-foreground truncate">{stripEmojis(sub.name) || sub.name}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted/50 text-muted-foreground font-mono shrink-0">
                            {sub.serverCount ?? 0}
                          </span>
                        </div>

                        {/* Actions */}
                        <div
                          className="flex items-center gap-1 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            disabled={isTestingLatency || servers.length === 0}
                            onClick={handleTestLatencies}
                            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-40"
                            title="Замер пинга"
                          >
                            {isTestingLatency ? (
                              <Spinner className="size-3 text-muted-foreground animate-spin" />
                            ) : (
                              <Zap className="size-3" />
                            )}
                          </button>
                          <button
                            type="button"
                            disabled={isRefreshing}
                            onClick={() => handleUpdateSubscription(sub.id)}
                            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                            title="Обновить"
                          >
                            <RefreshCw className={cn('size-3', isRefreshing && 'animate-spin text-primary')} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopySubUrl(sub.url)}
                            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                            title="Скопировать ссылку"
                          >
                            <Copy className="size-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSubscription(sub.id)}
                            className="p-1 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-500/15 transition-colors"
                            title="Удалить подписку"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      </div>

                      {/* Expiration or Traffic */}
                      {(sub.expireTimestamp || hasTraffic) && (
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                          {sub.expireTimestamp ? (
                            <span>До: {formatDate(sub.expireTimestamp)}</span>
                          ) : (
                            <span>Обновлено</span>
                          )}
                          {hasTraffic && percent !== null && (
                            <span>{formatBytes(usedBytes)} / {formatBytes(sub.totalBytes)} ({percent}%)</span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Scrollable Servers List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5 divide-y divide-border/20">
            {filteredServers.length === 0 ? (
              <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
                <div className="size-11 rounded-full bg-muted/30 flex items-center justify-center text-muted-foreground mb-2">
                  <Server className="size-5" />
                </div>
                <div className="text-xs font-semibold text-foreground">
                  {servers.length === 0 ? 'Нет доступных серверов' : 'Ничего не найдено'}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 max-w-[220px]">
                  {servers.length === 0
                    ? 'Нажмите «Из буфера» или импортируйте .conf файл'
                    : 'Попробуйте изменить поисковый запрос или сбросить фильтры'}
                </p>
              </div>
            ) : (
              filteredServers.map((server) => {
                const isSelected = server.id === (activeServer?.id || selectedServerId)
                const isAwg = server.type === 'awg'
                return (
                  <div
                    key={server.id}
                    onClick={() => handleSelectServer(server.id)}
                    className={cn(
                      'group relative p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2.5',
                      isSelected
                        ? 'border-primary/60 bg-primary/10 shadow-sm ring-1 ring-primary/40'
                        : 'border-border/30 bg-card/30 hover:bg-card/70 hover:border-border/60'
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {/* Country Flag */}
                      <div className="size-8 rounded-xl bg-card/60 border border-border/40 flex items-center justify-center shrink-0 select-none overflow-hidden shadow-xs">
                        <CountryFlag
                          code={server.countryCode || detectCountryCode(server.name)}
                          className="w-5 h-3.5 rounded-[2px]"
                          fallback={<Server className="size-3.5 text-primary" />}
                        />
                      </div>


                      {/* Name & Type */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="text-xs font-medium text-foreground truncate">
                            {stripEmojis(server.name) || server.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground truncate font-mono mt-0.5">
                          <span
                            className={cn(
                              'uppercase px-1 py-0.2 rounded font-mono font-semibold text-[9px] border',
                              isAwg
                                ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                                : 'bg-muted/50 text-muted-foreground border-border/30'
                            )}
                          >
                            {isAwg ? 'AWG' : server.type}
                          </span>
                          <span className="truncate">
                            {server.server}:{server.serverPort}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Latency badge & check */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {server.latencyMs !== undefined && server.latencyMs !== null ? (
                        <span
                          className={cn(
                            'text-[10px] px-1.5 py-0.5 rounded-full border font-mono',
                            getLatencyBadgeClass(server.latencyMs)
                          )}
                        >
                          {server.latencyMs > 0 ? `${server.latencyMs} ms` : 'Таймаут'}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/50 px-1 font-mono">
                          —
                        </span>
                      )}

                      <div
                        className={cn(
                          'size-4 rounded-full border flex items-center justify-center transition-all',
                          isSelected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-muted-foreground/30 opacity-0 group-hover:opacity-60'
                        )}
                      >
                        {isSelected && <Check className="size-2.5 stroke-[3]" />}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Collapsible Manual Input Expand */}
          {showManualInput && (
            <div className="p-3 border-t border-border/40 bg-muted/20 shrink-0">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5">
                <span>Ссылка подписки или ключ:</span>
                <button
                  type="button"
                  onClick={() => setShowManualInput(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="https://... или vless://..."
                  className="h-8 text-xs font-mono bg-background/60"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddManual()
                  }}
                />
                <Button
                  size="sm"
                  onClick={handleAddManual}
                  disabled={addingSub || !inputUrl.trim()}
                  className="h-8 px-3 text-xs shrink-0"
                >
                  {addingSub ? <Spinner className="size-3" /> : 'Добавить'}
                </Button>
              </div>
            </div>
          )}

          {/* Bottom Action Bar (Happ style: Clipboard + Conf file) */}
          <div className="p-3 border-t border-border/40 bg-card/60 backdrop-blur-md shrink-0 flex items-center justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePasteClipboard}
              disabled={addingSub}
              className="flex-1 h-9 text-xs gap-1.5 bg-background/40 hover:bg-background/80 border-border/50 rounded-xl"
              title="Импортировать ссылку подписки или ключи из буфера обмена"
            >
              <Clipboard className="size-3.5 text-primary" />
              <span>Из буфера</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={addingSub}
              className="flex-1 h-9 text-xs gap-1.5 bg-background/40 hover:bg-background/80 border-border/50 rounded-xl"
              title="Импортировать файл конфигурации AmneziaWG / WireGuard (.conf)"
            >
              <FileText className="size-3.5 text-purple-400" />
              <span>Файл .conf</span>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowManualInput(!showManualInput)}
              className={cn(
                'size-9 rounded-xl border border-border/40 shrink-0 text-muted-foreground hover:text-foreground',
                showManualInput && 'bg-primary/15 text-primary border-primary/40'
              )}
              title="Ввести ссылку или ключ вручную"
            >
              <Plus className="size-4" />
            </Button>
          </div>
        </div>

        {/* ============================================================ */}
        {/* RIGHT COLUMN: CONNECTION HUD & SPEED STAGE (Happ style)     */}
        {/* ============================================================ */}
        <div className="flex-1 flex flex-col justify-between rounded-2xl border border-border/50 bg-card/45 backdrop-blur-xl p-6 shadow-sm overflow-hidden relative min-h-[580px]">
          {/* Top Bar: Mode Selector & TUN Switch */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border/30">
            <div>
              <h1 className="text-base font-bold tracking-tight text-foreground">
                GhosterNet Universal VPN
              </h1>
            </div>

            <div className="flex items-center gap-3">
              {/* Routing Mode Dropdown (Happ Photo 4 style) */}
              <div className="relative" ref={modeDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowModeDropdown(!showModeDropdown)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border/50 bg-card/70 hover:bg-card text-xs font-medium text-foreground transition-all cursor-pointer shadow-xs"
                >
                  <Layers className="size-3.5 text-primary" />
                  <span>Режим: {activeModeObj.shortTitle}</span>
                  <ChevronDown className={cn('size-3 text-muted-foreground transition-transform', showModeDropdown && 'rotate-180')} />
                </button>

                {showModeDropdown && (
                  <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-border/60 bg-popover/95 backdrop-blur-xl p-1.5 shadow-xl z-50 flex flex-col gap-1">
                    <div className="px-2.5 py-1 text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                      Режимы маршрутизации
                    </div>
                    {ROUTING_MODES.map((mode) => {
                      const isSelected = routingMode === mode.id
                      return (
                        <div
                          key={mode.id}
                          onClick={() => handleSetRoutingMode(mode.id)}
                          className={cn(
                            'p-2 rounded-lg cursor-pointer transition-colors flex items-start justify-between gap-2',
                            isSelected ? 'bg-primary/15 text-primary' : 'hover:bg-muted/50 text-foreground'
                          )}
                        >
                          <div>
                            <div className="text-xs font-semibold">{mode.title}</div>
                            <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                              {mode.subtitle}
                            </div>
                          </div>
                          {isSelected && <Check className="size-4 text-primary shrink-0 mt-0.5" />}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* TUN Mode Toggle */}
              <div className="flex items-center gap-2 pl-2 border-l border-border/30">
                <Label htmlFor="tun-switch" className="text-xs text-muted-foreground cursor-pointer select-none">
                  TUN
                </Label>
                <Switch
                  id="tun-switch"
                  checked={tunMode}
                  onCheckedChange={handleToggleTun}
                  disabled={isBusy}
                  className="data-[state=checked]:bg-primary"
                />
              </div>
            </div>
          </div>

          {/* Center Stage: Huge Glowing Power Toggle Button (Happ + Photo 1 style) */}
          <div className="my-auto py-8 flex flex-col items-center justify-center relative">
            {/* Concentric ripples/rings */}
            {isConnected && (
              <>
                <div className="absolute size-64 rounded-full border border-emerald-500/15 animate-ping opacity-35 pointer-events-none" />
                <div className="absolute size-52 rounded-full border border-emerald-500/25 pointer-events-none" />
                <div className="absolute size-44 rounded-full border border-emerald-500/40 pointer-events-none" />
              </>
            )}

            {/* Power Toggle Disc */}
            <button
              disabled={isBusy || servers.length === 0}
              onClick={handleToggleConnect}
              title={servers.length === 0 ? 'Добавьте сервер' : isConnected ? 'Отключить VPN' : 'Подключить VPN'}
              className={cn(
                'relative group transition-all duration-300 active:scale-95 cursor-pointer disabled:cursor-not-allowed',
                servers.length === 0 && 'opacity-60'
              )}
            >
              <div
                className={cn(
                  'w-36 h-36 rounded-full flex items-center justify-center transition-all duration-500 bg-radial-[at_30%_45%] backdrop-blur-xl border-3 shadow-2xl',
                  isConnected
                    ? 'from-gradient-start-power-on/70 to-gradient-end-power-on/70 border-stroke-power-on shadow-[0_0_55px_rgba(34,197,94,0.35)]'
                    : isBusy
                      ? 'from-amber-500/20 to-amber-900/30 border-amber-500/50 shadow-[0_0_35px_rgba(245,158,11,0.25)] animate-pulse'
                      : 'from-gradient-start-power-off/60 to-gradient-end-power-off/60 border-stroke-power-off shadow-[0_0_35px_rgba(244,63,94,0.15)] group-hover:border-stroke-power-off/80'
                )}
              >
                <div className="relative size-16 flex items-center justify-center">
                  <Spinner
                    className={cn(
                      'absolute inset-0 m-auto size-16 text-foreground transition-all duration-300',
                      isBusy ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
                    )}
                  />
                  <img
                    src={PauseIcon}
                    alt="Connected"
                    className={cn(
                      'absolute inset-0 size-16 fill-foreground transition-all duration-300',
                      !isBusy && isConnected ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
                    )}
                  />
                  <img
                    src={PowerIcon}
                    alt="Disconnected"
                    className={cn(
                      'absolute inset-0 size-16 fill-foreground transition-all duration-300',
                      !isBusy && !isConnected ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
                    )}
                  />
                </div>
              </div>
            </button>

            {/* Status Text Typography */}
            <div className="mt-5 flex flex-col items-center justify-center">
              <span
                className={cn(
                  'text-sm font-bold tracking-widest uppercase transition-colors',
                  isBusy
                    ? 'text-amber-400'
                    : isConnected
                      ? 'text-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.5)]'
                      : 'text-muted-foreground'
                )}
              >
                {isStarting
                  ? 'ПОДКЛЮЧЕНИЕ…'
                  : isStopping
                    ? 'ОТКЛЮЧЕНИЕ…'
                    : isConnected
                      ? 'ПОДКЛЮЧЕНО'
                      : 'ОТКЛЮЧЕНО'}
              </span>

              {/* Live Uptime Timer */}
              <div className="h-7 mt-1 flex items-center justify-center">
                <div
                  aria-hidden={!isConnected}
                  className={cn(
                    'inline-flex items-center gap-0.5 text-sm font-mono font-bold text-foreground tabular-nums transition-all duration-300',
                    isConnected ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'
                  )}
                >
                  <NumberFlow value={h} format={{ minimumIntegerDigits: 2, useGrouping: false }} />
                  <span>:</span>
                  <NumberFlow value={m} format={{ minimumIntegerDigits: 2, useGrouping: false }} />
                  <span>:</span>
                  <NumberFlow value={s} format={{ minimumIntegerDigits: 2, useGrouping: false }} />
                </div>
              </div>
            </div>

            {/* Active Server HUD Pill */}
            {activeServer ? (
              <div className="mt-4 px-4 py-2 rounded-2xl border border-border/40 bg-card/60 backdrop-blur-md flex items-center gap-3 shadow-xs">
                <div className="size-11 rounded-2xl bg-card/70 border border-border/50 flex items-center justify-center shrink-0 shadow-sm overflow-hidden">
                  <CountryFlag
                    code={activeServer.countryCode || detectCountryCode(activeServer.name)}
                    className="w-7 h-5 rounded-[3px]"
                    fallback={<Server className="size-5 text-primary" />}
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground truncate max-w-[200px]">
                      {stripEmojis(activeServer.name) || activeServer.name}
                    </span>
                    <span
                      className={cn(
                        'text-[9px] uppercase px-1.5 py-0.2 rounded font-mono font-semibold border',
                        activeServer.type === 'awg'
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                          : 'bg-primary/15 text-primary border-primary/25'
                      )}
                    >
                      {activeServer.type === 'awg' ? 'AmneziaWG' : activeServer.type}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono truncate">
                    {activeServer.server}:{activeServer.serverPort}
                  </div>
                </div>

                {activeServer.latencyMs !== undefined && activeServer.latencyMs !== null && (
                  <span
                    className={cn(
                      'ml-2 text-[10px] px-2 py-0.5 rounded-full border font-mono font-medium',
                      getLatencyBadgeClass(activeServer.latencyMs)
                    )}
                  >
                    {activeServer.latencyMs > 0 ? `${activeServer.latencyMs} ms` : 'Таймаут'}
                  </span>
                )}
              </div>
            ) : (
              <div className="mt-4 text-xs text-muted-foreground">
                Сервер не выбран
              </div>
            )}
          </div>

          {/* Bottom Action Bar: Restart (if connected) */}
          {isConnected && (
            <div className="mt-4 pt-4 border-t border-border/30 flex items-center justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  vpnRestart()
                    .then(() => toast.success('VPN перезапущен'))
                    .catch((e) => toast.error('Ошибка перезапуска', { description: String(e) }))
                }}
                className="h-9 px-3 rounded-xl text-xs gap-1.5 border-border/50 bg-background/30 hover:bg-background/70"
              >
                <RotateCw className="size-3.5" />
                <span>Перезапустить</span>
              </Button>
            </div>
          )}
        </div>
      </div>
    </BasePage>
  )
}

export default VpnPage
