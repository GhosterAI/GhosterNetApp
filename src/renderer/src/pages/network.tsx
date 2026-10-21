import React, { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Blocks,
  CheckCircle2,
  FolderArchive,
  Globe2,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Trash2,
  Wrench,
  XCircle,
  Download,
  ArrowUpCircle,
  X,
  Activity,
  Check,
  ChevronDown,
  ChevronUp,
  Sliders
} from 'lucide-react'
import BasePage from '@renderer/components/base/base-page'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { cn, POWER_ON_BANNER_STYLE } from '@renderer/lib/utils'
import {
  dnsListPresets,
  dnsGetStatus,
  dnsApplyConfig,
  dnsResetDhcp,
  dnsAiGetStatus,
  dnsAiEnable,
  dnsAiDisable,
  dnsAiSetSettings,
  dnsAiInstallService,
  dnsAiUninstallService,
  dnsAiTestDoh,
  dnsAiCheckServices,
  dnsAiCheckUpdate,
  dnsAiInstallUpdate,
  dnsAiDismissUpdate,
  dnsAiFixGemini,
  type DnsAiUpdateInfo,
  modsList,
  modsToggle,
  modsRemove,
  modsImportZip,
  diagnosticsRun,
  diagnosticsFix,
  diagnosticsClearDiscordCache,
  diagnosticsAutoFix,
  diagnosticsLiveServices,
  type AutoFixReport,
  type LiveServiceStatus,
  type DnsPresetDescriptor,
  type DnsManagerStatus,
  type DnsAiStatus,
  type DnsAiServiceCheckResult
} from '@renderer/utils/ipc'

const NetworkPage: React.FC = () => {
  const { appConfig, patchAppConfig, mutateAppConfig } = useAppConfig()
  const dnsCfg = appConfig?.dns

  // DNS-AI state
  const [dnsAi, setDnsAi] = useState<DnsAiStatus | null>(null)
  const [dnsAiBusy, setDnsAiBusy] = useState(false)
  const [dohTestOutput, setDohTestOutput] = useState<string | null>(null)
  const [dohTesting, setDohTesting] = useState(false)
  const [aiChecks, setAiChecks] = useState<DnsAiServiceCheckResult[] | null>(null)
  const [aiChecking, setAiChecking] = useState(false)
  const [dnsAiUpdate, setDnsAiUpdate] = useState<DnsAiUpdateInfo | null>(null)
  const [dnsAiUpdating, setDnsAiUpdating] = useState(false)
  const [dnsAiUpdateDismissed, setDnsAiUpdateDismissed] = useState(false)
  const [geminiFixBusy, setGeminiFixBusy] = useState(false)

  // DNS state
  const [presets, setPresets] = useState<DnsPresetDescriptor[]>([])
  const [dnsStatus, setDnsStatus] = useState<DnsManagerStatus | null>(null)
  const [dnsBusy, setDnsBusy] = useState(false)

  // Mods state
  const [mods, setMods] = useState<InstalledMod[]>([])
  const [modsBusy, setModsBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Diagnostics state
  const [checks, setChecks] = useState<DiagnosticCheckItem[]>([])
  const [diagLoading, setDiagLoading] = useState(false)
  const [fixingId, setFixingId] = useState<string | null>(null)
  const [clearingDiscord, setClearingDiscord] = useState(false)
  const [autoFixing, setAutoFixing] = useState(false)
  const [autoFixReport, setAutoFixReport] = useState<AutoFixReport | null>(null)
  const [liveServices, setLiveServices] = useState<LiveServiceStatus[] | null>(null)
  const [liveChecking, setLiveChecking] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const refreshDnsAi = async (): Promise<void> => {
    try {
      const st = await dnsAiGetStatus()
      setDnsAi(st)
    } catch {
      // ignore
    }
  }

  const refreshDns = async (): Promise<void> => {
    try {
      const [p, stat] = await Promise.all([
        dnsListPresets(),
        dnsGetStatus().catch(() => null)
      ])
      setPresets(p)
      if (stat) setDnsStatus(stat)
    } catch {
      // ignore
    }
  }

  const refreshMods = async (): Promise<void> => {
    try {
      const list = await modsList()
      setMods(list)
    } catch {
      setMods([])
    }
  }

  const runDiag = async (): Promise<void> => {
    setDiagLoading(true)
    try {
      const res = await diagnosticsRun()
      setChecks(res)
    } catch {
      // ignore
    } finally {
      setDiagLoading(false)
    }
  }

  const runCheckLiveServices = async (): Promise<void> => {
    if (liveChecking) return
    setLiveChecking(true)
    try {
      const list = await diagnosticsLiveServices()
      setLiveServices(list)
    } catch {
      // ignore
    } finally {
      setLiveChecking(false)
    }
  }

  useEffect(() => {
    void refreshDnsAi()
    void refreshDns()
    void refreshMods()
    void runDiag()
    void runCheckLiveServices()
    dnsAiCheckUpdate(false)
      .then(setDnsAiUpdate)
      .catch(() => setDnsAiUpdate(null))
  }, [])

  const handleInstallDnsAiUpdate = async (): Promise<void> => {
    if (!dnsAiUpdate?.assetUrl || dnsAiUpdating) return
    setDnsAiUpdating(true)
    try {
      const res = await dnsAiInstallUpdate(dnsAiUpdate.assetUrl, dnsAiUpdate.latest)
      toast.success(`DNS-AI успешно обновлён до v${res.installedVersion ?? dnsAiUpdate.latest}!`, {
        description: `Размер: ${(res.sizeBytes / 1024 / 1024).toFixed(1)} МБ`,
        style: POWER_ON_BANNER_STYLE
      })
      const fresh = await dnsAiCheckUpdate(true).catch(() => null)
      setDnsAiUpdate(fresh)
      await refreshDnsAi()
    } catch (e) {
      toast.error('Не удалось обновить DNS-AI', {
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setDnsAiUpdating(false)
    }
  }

  const handleDismissDnsAiUpdate = (): void => {
    setDnsAiUpdateDismissed(true)
    if (dnsAiUpdate?.latest) {
      void dnsAiDismissUpdate(dnsAiUpdate.latest).catch(() => void 0)
    }
  }

  const handleToggleDnsAi = async (): Promise<void> => {
    if (dnsAiBusy) return
    setDnsAiBusy(true)
    const enabling = !dnsAi?.enabled
    const tId = toast.loading(
      enabling
        ? 'Включаем шифрованный резолвер DNS-AI…'
        : 'Отключаем DNS-AI и восстанавливаем системный DNS…'
    )
    try {
      const st = enabling ? await dnsAiEnable() : await dnsAiDisable()
      setDnsAi(st)
      if (enabling && st.enabled) {
        toast.success(
          `DNS-AI включён (режим: ${st.settings.mode === 'native' ? 'Native DoH Win11' : 'Локальный DoH-прокси 127.0.0.1:53'})`,
          {
            id: tId,
            style: POWER_ON_BANNER_STYLE
          }
        )
      } else {
        toast.success('DNS-AI отключён, настройки адаптеров восстановлены', { id: tId })
      }
      void refreshDns()
    } catch (e) {
      toast.error('Ошибка управления DNS-AI', {
        id: tId,
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setDnsAiBusy(false)
    }
  }

  const handleDnsAiPatchSettings = async (
    partial: Partial<DnsAiStatus['settings']>
  ): Promise<void> => {
    if (dnsAiBusy) return
    setDnsAiBusy(true)
    try {
      const st = await dnsAiSetSettings(partial)
      setDnsAi(st)
      toast.success('Настройки DNS-AI обновлены')
    } catch (e) {
      toast.error('Не удалось сохранить настройки DNS-AI', {
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setDnsAiBusy(false)
    }
  }

  const handleTestDoh = async (): Promise<void> => {
    if (dohTesting) return
    setDohTesting(true)
    const tId = toast.loading('Проверяем узлы DoH dns.dns-ai.ru…')
    try {
      const res = await dnsAiTestDoh('proto.dns-ai.ru', 'TXT')
      setDohTestOutput(res.output)
      if (res.ok) {
        toast.success(`DoH отвечает (${res.latencyMs} мс)`, {
          id: tId,
          style: POWER_ON_BANNER_STYLE
        })
      } else {
        toast.warning('Проверка завершена с предупреждениями', { id: tId })
      }
    } catch (e) {
      toast.error('Ошибка проверки DoH', {
        id: tId,
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setDohTesting(false)
    }
  }

  const handleCheckAiServices = async (): Promise<void> => {
    if (aiChecking) return
    setAiChecking(true)
    const tId = toast.loading('Проверяем доступность ИИ-сервисов (Gemini, ChatGPT, Claude)…')
    try {
      const res = await dnsAiCheckServices()
      setAiChecks(res)
      const geminiOk = res.find((r) => r.domain.includes('gemini'))?.httpOk
      if (geminiOk) {
        toast.success('Google Gemini и ИИ-сервисы доступны!', {
          id: tId,
          style: POWER_ON_BANNER_STYLE
        })
      } else {
        toast.info('Проверка ИИ-сервисов завершена', { id: tId })
      }
    } catch (e) {
      toast.error('Ошибка проверки ИИ-сервисов', {
        id: tId,
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setAiChecking(false)
    }
  }

  const handleFixGemini = async (): Promise<void> => {
    if (geminiFixBusy) return
    setGeminiFixBusy(true)
    const tId = toast.loading('Применяем автонастройку Gemini в hosts…')
    try {
      const res = await dnsAiFixGemini()
      toast.success(`Google Gemini настроен (${res.entryCount} записей в hosts)`, {
        id: tId,
        description: 'Отключите «Безопасный DNS» в браузере и перезапустите его.',
        style: POWER_ON_BANNER_STYLE
      })
    } catch (e) {
      toast.error('Не удалось применить автонастройку Gemini', {
        id: tId,
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setGeminiFixBusy(false)
    }
  }

  const handleDnsAiServiceToggle = async (): Promise<void> => {
    if (dnsAiBusy) return
    setDnsAiBusy(true)
    const installing = !dnsAi?.serviceInstalled
    const tId = toast.loading(
      installing ? 'Устанавливаем службу DnsAiClient…' : 'Удаляем службу DnsAiClient…'
    )
    try {
      const st = installing ? await dnsAiInstallService() : await dnsAiUninstallService()
      setDnsAi(st)
      toast.success(
        installing ? 'Служба DnsAiClient установлена и запущена' : 'Служба DnsAiClient удалена',
        { id: tId, style: installing ? POWER_ON_BANNER_STYLE : undefined }
      )
    } catch (e) {
      toast.error('Ошибка управления службой DnsAiClient', {
        id: tId,
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setDnsAiBusy(false)
    }
  }

  const selectedPreset = dnsCfg?.presetId ?? dnsStatus?.presetId ?? 'cloudflare'

  const handleSelectPreset = async (id: string): Promise<void> => {
    await patchAppConfig({
      dns: {
        presetId: id,
        primary: dnsCfg?.primary ?? '',
        secondary: dnsCfg?.secondary ?? '',
        dohUrl: dnsCfg?.dohUrl ?? '',
        active: dnsCfg?.active ?? false
      }
    })
  }

  const handleApplyDns = async (): Promise<void> => {
    if (dnsBusy) return
    setDnsBusy(true)
    const tId = toast.loading('Применяем настройки DNS на активных адаптерах…')
    try {
      const status = await dnsApplyConfig({
        presetId: selectedPreset,
        primary: dnsCfg?.primary ?? '',
        secondary: dnsCfg?.secondary ?? '',
        dohUrl: dnsCfg?.dohUrl ?? ''
      })
      setDnsStatus(status)
      mutateAppConfig()
      toast.success(`DNS применён (${status.primary}${status.secondary ? `, ${status.secondary}` : ''})`, {
        id: tId,
        style: POWER_ON_BANNER_STYLE
      })
    } catch (e) {
      toast.error('Не удалось применить DNS', {
        id: tId,
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setDnsBusy(false)
    }
  }

  const handleResetDns = async (): Promise<void> => {
    if (dnsBusy) return
    setDnsBusy(true)
    const tId = toast.loading('Сбрасываем DNS на автоматический (DHCP)…')
    try {
      const status = await dnsResetDhcp()
      setDnsStatus(status)
      mutateAppConfig()
      toast.success('DNS сброшен на DHCP по умолчанию', { id: tId })
    } catch (e) {
      toast.error('Не удалось сбросить DNS', {
        id: tId,
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setDnsBusy(false)
    }
  }

  const handleToggleMod = async (modId: string, enabled: boolean): Promise<void> => {
    try {
      const list = await modsToggle(modId, enabled)
      setMods(list)
      mutateAppConfig()
      toast.success(enabled ? 'Мод подключён к Zapret' : 'Мод отключён', {
        style: enabled ? POWER_ON_BANNER_STYLE : undefined
      })
    } catch (e) {
      toast.error('Не удалось переключить мод', {
        description: e instanceof Error ? e.message : String(e)
      })
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || modsBusy) return
    setModsBusy(true)
    const tId = toast.loading(`Импортируем мод ${file.name}…`)
    try {
      const buf = new Uint8Array(await file.arrayBuffer())
      const list = await modsImportZip(buf, file.name)
      setMods(list)
      mutateAppConfig()
      toast.success('Мод успешно импортирован и подключён', {
        id: tId,
        style: POWER_ON_BANNER_STYLE
      })
    } catch (err) {
      toast.error('Ошибка импорта мода', {
        id: tId,
        description: err instanceof Error ? err.message : String(err)
      })
    } finally {
      setModsBusy(false)
    }
  }

  const handleRemoveMod = async (modId: string): Promise<void> => {
    try {
      const list = await modsRemove(modId)
      setMods(list)
      mutateAppConfig()
      toast.success('Мод удалён')
    } catch (e) {
      toast.error('Не удалось удалить мод', {
        description: e instanceof Error ? e.message : String(e)
      })
    }
  }

  const handleFixIssue = async (checkId: string): Promise<void> => {
    if (fixingId) return
    setFixingId(checkId)
    const tId = toast.loading('Выполняем исправление…')
    try {
      const updatedChecks = await diagnosticsFix(checkId)
      setChecks(updatedChecks)
      toast.success('Исправление выполнено', { id: tId, style: POWER_ON_BANNER_STYLE })
    } catch (e) {
      toast.error('Не удалось выполнить исправление', {
        id: tId,
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setFixingId(null)
    }
  }

  const handleClearDiscordCache = async (): Promise<void> => {
    if (clearingDiscord) return
    setClearingDiscord(true)
    const tId = toast.loading('Очищаем кэш Discord…')
    try {
      const res = await diagnosticsClearDiscordCache()
      if (res.cleanedDirs === 0) {
        toast.info('Папки кэша Discord уже чисты или не найдены', { id: tId })
      } else {
        toast.success(`Кэш Discord очищен (освобождено ${res.freedMb.toFixed(1)} МБ)`, {
          id: tId,
          style: POWER_ON_BANNER_STYLE
        })
      }
    } catch (e) {
      toast.error('Не удалось очистить кэш Discord', {
        id: tId,
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setClearingDiscord(false)
    }
  }

  const handleAutoFix = async (): Promise<void> => {
    if (autoFixing) return
    setAutoFixing(true)
    const tId = toast.loading('Доктор сети: комплексное устранение неполадок…')
    try {
      const rep = await diagnosticsAutoFix()
      setAutoFixReport(rep)
      toast.success(
        `Сеть успешно восстановлена! (${rep.actions.length} действий${
          rep.discordFreedMb > 0 ? `, кэш Discord: ${rep.discordFreedMb} МБ` : ''
        })`,
        { id: tId, style: POWER_ON_BANNER_STYLE }
      )
      await runDiag()
      await runCheckLiveServices()
    } catch (e) {
      toast.error('Не удалось автоматически восстановить сеть', {
        id: tId,
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setAutoFixing(false)
    }
  }

  const adapters = dnsStatus?.adapters ?? []

  return (
    <BasePage
      title="Сеть и DNS"
      header={
        <Button
          size="sm"
          variant="default"
          onClick={() => void handleAutoFix()}
          disabled={autoFixing}
          className="h-8 text-xs gap-1.5"
        >
          {autoFixing ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          Починить сеть в 1 клик
        </Button>
      }
    >
      <div className="px-4 pb-6 space-y-4">
        {dnsAiUpdate?.hasUpdate && !dnsAiUpdate.dismissed && !dnsAiUpdateDismissed && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-foreground shadow-sm">
            <div className="flex items-center gap-3">
              <div className="size-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                <ArrowUpCircle className="size-4" />
              </div>
              <div>
                <div className="text-sm font-semibold flex items-center gap-2">
                  Доступно обновление DNS-AI — v{dnsAiUpdate.latest}
                  <span className="text-xs font-mono text-muted-foreground">
                    (текущая: v{dnsAiUpdate.installed ?? '1.0.0'})
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Новый релиз DNS-AI доступен на GitHub. Обновите бинарник службы в один клик.
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              <Button
                size="sm"
                disabled={dnsAiUpdating || !dnsAiUpdate.assetUrl}
                onClick={() => void handleInstallDnsAiUpdate()}
                className="h-8 gap-1.5 bg-amber-500 text-black hover:bg-amber-400 text-xs font-medium"
              >
                {dnsAiUpdating ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                <span>Обновить сейчас</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDismissDnsAiUpdate}
                className="h-8 size-8 p-0 text-muted-foreground hover:text-foreground"
                title="Скрыть"
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>
        )}

        {/* DNS-AI Encrypted DoH Card */}
        <Card className={cn(dnsAi?.enabled && 'border-emerald-500/40')}>
          <CardHeader className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                DNS-AI (Шифрованный DoH для AI-сервисов)
                {dnsAi?.enabled ? (
                  <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                    Активен ({dnsAi.settings.mode === 'native' ? 'Native DoH' : 'Stub 127.0.0.1:53'})
                  </span>
                ) : (
                  <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    Отключён
                  </span>
                )}
                {dnsAi?.serviceInstalled && (
                  <span className="rounded bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                    Служба Windows {dnsAi.serviceRunning ? 'запущена' : 'установлена'}
                  </span>
                )}
              </CardTitle>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleCheckAiServices()}
                  disabled={aiChecking}
                >
                  {aiChecking ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Globe2 className="h-3.5 w-3.5 text-emerald-400" />
                  )}
                  Проверить ИИ
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleTestDoh()}
                  disabled={dohTesting}
                >
                  {dohTesting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  Тест DoH
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void refreshDnsAi()}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Шифрованный DNS-over-HTTPS / DNS-over-TLS клиент{' '}
              <code className="text-foreground">dns.dns-ai.ru</code> для доступа к ChatGPT, Claude,
              Gemini, Copilot и Google AI без VPN. Автоматически сохраняет и восстанавливает исходные
              настройки сетевых адаптеров.
            </p>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => void handleDnsAiPatchSettings({ mode: 'stub' })}
                disabled={dnsAiBusy}
                className={cn(
                  'cursor-pointer text-left rounded-lg border p-3 transition',
                  (dnsAi?.settings?.mode ?? 'stub') === 'stub'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-accent/30'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm">Локальный прокси (Stub 127.0.0.1:53)</span>
                  <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                    Win 10 / 11
                  </span>
                </div>
                <div className="mt-1 font-mono text-xs text-foreground/80">
                  127.0.0.1:53 → {dnsAi?.endpoints?.dohUrl || 'https://dns.dns-ai.ru/dns-query'}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Локальный DoH/DoT-резолвер с кэшированием и защитой от перехвата провайдером
                </p>
              </button>

              <button
                type="button"
                onClick={() => void handleDnsAiPatchSettings({ mode: 'native' })}
                disabled={dnsAiBusy || (dnsAi != null && !dnsAi.nativeSupported)}
                className={cn(
                  'cursor-pointer text-left rounded-lg border p-3 transition',
                  dnsAi?.settings?.mode === 'native'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-accent/30',
                  dnsAi != null && !dnsAi.nativeSupported && 'opacity-50 cursor-not-allowed'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm">Нативный DoH Windows 11</span>
                  <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    Win 11+
                  </span>
                </div>
                <div className="mt-1 font-mono text-xs text-foreground/80">
                  {dnsAi?.endpoints?.ipv4?.join(' / ') || '186.246.49.127 / 192.144.59.14'}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Прямая регистрация шаблона DoH в системном DNS-клиенте Windows 11
                </p>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2">
                <div>
                  <div className="text-xs font-medium">Поддержка IPv6</div>
                  <div className="text-[11px] text-muted-foreground">
                    Настраивать также IPv6-резолверы (::1 / {dnsAi?.endpoints?.ipv6?.[0] || '2a0a:2b41::53'})
                  </div>
                </div>
                <Switch
                  checked={Boolean(dnsAi?.settings?.ipv6)}
                  disabled={dnsAiBusy}
                  onCheckedChange={(v) => void handleDnsAiPatchSettings({ ipv6: v })}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2">
                <div>
                  <div className="text-xs font-medium">Применять к VPN-адаптерам</div>
                  <div className="text-[11px] text-muted-foreground">
                    Включать виртуальные и туннельные интерфейсы при смене DNS
                  </div>
                </div>
                <Switch
                  checked={Boolean(dnsAi?.settings?.include_vpn_adapters)}
                  disabled={dnsAiBusy}
                  onCheckedChange={(v) => void handleDnsAiPatchSettings({ include_vpn_adapters: v })}
                />
              </div>
            </div>

            {dohTestOutput && (
              <div className="rounded-lg border border-border bg-background/60 p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    Результат проверки DoH-узлов (proto.dns-ai.ru):
                  </span>
                  <button
                    type="button"
                    onClick={() => setDohTestOutput(null)}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Скрыть
                  </button>
                </div>
                <pre className="text-[11px] font-mono whitespace-pre-wrap text-foreground/90 max-h-40 overflow-y-auto">
                  {dohTestOutput}
                </pre>
              </div>
            )}

            {aiChecks && (
              <div className="rounded-lg border border-border bg-background/60 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">
                    Доступность ИИ-сервисов через DNS-AI:
                  </span>
                  <button
                    type="button"
                    onClick={() => setAiChecks(null)}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Скрыть
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {aiChecks.map((check) => (
                    <div
                      key={check.domain}
                      className={cn(
                        'rounded border p-2.5 text-xs space-y-1',
                        check.httpOk
                          ? 'border-emerald-500/40 bg-emerald-500/10'
                          : check.dnsOk
                            ? 'border-amber-500/40 bg-amber-500/10'
                            : 'border-destructive/40 bg-destructive/10'
                      )}
                    >
                      <div className="flex items-center justify-between font-medium">
                        <span>{check.name}</span>
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                            check.httpOk
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : check.dnsOk
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'bg-destructive/20 text-destructive'
                          )}
                        >
                          {check.httpOk
                            ? `Доступен (${check.statusCode || 200})`
                            : check.dnsOk
                              ? check.statusCode ? `Ответ HTTP ${check.statusCode}` : 'DNS OK, соединение...'
                              : 'DNS ошибка'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                        <span>{check.domain} → {check.ip || '—'}</span>
                        <span>{check.latencyMs} мс</span>
                      </div>
                      {check.error && (
                        <div className="text-[10px] text-destructive break-all">{check.error}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold flex items-center gap-1.5 text-primary">
                  <Sparkles className="h-4 w-4" />
                  Автонастройка доступа к Google Gemini:
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs bg-primary/10 hover:bg-primary/20 border-primary/30 text-primary cursor-pointer gap-1.5"
                  disabled={geminiFixBusy}
                  onClick={() => void handleFixGemini()}
                >
                  {geminiFixBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Wrench className="h-3.5 w-3.5" />
                  )}
                  Применить автофикс Gemini
                </Button>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-[11px] text-muted-foreground">
                <li>
                  Прописывает проверенные скоростные SNI-адреса для всех поддоменов Gemini и AI Studio (132.243.112.221) в системный файл <code>hosts</code>.
                </li>
                <li>
                  <strong>Отключите «Безопасный DNS» в браузере:</strong> Настройки браузера → Конфиденциальность → Безопасность → выключите «Использовать безопасный DNS», чтобы браузер обращался через системный файл hosts.
                </li>
                <li>
                  <strong>Сбросьте кэш сокетов:</strong> перезапустите браузер или откройте вкладку в Режиме Инкогнито, чтобы сбросить старое соединение.
                </li>
              </ul>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={dnsAi?.enabled ? 'destructive' : 'default'}
                  onClick={() => void handleToggleDnsAi()}
                  disabled={dnsAiBusy || !dnsAi?.available}
                >
                  {dnsAiBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-3.5 w-3.5" />
                  )}
                  {dnsAi?.enabled ? 'Отключить DNS-AI' : 'Включить DNS-AI'}
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleDnsAiServiceToggle()}
                  disabled={dnsAiBusy || !dnsAi?.available}
                >
                  {dnsAi?.serviceInstalled ? 'Удалить службу Windows' : 'Установить службу автозапуска'}
                </Button>
              </div>

              {dnsAi?.stubRunning && (
                <span className="text-xs text-emerald-400 font-mono">
                  Локальный stub 127.0.0.1:53 активен
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {autoFixReport && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-1.5 text-xs">
            <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
              <Check className="size-4" />
              Отчёт «Доктора сети»: восстановление успешно завершено
            </div>
            <ul className="list-disc list-inside space-y-0.5 text-foreground/90 pl-1">
              {autoFixReport.actions.map((act, i) => (
                <li key={i}>{act}</li>
              ))}
            </ul>
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="w-full flex items-center justify-between rounded-2xl border border-border/35 bg-card/55 backdrop-blur-xl px-4 py-3 text-left text-xs text-muted-foreground hover:text-foreground transition cursor-pointer"
        >
          <span className="inline-flex items-center gap-2 font-medium text-foreground/90">
            <Sliders className="size-3.5 text-primary" />
            Дополнительные инструменты (Системный DNS, Моды, Диагностика и Пинг сервисов)
          </span>
          {showAdvanced ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>

        {showAdvanced && (
          <div className="space-y-4">
            {/* DNS Manager Card */}
            <Card>
          <CardHeader className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <Globe2 className="h-4 w-4 text-muted-foreground" />
                Управление DNS и DoH
                {(dnsCfg?.active || dnsStatus?.active) && (
                  <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                    Активен ({selectedPreset})
                  </span>
                )}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => void refreshDns()}>
                <RefreshCw className="h-3.5 w-3.5" />
                Обновить статус
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Быстрое переключение системных DNS-серверов и DNS-over-HTTPS (DoH) для обхода
              DNS-блокировок и гео-ограничений (Xbox, Comss, Cloudflare, Google, Quad9).
            </p>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {presets.map((p) => {
                const active = selectedPreset === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => void handleSelectPreset(p.id)}
                    className={cn(
                      'cursor-pointer text-left rounded-lg border p-3 transition',
                      active
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:bg-accent/30'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm">{p.name}</span>
                      {p.doh && (
                        <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          DoH
                        </span>
                      )}
                    </div>
                    <div className="mt-1 font-mono text-xs text-foreground/80">
                      {p.ipv4.join(' / ')}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{p.description}</p>
                  </button>
                )
              })}

              <button
                type="button"
                onClick={() => void handleSelectPreset('custom')}
                className={cn(
                  'cursor-pointer text-left rounded-lg border p-3 transition',
                  selectedPreset === 'custom'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-accent/30'
                )}
              >
                <div className="font-medium text-sm">Свой DNS (Custom)</div>
                <div className="mt-1 font-mono text-xs text-foreground/80">
                  {dnsCfg?.primary || 'Укажите IPv4 / DoH'}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Произвольные первичный/вторичный IPv4 и шаблон DoH
                </p>
              </button>
            </div>

            {selectedPreset === 'custom' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-lg border border-border bg-background/40 p-3">
                <div className="space-y-1">
                  <Label className="text-xs">Первичный DNS (IPv4)</Label>
                  <Input
                    value={dnsCfg?.primary ?? ''}
                    onChange={(e) =>
                      patchAppConfig({
                        dns: {
                          presetId: 'custom',
                          primary: e.target.value.trim(),
                          secondary: dnsCfg?.secondary ?? '',
                          dohUrl: dnsCfg?.dohUrl ?? '',
                          active: dnsCfg?.active ?? false
                        }
                      })
                    }
                    placeholder="1.1.1.1"
                    className="font-mono text-xs h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Вторичный DNS (IPv4)</Label>
                  <Input
                    value={dnsCfg?.secondary ?? ''}
                    onChange={(e) =>
                      patchAppConfig({
                        dns: {
                          presetId: 'custom',
                          primary: dnsCfg?.primary ?? '',
                          secondary: e.target.value.trim(),
                          dohUrl: dnsCfg?.dohUrl ?? '',
                          active: dnsCfg?.active ?? false
                        }
                      })
                    }
                    placeholder="1.0.0.1"
                    className="font-mono text-xs h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">DoH URL (опционально)</Label>
                  <Input
                    value={dnsCfg?.dohUrl ?? ''}
                    onChange={(e) =>
                      patchAppConfig({
                        dns: {
                          presetId: 'custom',
                          primary: dnsCfg?.primary ?? '',
                          secondary: dnsCfg?.secondary ?? '',
                          dohUrl: e.target.value.trim(),
                          active: dnsCfg?.active ?? false
                        }
                      })
                    }
                    placeholder="https://cloudflare-dns.com/dns-query"
                    className="font-mono text-xs h-8"
                  />
                </div>
              </div>
            )}

            {adapters.length > 0 && (
              <div className="rounded-md border border-border bg-background/40 px-3 py-2 text-xs">
                <div className="text-muted-foreground mb-1 font-medium">
                  Активные сетевые адаптеры Windows:
                </div>
                <div className="space-y-1">
                  {adapters.map((a) => (
                    <div
                      key={a.interface_index}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <span className="font-medium">{a.interface_alias}</span>
                      <span className="font-mono text-muted-foreground">
                        {a.ipv4.length > 0 ? a.ipv4.join(', ') : 'Авто (DHCP)'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => void handleApplyDns()} disabled={dnsBusy}>
                {dnsBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Применить DNS
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleResetDns()}
                disabled={dnsBusy}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Сбросить в Авто (DHCP)
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Mods Manager Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Blocks className="h-4 w-4 text-muted-foreground" />
                Моды и расширения стратегий
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Моды добавляют дополнительные стратегии (например,{' '}
                <code className="text-[11px]">ALT7..ALT12.2</code>,{' '}
                <code className="text-[11px]">EA</code>,{' '}
                <code className="text-[11px]">Minecraft</code>), списки доменов/IP и бинарные
                пэйлоады поверх базовой сборки Zapret.
              </p>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                className="hidden"
                onChange={(e) => void handleFileChange(e)}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={modsBusy}
              >
                {modsBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FolderArchive className="h-3.5 w-3.5" />
                )}
                Импорт ZIP-мода
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            {mods.length === 0 ? (
              <div className="rounded-md border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                Моды не найдены. Нажмите «Импорт ZIP-мода» для установки архива.
              </div>
            ) : (
              mods.map((mod) => {
                const isBundled = mod.id === 'ghosternet-hub' || Boolean(mod.bundled)
                return (
                  <div
                    key={mod.id}
                    className={cn(
                      'rounded-lg border p-3.5 transition space-y-2',
                      mod.enabled ? 'border-primary/60 bg-primary/5' : 'border-border bg-card/40'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-sm">{mod.name}</span>
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                            v{mod.version}
                          </span>
                          <span className="text-xs text-muted-foreground">от {mod.author}</span>
                          {isBundled && (
                            <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                              Встроенный (GhosterNet Hub)
                            </span>
                          )}
                        </div>
                        {mod.description && (
                          <p className="text-xs text-muted-foreground mt-1">{mod.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Switch
                          checked={mod.enabled}
                          onCheckedChange={(v) => void handleToggleMod(mod.id, v)}
                        />
                        {!isBundled && (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            className="text-red-400 hover:text-red-300"
                            onClick={() => void handleRemoveMod(mod.id)}
                            title="Удалить мод"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-1 text-[11px]">
                      <span className="rounded bg-muted/70 px-2 py-0.5 text-muted-foreground">
                        Стратегий: <strong className="text-foreground">{mod.strategies.length}</strong>
                      </span>
                    </div>

                    {mod.strategies.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {mod.strategies.map((st) => (
                          <span
                            key={st}
                            className="rounded border border-border/60 bg-background/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                          >
                            {st.replace(/\.bat$/i, '')}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>

        {/* Live Services Monitor Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-400" />
                Live-проверка доступности сервисов
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Мониторинг задержки и доступности ключевых сервисов (YouTube 4K, Discord Gateway/Voice, Telegram DC, Gemini, ChatGPT, Claude) в реальном времени.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void runCheckLiveServices()}
              disabled={liveChecking}
            >
              <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', liveChecking && 'animate-spin')} />
              Проверить пинг
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {liveServices && liveServices.length > 0 ? (
                liveServices.map((svc) => (
                  <div
                    key={svc.id}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-card/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold truncate text-foreground flex items-center gap-1.5">
                        <span
                          className={`size-2 rounded-full ${
                            svc.ok ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'
                          }`}
                        />
                        {svc.name}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate font-mono mt-0.5">
                        {svc.statusText}
                      </div>
                    </div>
                    <span
                      className={`text-xs font-mono font-medium px-2 py-0.5 rounded border ml-2 shrink-0 ${
                        svc.ok
                          ? svc.latencyMs < 100
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          : 'bg-red-500/10 text-red-400 border-red-500/30'
                      }`}
                    >
                      {svc.ok ? `${svc.latencyMs} мс` : 'Блок'}
                    </span>
                  </div>
                ))
              ) : (
                <div className="col-span-full py-4 text-center text-xs text-muted-foreground">
                  {liveChecking ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin text-primary" />
                      Измерение пинга до сервисов…
                    </span>
                  ) : (
                    'Нажмите «Проверить пинг» для замера задержки сервисов'
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* System Diagnostics & Tools Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Stethoscope className="h-4 w-4 text-muted-foreground" />
                Диагностика системы и «Доктор сети»
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Автоматическая проверка служб Windows, драйвера WinDivert, TCP Timestamps,
                конфликтующих процессов и авто-восстановление сети в 1 клик.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="default"
                onClick={() => void handleAutoFix()}
                disabled={autoFixing}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-sm"
              >
                {autoFixing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                )}
                Починить сеть в 1 клик
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleClearDiscordCache()}
                disabled={clearingDiscord}
              >
                {clearingDiscord ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                )}
                Очистить кэш Discord
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void runDiag()}
                disabled={diagLoading}
              >
                <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', diagLoading && 'animate-spin')} />
                Проверить
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            {autoFixReport && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-1.5 text-xs">
                <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
                  <Check className="size-4" />
                  Отчёт «Доктора сети»: восстановление успешно завершено
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-foreground/90 pl-1">
                  {autoFixReport.actions.map((act, i) => (
                    <li key={i}>{act}</li>
                  ))}
                </ul>
              </div>
            )}
            {checks.map((item) => {
              const isFixable = Boolean(item.fixable || item.canFix)
              const actionKey = item.fixAction || item.id
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/50 p-3"
                >
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    {item.status === 'ok' ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                    ) : item.status === 'warn' || item.status === 'warning' ? (
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                    ) : (
                      <XCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{item.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{item.detail}</div>
                    </div>
                  </div>
                  {isFixable ? (
                    <Button
                      size="sm"
                      variant="default"
                      disabled={fixingId === actionKey}
                      onClick={() => void handleFixIssue(actionKey)}
                    >
                      {fixingId === actionKey ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Wrench className="h-3.5 w-3.5" />
                      )}
                      Исправить
                    </Button>
                  ) : item.status === 'ok' ? (
                    <span className="shrink-0 inline-flex items-center gap-1 text-xs text-emerald-400">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      ОК
                    </span>
                  ) : null}
                </div>
              )
            })}
          </CardContent>
        </Card>
          </div>
        )}
      </div>
    </BasePage>
  )
}

export default NetworkPage
