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
  XCircle
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
  modsList,
  modsToggle,
  modsRemove,
  modsImportZip,
  diagnosticsRun,
  diagnosticsFix,
  diagnosticsClearDiscordCache,
  type DnsPresetDescriptor,
  type DnsManagerStatus
} from '@renderer/utils/ipc'

const NetworkPage: React.FC = () => {
  const { appConfig, patchAppConfig, mutateAppConfig } = useAppConfig()
  const dnsCfg = appConfig?.dns

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

  useEffect(() => {
    void refreshDns()
    void refreshMods()
    void runDiag()
  }, [])

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

  const adapters = dnsStatus?.adapters ?? []

  return (
    <BasePage title="Моды, DNS и Диагностика">
      <div className="px-4 pb-6 space-y-4">
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

        {/* System Diagnostics & Tools Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Stethoscope className="h-4 w-4 text-muted-foreground" />
                Диагностика системы и инструменты
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Автоматическая проверка служб Windows, драйвера WinDivert, TCP Timestamps,
                конфликтующих процессов и соединения с GitHub.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleClearDiscordCache()}
                disabled={clearingDiscord}
              >
                {clearingDiscord ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Очистить кэш Discord
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void runDiag()}
                disabled={diagLoading}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', diagLoading && 'animate-spin')} />
                Проверить
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-2">
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
    </BasePage>
  )
}

export default NetworkPage
