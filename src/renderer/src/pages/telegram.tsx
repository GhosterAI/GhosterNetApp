import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useTgwsStore } from '@renderer/store/tgws-store'
import {
  tgwsGetLink,
  tgwsStart,
  tgwsStop,
  tgwsRestart,
  tgwsRunTune,
  writeClipboard,
  openTelegramLink,
  tgwsCheckUpdate,
  tgwsInstallUpdate,
  tgwsDismissUpdate,
  tgwsPingDcs,
  type TgwsUpdateInfo,
  type TgwsTuneReport,
  type TelegramDcBenchmark
} from '@renderer/utils/ipc'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import {
  Copy,
  ExternalLink,
  MoreVertical,
  Download,
  Loader2,
  Sparkles,
  Wand2,
  Gauge,
  CheckCircle2,
  Globe,
  RefreshCw
} from 'lucide-react'
import TelegramIcon from '@renderer/components/telegram-icon'
import ReloadTgwsIcon from '@renderer/components/reload-tgws-icon'
import BasePage from '@renderer/components/base/base-page'
import SwitcherCard from '@renderer/components/switcher-card'
import { cn, POWER_ON_BANNER_STYLE, BUNDLED_TGWS_VERSION } from '@renderer/lib/utils'

const POWER_ON_TOAST_STYLE = POWER_ON_BANNER_STYLE

const MEDIA_MODES: { id: TgwsMediaMode; label: string; desc: string }[] = [
  {
    id: 'default',
    label: 'Стандартный (Все DC)',
    desc: 'Базовый маппинг DC2 + DC4 + Cloudflare мост для резервных соединений'
  },
  {
    id: 'media_fix',
    label: 'Ускорение медиа (DC 1–5)',
    desc: 'Прямые маршруты ко всем 5 датацентрам для быстрой загрузки видео, фото и звонков'
  },
  {
    id: 'empty',
    label: 'Свой список DC:IP',
    desc: 'Использовать только заданные вручную пары DC:IP без пресетов'
  }
]

function generateTgwsSecret(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

const TelegramPage: React.FC = () => {
  const status = useTgwsStore((s) => s.status)
  const { appConfig, patchAppConfig, mutateAppConfig } = useAppConfig()
  const [link, setLink] = useState('')
  const [tuningMode, setTuningMode] = useState<'fast' | 'full' | null>(null)
  const [tuneResult, setTuneResult] = useState<TgwsTuneReport | null>(null)

  const tgws = appConfig?.tgws

  useEffect(() => {
    tgwsGetLink().then(setLink).catch(() => setLink(''))
  }, [
    tgws?.host,
    tgws?.port,
    tgws?.secret,
    tgws?.fakeTlsDomain,
    status.state
  ])

  const running = status.state === 'running'

  // ---- Auto-update banner
  const [updateInfo, setUpdateInfo] = useState<TgwsUpdateInfo | null>(null)
  const [installing, setInstalling] = useState(false)
  const installingRef = useRef(false)

  // ---- DC Ping Benchmark
  const [dcBenchmarks, setDcBenchmarks] = useState<TelegramDcBenchmark[] | null>(null)
  const [benchmarkingDcs, setBenchmarkingDcs] = useState(false)

  const handlePingDcs = async (): Promise<void> => {
    if (benchmarkingDcs) return
    setBenchmarkingDcs(true)
    try {
      const results = await tgwsPingDcs()
      setDcBenchmarks(results)
      toast.success('Тест датацентров Telegram завершён', { style: POWER_ON_TOAST_STYLE })
    } catch (e) {
      toast.error('Не удалось измерить задержку до датацентров Telegram', {
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setBenchmarkingDcs(false)
    }
  }

  useEffect(() => {
    tgwsPingDcs().then(setDcBenchmarks).catch(() => void 0)
  }, [])

  useEffect(() => {
    tgwsCheckUpdate(false).then(setUpdateInfo).catch(() => setUpdateInfo(null))
  }, [])

  const showBanner =
    !!updateInfo && updateInfo.hasUpdate && !updateInfo.dismissed && !!updateInfo.assetUrl

  const installUpdate = async (): Promise<void> => {
    if (installingRef.current || !updateInfo?.assetUrl) return
    installingRef.current = true
    setInstalling(true)
    const tId = toast.loading('Скачиваем TgWsProxy…', {
      description: updateInfo.assetName ?? `v${updateInfo.latest}`
    })
    try {
      const res = await tgwsInstallUpdate(updateInfo.assetUrl, updateInfo.latest)
      const mb = (res.sizeBytes / (1024 * 1024)).toFixed(1)
      toast.success('TgWsProxy обновлён', {
        id: tId,
        description: `Версия ${res.installedVersion ?? updateInfo.latest} — ${mb} МБ`,
        style: POWER_ON_TOAST_STYLE
      })
      const fresh = await tgwsCheckUpdate(true).catch(() => null)
      setUpdateInfo(fresh)
      if (running) {
        try {
          await tgwsStart()
        } catch {
          /* user can retry from the toggle */
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error('Не удалось обновить TgWsProxy', { id: tId, description: msg })
    } finally {
      setInstalling(false)
      installingRef.current = false
    }
  }

  const dismissUpdate = (): void => {
    if (!updateInfo?.latest) return
    void tgwsDismissUpdate(updateInfo.latest).catch(() => void 0)
    setUpdateInfo({ ...updateInfo, dismissed: true })
  }

  const regeneratingRef = useRef(false)
  const [regenerating, setRegenerating] = useState(false)
  const handleRegenerateLink = async (): Promise<void> => {
    if (regeneratingRef.current || !tgws) return
    regeneratingRef.current = true
    setRegenerating(true)
    try {
      const newSecret = generateTgwsSecret()
      await patchAppConfig({ tgws: { ...tgws, secret: newSecret } })
      try {
        const updated = await tgwsGetLink()
        setLink(updated)
      } catch {
        setLink('')
      }
      if (running) {
        await tgwsRestart().catch(() => void 0)
      }
      toast.success('Ключ и ссылка изменены', { style: POWER_ON_TOAST_STYLE })
    } finally {
      setRegenerating(false)
      regeneratingRef.current = false
    }
  }

  const handleRunTune = async (mode: 'fast' | 'full'): Promise<void> => {
    if (tuningMode) return
    setTuningMode(mode)
    const tId = toast.loading(
      mode === 'fast'
        ? 'Быстрый подбор самого быстрого моста TgWsProxy…'
        : 'Полное тестирование мостов и датацентров DC1–DC5…'
    )
    try {
      const res = await tgwsRunTune(mode)
      setTuneResult(res)
      mutateAppConfig()
      toast.success(res.summary || 'Подбор настроек TgWsProxy завершён', {
        id: tId,
        description: res.bestBridgeDomain
          ? `Лучший мост: ${res.bestBridgeDomain} (${res.bestBridgeLatencyMs ?? '?'} мс)`
          : undefined,
        style: POWER_ON_TOAST_STYLE
      })
      if (running) {
        await tgwsRestart().catch(() => void 0)
      }
    } catch (e) {
      toast.error('Ошибка подбора моста', {
        id: tId,
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setTuningMode(null)
    }
  }

  const patchTgwsField = async (patch: Partial<TgwsConfig>, autoRestart = true): Promise<void> => {
    if (!tgws) return
    await patchAppConfig({ tgws: { ...tgws, ...patch } })
    if (autoRestart && running) {
      await tgwsRestart().catch(() => void 0)
    }
  }

  return (
    <BasePage title="Telegram">
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
                  ? 'Устанавливаем TgWsProxy…'
                  : `Доступно обновление TgWsProxy — v${updateInfo.latest}`}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {installing
                  ? 'Останавливаем прокси, перезаписываем бинарник…'
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
          icon={TelegramIcon}
          title="Telegram WS Proxy"
          subtitle={`${tgws?.host ?? '127.0.0.1'}:${tgws?.port ?? 1443}${
            tgws?.cfproxyWorkerDomain ? ` • ${tgws.cfproxyWorkerDomain}` : ''
          }`}
          version={tgws?.installedVersion ?? updateInfo?.installed ?? BUNDLED_TGWS_VERSION}
          status={status}
          onToggle={(v) => (v ? tgwsStart() : tgwsStop()).catch(() => void 0)}
          footer={running ? null : 'Нажмите для запуска'}
        />

        <Card>
          <CardHeader>
            <CardTitle>Подключение в Telegram</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Input readOnly value={link} className="font-mono text-xs" />
              <Button
                size="icon-sm"
                variant="outline"
                onClick={async () => {
                  if (!link) return
                  await writeClipboard(link)
                  toast.success('Ссылка скопирована', { style: POWER_ON_TOAST_STYLE })
                }}
                title="Копировать ссылку"
              >
                <Copy className="size-4" />
              </Button>
              <Button
                size="icon-sm"
                variant="outline"
                onClick={() => link && openTelegramLink(link).catch(() => void 0)}
                title="Открыть в Telegram"
              >
                <ExternalLink className="size-4" />
              </Button>
              <Button
                size="icon-sm"
                variant="outline"
                onClick={handleRegenerateLink}
                disabled={regenerating}
                title="Сменить ключ и ссылку"
              >
                {regenerating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ReloadTgwsIcon className="size-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground inline-flex flex-wrap items-center gap-x-1 gap-y-0.5">
              Вставьте ссылку в Telegram
              <span className="opacity-70">&rarr;</span>
              Настройки
              <span className="opacity-70">&rarr;</span>
              Продвинутые настройки
              <span className="opacity-70">&rarr;</span>
              Тип соединения
              <span className="opacity-70">&rarr;</span>
              <MoreVertical className="size-3.5 translate-y-px -mx-1.5" />
              <span>или нажмите на</span>
              <ExternalLink className="size-3.5 translate-y-px" />
              <span>для автоматического подключения.</span>
            </p>
          </CardContent>
        </Card>

        {/* Telegram DC Ping Benchmark Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-sky-400" />
                Спидтест датацентров Telegram (DC Ping & Benchmark)
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Измерение задержки ко всем 5 ключевым датацентрам Telegram (DC1–DC5) и авто-рекомендация наилучшего DC для медиа.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handlePingDcs()}
              disabled={benchmarkingDcs}
            >
              <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', benchmarkingDcs && 'animate-spin')} />
              Запустить тест DC
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
              {(dcBenchmarks ?? [
                { id: 1, name: 'DC1', location: 'Майами (США)', ip: '149.154.175.50', latencyMs: 0, ok: false, recommended: false },
                { id: 2, name: 'DC2', location: 'Амстердам (Европа)', ip: '149.154.167.220', latencyMs: 0, ok: false, recommended: true },
                { id: 3, name: 'DC3', location: 'Майами (США)', ip: '149.154.175.100', latencyMs: 0, ok: false, recommended: false },
                { id: 4, name: 'DC4', location: 'Амстердам (Европа)', ip: '149.154.167.220', latencyMs: 0, ok: false, recommended: false },
                { id: 5, name: 'DC5', location: 'Сингапур (Азия)', ip: '91.108.56.165', latencyMs: 0, ok: false, recommended: false }
              ]).map((dc) => (
                <div
                  key={dc.id}
                  className={cn(
                    'relative rounded-lg border p-3 flex flex-col justify-between transition-all',
                    dc.recommended && dcBenchmarks
                      ? 'border-emerald-500/60 bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                      : 'border-border bg-card/40'
                  )}
                >
                  {dc.recommended && dcBenchmarks && (
                    <div className="absolute -top-2.5 right-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500 text-black shadow-sm">
                      ЛУЧШИЙ DC
                    </div>
                  )}
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-foreground">{dc.name}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">{dc.ip}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{dc.location}</div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-border/40 flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Пинг:</span>
                    <span
                      className={cn(
                        'font-mono text-xs font-semibold px-2 py-0.5 rounded',
                        dcBenchmarks
                          ? dc.ok
                            ? dc.latencyMs < 90
                              ? 'text-emerald-400 bg-emerald-500/10'
                              : 'text-amber-400 bg-amber-500/10'
                            : 'text-red-400 bg-red-500/10'
                          : 'text-muted-foreground'
                      )}
                    >
                      {dcBenchmarks ? (dc.ok ? `${dc.latencyMs} мс` : 'Блок') : '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Auto-Tune & Bridge Selection Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-muted-foreground" />
                Автоподбор WS-моста и режима медиа
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Проверка задержки TLS/WebSocket до мостов из{' '}
                <code className="text-[11px]">cfproxy-domains.txt</code> и датацентров Telegram
                (DC1–DC5).
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleRunTune('fast')}
                disabled={tuningMode !== null}
              >
                {tuningMode === 'fast' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wand2 className="h-3.5 w-3.5" />
                )}
                Быстрый подбор
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleRunTune('full')}
                disabled={tuningMode !== null}
              >
                {tuningMode === 'full' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Gauge className="h-3.5 w-3.5" />
                )}
                Полный тест
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {tuneResult && (
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-medium text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  {tuneResult.summary}
                </div>
                <div className="text-foreground/90">
                  Лучший мост:{' '}
                  <code className="font-mono font-semibold">
                    {tuneResult.bestBridgeDomain ?? 'не найден'}
                  </code>{' '}
                  ({tuneResult.bestBridgeLatencyMs ?? '—'} мс)
                  {tuneResult.directLatencyMs
                    ? ` • Прямой DC: ${tuneResult.directLatencyMs} мс`
                    : ''}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Режим маршрутизации медиа и датацентров
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {MEDIA_MODES.map((m) => {
                  const selected = (tgws?.mediaMode ?? 'default') === m.id
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => void patchTgwsField({ mediaMode: m.id })}
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Cloudflare / WS-мост (cfproxy-user-domain)</Label>
                <Input
                  value={tgws?.cfproxyUserDomain || tgws?.cfproxyWorkerDomain || ''}
                  onChange={(e) =>
                    void patchTgwsField(
                      {
                        cfproxyUserDomain: e.target.value.trim(),
                        cfproxyWorkerDomain: e.target.value.trim()
                      },
                      false
                    )
                  }
                  placeholder="Автоматически (из cfproxy-domains.txt)"
                  className="font-mono text-xs h-8"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Домен Fake-TLS (опционально, для ee-секрета)</Label>
                <Input
                  value={tgws?.fakeTlsDomain ?? ''}
                  onChange={(e) =>
                    void patchTgwsField({ fakeTlsDomain: e.target.value.trim() }, false)
                  }
                  placeholder="По умолчанию выкл. (dd-секрет)"
                  className="font-mono text-xs h-8"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="flex items-center justify-between rounded-md border border-border p-2.5">
                <div className="pr-2">
                  <div className="text-xs font-medium">Отключить HTTP/2 (--no-h2)</div>
                  <div className="text-[11px] text-muted-foreground">
                    Принудительно использовать HTTP/1.1 для WebSocket Upgrade
                  </div>
                </div>
                <Switch
                  checked={tgws?.disableH2 ?? false}
                  onCheckedChange={(v) => void patchTgwsField({ disableH2: v })}
                />
              </div>

              <div className="flex items-center justify-between rounded-md border border-border p-2.5">
                <div className="pr-2">
                  <div className="text-xs font-medium">Режим без TLS на порту 80 (--no-secure)</div>
                  <div className="text-[11px] text-muted-foreground">
                    Подключаться к WS-мосту по открытому HTTP (порт 80)
                  </div>
                </div>
                <Switch
                  checked={tgws?.disableSecure ?? false}
                  onCheckedChange={(v) => void patchTgwsField({ disableSecure: v })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Сетевые параметры</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-4">
            <div className="space-y-1.5">
              <Label>Локальный хост</Label>
              <Input
                value={tgws?.host ?? ''}
                onChange={(e) => patchAppConfig({ tgws: { ...tgws!, host: e.target.value } })}
                placeholder="127.0.0.1"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Локальный порт</Label>
              <Input
                type="number"
                value={tgws?.port ?? 1443}
                onChange={(e) =>
                  patchAppConfig({ tgws: { ...tgws!, port: Number(e.target.value) || 1443 } })
                }
              />
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label>Секретный ключ (32-hex MTProto)</Label>
              <Input
                value={tgws?.secret ?? ''}
                onChange={(e) =>
                  patchAppConfig({ tgws: { ...tgws!, secret: e.target.value.trim() } })
                }
                className="font-mono text-xs"
              />
            </div>
            {tgws?.mediaMode === 'empty' && (
              <div className="md:col-span-2 space-y-1.5">
                <Label>Пары Датацентр:IP (по одной на строке, формат DC:IP)</Label>
                <textarea
                  value={(tgws?.dcIp ?? []).join('\n')}
                  onChange={(e) => {
                    const lines = e.target.value
                      .split(/\r?\n/)
                      .map((l) => l.trim())
                      .filter(Boolean)
                    void patchTgwsField({ dcIp: lines }, false)
                  }}
                  rows={4}
                  placeholder={'2:149.154.167.220\n4:149.154.167.220'}
                  className="w-full rounded-md border border-border bg-background/60 p-2 font-mono text-xs focus:border-primary focus:outline-none"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {status.lastError && (
          <Card className="border-red-500/50">
            <CardContent className="pt-4">
              <p className="text-sm text-red-500">{status.lastError}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </BasePage>
  )
}

export default TelegramPage
