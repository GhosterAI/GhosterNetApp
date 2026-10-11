import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Download,
  Loader2,
  Sparkles,
  FlaskConical,
  CheckCircle2,
  XCircle,
  Star,
  Sliders,
  Wand2,
  Square,
  ChevronDown,
  ChevronUp,
  LayoutGrid
} from 'lucide-react'
import { useZapretStore } from '@renderer/store/zapret-store'
import { useZapretTestStore } from '@renderer/store/zapret-test-store'
import {
  zapretListStrategies,
  zapretListFakeBins,
  zapretToggleFavorite,
  zapretStart,
  zapretStop,
  zapretRestart,
  zapretCheckUpdate,
  zapretInstallUpdate,
  zapretDismissUpdate,
  zapretRunStrategyTest,
  zapretCancelStrategyTest,
  zapretRunSettingsBenchmark,
  type ZapretUpdateInfo,
  type StrategyDescriptor
} from '@renderer/utils/ipc'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import ZapretIcon from '@renderer/components/zapret-icon'
import {
  cn,
  BUNDLED_ZAPRET_VERSION,
  POWER_ON_BANNER_STYLE,
  POWER_OFF_BANNER_STYLE
} from '@renderer/lib/utils'
import BasePage from '@renderer/components/base/base-page'
import SwitcherCard from '@renderer/components/switcher-card'
import ZapretIpListCard from '@renderer/components/zapret-iplist-card'

const IPSET_MODES: { id: IpsetMode; label: string; desc: string }[] = [
  { id: 'loaded', label: 'Полный список (Loaded)', desc: 'Стандартный фильтр по ipset-all.txt' },
  { id: 'none', label: 'Отключён (None)', desc: 'Обход только по доменным спискам' },
  { id: 'any', label: 'Все IP (Any)', desc: 'Перехват любых IP-адресов (0.0.0.0/0)' }
]

const GAME_FILTER_MODES: { id: GameFilterMode; label: string; desc: string }[] = [
  { id: 'disabled', label: 'Выключен', desc: 'Стандартные порты 80 / 443' },
  { id: 'tcpudp', label: 'TCP + UDP', desc: 'Игровые порты 1024-65535 (TCP и UDP)' },
  { id: 'tcp', label: 'Только TCP', desc: 'Игровые порты 1024-65535 (только TCP)' },
  { id: 'udp', label: 'Только UDP', desc: 'Игровые порты 1024-65535 (только UDP)' }
]

const Zapret: React.FC = () => {
  const status = useZapretStore((s) => s.status)
  const { appConfig, patchAppConfig, mutateAppConfig } = useAppConfig()
  const [strategies, setStrategies] = useState<StrategyDescriptor[]>([])
  const [binPayloads, setBinPayloads] = useState<string[]>([])
  const [onlyFavorites, setOnlyFavorites] = useState(false)
  const [benchmarking, setBenchmarking] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const zapret = appConfig?.zapret
  const active = zapret?.activeStrategy
  const location = useLocation()
  const navigate = useNavigate()
  const autoStartRef = useRef<boolean>(
    Boolean((location.state as { autoStart?: boolean } | null)?.autoStart)
  )

  // ---- Auto-update banner
  const [updateInfo, setUpdateInfo] = useState<ZapretUpdateInfo | null>(null)
  const [installing, setInstalling] = useState(false)
  const installingRef = useRef(false)

  // ---- Strategy test
  const testProgress = useZapretTestStore((s) => s.progress)
  const testReport = useZapretTestStore((s) => s.report)
  const isTestRunning = useZapretTestStore((s) => s.isRunning)
  const autoTestStartedRef = useRef(false)

  const refreshStrategies = (): void => {
    zapretListStrategies().then(setStrategies).catch(() => setStrategies([]))
    zapretListFakeBins().then(setBinPayloads).catch(() => setBinPayloads([]))
  }

  const startTest = (): void => {
    if (useZapretTestStore.getState().isRunning) return
    useZapretTestStore.getState().set({
      isRunning: true,
      progress: { phase: 'starting' }
    })
    zapretRunStrategyTest().catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error('Тест стратегий не выполнен', { description: msg })
      useZapretTestStore.getState().set({
        isRunning: false,
        progress: { phase: 'error', message: msg }
      })
    })
  }

  const cancelTest = async (): Promise<void> => {
    try {
      await zapretCancelStrategyTest()
      toast.info('Останавливаем тестирование стратегий…')
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    refreshStrategies()
    zapretCheckUpdate(false).then(setUpdateInfo).catch(() => setUpdateInfo(null))

    const t = setTimeout(() => {
      if (autoTestStartedRef.current) return
      const s = useZapretTestStore.getState()
      if (s.report || s.isRunning) return
      autoTestStartedRef.current = true
      zapretListStrategies()
        .then((list) => {
          if (list.length > 0) startTest()
        })
        .catch(() => void 0)
    }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const showBanner =
    !!updateInfo && updateInfo.hasUpdate && !updateInfo.dismissed && !!updateInfo.assetUrl

  const installUpdate = async (): Promise<void> => {
    if (installingRef.current || !updateInfo?.assetUrl) return
    installingRef.current = true
    setInstalling(true)
    const tId = toast.loading('Скачиваем сборку Zapret…', {
      description: updateInfo.assetName ?? `v${updateInfo.latest}`
    })
    try {
      const res = await zapretInstallUpdate(updateInfo.assetUrl, updateInfo.latest)
      toast.success('Zapret обновлён', {
        id: tId,
        description: `Версия ${res.installedVersion ?? updateInfo.latest} — стратегий: ${res.strategies}`,
        style: POWER_ON_BANNER_STYLE
      })
      refreshStrategies()
      if (zapret && active) {
        const fresh = await zapretListStrategies().catch(() => [])
        if (!fresh.some((s) => s.file === active)) {
          await patchAppConfig({ zapret: { ...zapret, activeStrategy: undefined } })
        }
      }
      const fresh = await zapretCheckUpdate(true).catch(() => null)
      setUpdateInfo(fresh)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error('Не удалось обновить Zapret', { id: tId, description: msg })
    } finally {
      setInstalling(false)
      installingRef.current = false
    }
  }

  const dismissUpdate = (): void => {
    if (!updateInfo?.latest) return
    void zapretDismissUpdate(updateInfo.latest).catch(() => void 0)
    setUpdateInfo({ ...updateInfo, dismissed: true })
  }

  const pickStrategy = async (file: string): Promise<void> => {
    const r = testReport?.results[file]
    if (r && r.tested && !r.passed) return
    if (isTestRunning) return
    await patchAppConfig({ zapret: { ...zapret!, activeStrategy: file } })
    if (status.state === 'running') {
      await zapretRestart().catch(() => void 0)
      toast.success(`Стратегия переключена: ${file.replace(/\.bat$/i, '')}`, {
        style: POWER_ON_BANNER_STYLE
      })
      return
    }
    if (!autoStartRef.current) return
    autoStartRef.current = false
    try {
      await zapretStart()
      navigate('/home')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error('Не удалось запустить Zapret', { description: msg })
    }
  }

  const handleToggleFavorite = async (
    e: React.MouseEvent,
    strategyFile: string
  ): Promise<void> => {
    e.stopPropagation()
    try {
      await zapretToggleFavorite(strategyFile)
      refreshStrategies()
      mutateAppConfig()
    } catch {
      // ignore
    }
  }

  const handleRunSettingsBenchmark = async (): Promise<void> => {
    if (benchmarking || isTestRunning) return
    if (!active) {
      toast.warning('Сначала выберите стратегию ниже')
      return
    }
    setBenchmarking(true)
    const tId = toast.loading(
      'Подбираем лучшую комбинацию IPset × Игровой фильтр для выбранной стратегии…'
    )
    try {
      const res = await zapretRunSettingsBenchmark()
      mutateAppConfig()
      toast.success(
        `Подобрано: IPset=${res.bestIpsetMode}, Игровой фильтр=${res.bestGameFilterMode} (оценка: ${res.bestScore}%)`,
        {
          id: tId,
          style: POWER_ON_BANNER_STYLE,
          duration: 6000
        }
      )
    } catch (e) {
      toast.error('Не удалось выполнить автоподбор параметров', {
        id: tId,
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setBenchmarking(false)
    }
  }

  const patchZapretField = async (patch: Partial<ZapretConfig>): Promise<void> => {
    if (!zapret) return
    await patchAppConfig({
      zapret: {
        ...zapret,
        ...patch
      }
    })
    if (status.state === 'running') {
      await zapretRestart().catch(() => void 0)
    }
  }

  const displayedStrategies = useMemo(() => {
    const list = onlyFavorites ? strategies.filter((s) => s.favorite) : [...strategies]
    return list.sort((a, b) => {
      if (Boolean(a.favorite) !== Boolean(b.favorite)) {
        return a.favorite ? -1 : 1
      }
      return 0
    })
  }, [strategies, onlyFavorites])

  return (
    <BasePage
      title="Zapret"
      header={
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/services')}
          className="h-8 text-xs gap-1.5"
        >
          <LayoutGrid className="size-3.5" />
          Сервисы и списки
        </Button>
      }
    >
      <div className="px-4 pb-6 space-y-4">
        {showBanner && updateInfo && (
          <div
            className={cn(
              'relative flex items-center gap-3 rounded-lg border border-stroke bg-card/70 backdrop-blur-xl px-4 py-3 transition',
              installing && 'pointer-events-none opacity-80'
            )}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
              {installing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-foreground">
                {installing
                  ? 'Устанавливаем Zapret…'
                  : `Доступно обновление Zapret — v${updateInfo.latest}`}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {installing
                  ? 'Останавливаем winws.exe, распаковываем архив…'
                  : `Текущая версия: v${updateInfo.installed ?? '?'}`}
              </div>
            </div>
            {!installing && (
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="ghost" size="sm" onClick={dismissUpdate}>
                  Позже
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    void installUpdate()
                  }}
                >
                  <Download className="h-3.5 w-3.5" />
                  Обновить
                </Button>
              </div>
            )}
          </div>
        )}

        <SwitcherCard
          icon={ZapretIcon}
          title="Обход DPI (Zapret)"
          subtitle={active ? active.replace(/\.bat$/i, '') : 'Выберите стратегию ниже'}
          version={zapret?.installedVersion ?? updateInfo?.installed ?? BUNDLED_ZAPRET_VERSION}
          status={status}
          disabled={isTestRunning || benchmarking}
          onToggle={(v) => {
            if (v && !active) return
            if (isTestRunning || benchmarking) return
            return (v ? zapretStart() : zapretStop()).catch(() => void 0)
          }}
          footer={
            isTestRunning
              ? 'Идёт тестирование стратегий — переключатель временно недоступен'
              : active
                ? null
                : 'Нужна стратегия'
          }
        />

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="w-full flex items-center justify-between rounded-2xl border border-border/35 bg-card/55 backdrop-blur-xl px-4 py-3 text-left text-xs text-muted-foreground hover:text-foreground transition cursor-pointer"
        >
          <span className="inline-flex items-center gap-2 font-medium text-foreground/90">
            <Sliders className="size-3.5 text-primary" />
            Дополнительные параметры (IPset, Игровой фильтр, QUIC, Списки IP)
          </span>
          {showAdvanced ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>

        {showAdvanced && (
          <div className="space-y-4">
            {/* Advanced DPI & Filter Settings Card */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Sliders className="h-4 w-4 text-muted-foreground" />
                    Режимы фильтрации и обхода
                  </CardTitle>
                </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleRunSettingsBenchmark()}
              disabled={benchmarking || isTestRunning || !active}
              title="Автоматически протестировать режимы IPset и Игрового фильтра на текущей стратегии"
            >
              {benchmarking ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 className="h-3.5 w-3.5" />
              )}
              Автоподбор режимов
            </Button>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* IPset Mode */}
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Режим IPset (фильтрация по IP-адресам)
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {IPSET_MODES.map((m) => {
                  const selected = (zapret?.ipsetMode ?? 'loaded') === m.id
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={isTestRunning || benchmarking}
                      onClick={() => void patchZapretField({ ipsetMode: m.id })}
                      className={cn(
                        'cursor-pointer text-left rounded-md border p-2.5 transition',
                        selected
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:bg-accent/30'
                      )}
                    >
                      <div className="text-xs font-medium">{m.label}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{m.desc}</div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Game Filter Mode */}
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Игровой фильтр (порты 1024–65535)
              </Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {GAME_FILTER_MODES.map((m) => {
                  const currentMode =
                    zapret?.gameFilterMode ?? (zapret?.gameFilter ? 'tcpudp' : 'disabled')
                  const selected = currentMode === m.id
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={isTestRunning || benchmarking}
                      onClick={() =>
                        void patchZapretField({
                          gameFilterMode: m.id,
                          gameFilter: m.id !== 'disabled'
                        })
                      }
                      className={cn(
                        'cursor-pointer text-left rounded-md border p-2.5 transition',
                        selected
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:bg-accent/30'
                      )}
                    >
                      <div className="text-xs font-medium">{m.label}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{m.desc}</div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* UDP Fake Payloads */}
            {binPayloads.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <Label className="text-xs">UDP Fake Payload (Discord / QUIC)</Label>
                  <select
                    value={zapret?.discordUdpFakeBin ?? 'quic_initial_www_google_com.bin'}
                    onChange={(e) =>
                      void patchZapretField({ discordUdpFakeBin: e.target.value })
                    }
                    className="w-full h-8 rounded-md border border-border bg-background/80 px-2 font-mono text-xs focus:border-primary focus:outline-none"
                  >
                    {binPayloads.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">UDP Fake Payload (Игры / Game Filter)</Label>
                  <select
                    value={zapret?.gameUdpFakeBin ?? 'quic_initial_www_google_com.bin'}
                    onChange={(e) => void patchZapretField({ gameUdpFakeBin: e.target.value })}
                    className="w-full h-8 rounded-md border border-border bg-background/80 px-2 font-mono text-xs focus:border-primary focus:outline-none"
                  >
                    {binPayloads.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* QUIC Block & VPN Coexistence */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="flex items-center justify-between rounded-md border border-border p-2.5">
                <div className="pr-2">
                  <div className="text-xs font-medium">Блокировать QUIC (UDP 443)</div>
                  <div className="text-[11px] text-muted-foreground">
                    Правило брандмауэра Windows для принудительного TLS поверх TCP
                  </div>
                </div>
                <Switch
                  checked={zapret?.blockQuic ?? false}
                  onCheckedChange={(v) => void patchZapretField({ blockQuic: v })}
                />
              </div>

              <div className="flex items-center justify-between rounded-md border border-border p-2.5">
                <div className="pr-2">
                  <div className="text-xs font-medium">Совместимость с VPN</div>
                  <div className="text-[11px] text-muted-foreground">
                    Автоматически исключать IP-адреса и UDP-порты активного VPN из перехвата WinDivert
                  </div>
                </div>
                <Switch
                  checked={zapret?.vpnCoexistence ?? true}
                  onCheckedChange={(v) => void patchZapretField({ vpnCoexistence: v })}
                />
              </div>
            </div>

            {(zapret?.vpnCoexistence ?? true) && (
              <div className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-background/40 p-2.5">
                <div className="flex-1 min-w-[200px] space-y-1">
                  <Label className="text-xs">
                    Исключённые UDP-порты VPN (через запятую или диапазон)
                  </Label>
                  <Input
                    value={zapret?.udpExcludePorts ?? '51820'}
                    onChange={(e) =>
                      patchAppConfig({
                        zapret: { ...zapret!, udpExcludePorts: e.target.value }
                      })
                    }
                    placeholder="51820, 1194, 4500"
                    className="h-8 font-mono text-xs"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

            <ZapretIpListCard
              disabled={isTestRunning || status.state === 'starting' || status.state === 'stopping'}
              disabledReason={
                isTestRunning
                  ? 'Идёт тестирование стратегий — управление списком временно недоступно'
                  : 'Подождите завершения переключения Zapret'
              }
            />
          </div>
        )}

        <Card>
          <CardHeader
            className={cn(
              'flex flex-row items-center justify-between gap-3 space-y-0',
              isTestRunning && 'flex-col items-stretch gap-3 sm:flex-row sm:items-center'
            )}
          >
            {isTestRunning ? (
              <div className="flex flex-1 min-w-0 items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium leading-tight">
                      Идёт тестирование стратегий под вашу сеть…
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {testProgress && testProgress.total ? (
                        <>
                          Стратегия{' '}
                          <span className="font-mono">
                            {testProgress.current ?? 0}/{testProgress.total}
                          </span>
                          {testProgress.strategy ? (
                            <>
                              {' — '}
                              <span className="font-mono">{testProgress.strategy}</span>
                            </>
                          ) : null}
                        </>
                      ) : (
                        'Подготовка целей из выбранных сервисов…'
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => void cancelTest()}
                  className="shrink-0"
                >
                  <Square className="h-3.5 w-3.5" />
                  Стоп
                </Button>
              </div>
            ) : (
              <>
                <CardTitle className="flex items-center gap-2">
                  Стратегии ({displayedStrategies.length})
                  {testReport ? (
                    <span className="text-xs font-normal text-muted-foreground">
                      {Object.values(testReport.results).filter((r) => r.passed).length}
                      {' / '}
                      {Object.keys(testReport.results).length} рабочих
                    </span>
                  ) : null}
                </CardTitle>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant={onlyFavorites ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setOnlyFavorites((v) => !v)}
                    title="Показать только избранные стратегии"
                  >
                    <Star className={cn('h-3.5 w-3.5', onlyFavorites && 'fill-current')} />
                    Избранные
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={startTest}
                    disabled={strategies.length === 0 || benchmarking}
                  >
                    <FlaskConical className="h-3.5 w-3.5" />
                    {testReport ? 'Перетестировать' : 'Запустить тест'}
                  </Button>
                </div>
              </>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {displayedStrategies.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {onlyFavorites ? (
                  'Нет избранных стратегий. Нажмите на звёздочку рядом с любой стратегией.'
                ) : (
                  <>
                    Сборка Zapret не найдена. Скопируйте содержимое{' '}
                    <code className="text-xs">Flowseal/zapret-discord-youtube</code> в{' '}
                    <code className="text-xs">%APPDATA%\ghosternet\runtime\zapret</code> или
                    встроенную папку <code className="text-xs">resources\zapret</code>.
                  </>
                )}
              </p>
            )}
            {displayedStrategies.map((s) => {
              const result = testReport?.results[s.file]
              const isFailed = !!result && result.tested && !result.passed
              const isPassed = !!result && result.tested && result.passed
              const isBest = testReport?.bestStrategy === s.file
              const disabled = isFailed || isTestRunning || benchmarking
              return (
                <div
                  key={s.file}
                  onClick={() => {
                    if (!disabled) void pickStrategy(s.file)
                  }}
                  role="button"
                  tabIndex={disabled ? -1 : 0}
                  onKeyDown={(e) => {
                    if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault()
                      void pickStrategy(s.file)
                    }
                  }}
                  aria-disabled={disabled}
                  title={
                    isFailed
                      ? `Не прошла тест (${result?.okCount ?? 0}/${result?.totalCount ?? 0} целей доступны). Нажмите «Перетестировать», чтобы повторить проверку.`
                      : isTestRunning
                        ? 'Тестирование стратегий — подождите окончания.'
                        : undefined
                  }
                  className={cn(
                    'group relative w-full text-left p-3 rounded-md border transition cursor-pointer',
                    active === s.file
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-accent/30',
                    disabled && 'opacity-45 grayscale cursor-not-allowed hover:bg-transparent'
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={(e) => void handleToggleFavorite(e, s.file)}
                      title={s.favorite ? 'Убрать из избранного' : 'В избранное'}
                      className={cn(
                        'shrink-0 p-1 rounded hover:bg-accent transition cursor-pointer',
                        s.favorite
                          ? 'text-amber-400'
                          : 'text-muted-foreground/40 hover:text-muted-foreground'
                      )}
                    >
                      <Star className={cn('h-4 w-4', s.favorite && 'fill-amber-400')} />
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm flex flex-wrap items-center gap-2">
                        <span className="truncate">{s.title}</span>
                        {s.modId && (
                          <span className="shrink-0 text-[10px] font-medium rounded px-1.5 py-0.5 bg-violet-500/20 text-violet-300">
                            Мод: {s.modName ?? s.modId}
                          </span>
                        )}
                        {isBest && (
                          <span className="shrink-0 text-[10px] uppercase tracking-wide font-semibold rounded px-1.5 py-0.5 bg-primary/20 text-primary">
                            лучшая
                          </span>
                        )}
                      </div>
                      {s.description && (
                        <div className="text-xs text-muted-foreground mt-0.5">{s.description}</div>
                      )}
                    </div>

                    {isFailed ? (
                      <span className="shrink-0 inline-flex items-center gap-1 text-[11px] text-red-400">
                        <XCircle className="h-3.5 w-3.5" />
                        {result?.okCount ?? 0}/{result?.totalCount ?? 0}
                      </span>
                    ) : isPassed ? (
                      <span className="shrink-0 inline-flex items-center gap-1.5 text-[11px] text-emerald-400">
                        {result?.score !== undefined ? (
                          <span className="font-mono text-muted-foreground">
                            {result.score}%
                          </span>
                        ) : null}
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {result?.okCount ?? 0}/{result?.totalCount ?? 0}
                      </span>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        {status.lastError && (
          <Card className="border" style={POWER_OFF_BANNER_STYLE}>
            <CardContent className="pt-4">
              <p className="text-sm">{status.lastError}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </BasePage>
  )
}

export default Zapret
