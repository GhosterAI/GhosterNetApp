import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Activity,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Copy,
  FileText,
  FolderPlus,
  KeyRound,
  Loader2,
  Play,
  RefreshCw,
  Rocket,
  RotateCcw,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wrench,
  XCircle,
  Download,
  ArrowUpCircle,
  X,
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
import { cn, POWER_ON_BANNER_STYLE } from '@renderer/lib/utils'
import {
  agGetStatus,
  agPatchInstall,
  agUnpatchInstall,
  agSetCapability,
  agEnableAll,
  agDisableAll,
  agRepairService,
  agSetOwnProxy,
  agSetGroupKey,
  agSetProvider,
  agReorderProviders,
  agAddManualPath,
  agRemoveManualPath,
  agGetLogs,
  agPickFolder,
  agCheckUpdate,
  agInstallUpdate,
  agDismissUpdate,
  type AgUpdateInfo,
  writeClipboard,
  type AgUnlockerStatus
} from '@renderer/utils/ipc'

const AntigravityPage: React.FC = () => {
  const [status, setStatus] = useState<AgUnlockerStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState<string | null>(null)

  const [ownProxyInput, setOwnProxyInput] = useState('')
  const [groupKeyInput, setGroupKeyInput] = useState('')

  const [logs, setLogs] = useState<{ forwarder: string; watchdog: string }>({
    forwarder: '',
    watchdog: ''
  })
  const [activeLogTab, setActiveLogTab] = useState<'forwarder' | 'watchdog'>('forwarder')
  const [showLogs, setShowLogs] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const [agUpdate, setAgUpdate] = useState<AgUpdateInfo | null>(null)
  const [agUpdating, setAgUpdating] = useState(false)
  const [agUpdateDismissed, setAgUpdateDismissed] = useState(false)

  const loadStatus = async (deep = false): Promise<void> => {
    if (deep) setLoading(true)
    try {
      const st = await agGetStatus(deep)
      setStatus(st)
      setOwnProxyInput((prev) => (prev === '' ? st.settings.own_proxy || '' : prev))
      setGroupKeyInput((prev) => (prev === '' ? st.settings.group_key || '' : prev))
    } catch (e) {
      toast.error('Не удалось получить статус Antigravity Unlocker', {
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setLoading(false)
    }
  }

  const loadLogs = async (): Promise<void> => {
    try {
      const l = await agGetLogs()
      setLogs(l)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void loadStatus(true)
    agCheckUpdate(false)
      .then(setAgUpdate)
      .catch(() => setAgUpdate(null))
    const timer = setInterval(() => {
      void loadStatus(false)
    }, 5000)
    return () => clearInterval(timer)
  }, [])

  const handleInstallAgUpdate = async (): Promise<void> => {
    if (!agUpdate?.assetUrl || agUpdating) return
    setAgUpdating(true)
    try {
      const res = await agInstallUpdate(agUpdate.assetUrl, agUpdate.latest)
      toast.success(
        `Antigravity Unlocker обновлён до v${res.installedVersion ?? agUpdate.latest}!`,
        {
          description: `Размер: ${(res.sizeBytes / 1024 / 1024).toFixed(1)} МБ`,
          style: POWER_ON_BANNER_STYLE
        }
      )
      const fresh = await agCheckUpdate(true).catch(() => null)
      setAgUpdate(fresh)
      await loadStatus(true)
    } catch (e) {
      toast.error('Не удалось обновить Antigravity Unlocker', {
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setAgUpdating(false)
    }
  }

  const handleDismissAgUpdate = (): void => {
    setAgUpdateDismissed(true)
    if (agUpdate?.latest) {
      void agDismissUpdate(agUpdate.latest).catch(() => void 0)
    }
  }

  useEffect(() => {
    if (showLogs) {
      void loadLogs()
    }
  }, [showLogs])

  const handleEnableAll = async (): Promise<void> => {
    if (busyAction) return
    setBusyAction('enableAll')
    const tId = toast.loading('Включаем полный обход Antigravity (патч + релей + NRPT + прокси)…')
    try {
      const st = await agEnableAll()
      setStatus(st)
      toast.success('Antigravity Unlocker полностью активирован!', {
        id: tId,
        style: POWER_ON_BANNER_STYLE
      })
    } catch (e) {
      toast.error('Ошибка при включении обхода Antigravity', {
        id: tId,
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setBusyAction(null)
    }
  }

  const handleDisableAll = async (): Promise<void> => {
    if (busyAction) return
    setBusyAction('disableAll')
    const tId = toast.loading('Выполняем полный откат Antigravity Unlocker…')
    try {
      const st = await agDisableAll()
      setStatus(st)
      toast.success('Все патчи, правила NRPT и службы Antigravity сняты', { id: tId })
    } catch (e) {
      toast.error('Ошибка при откате Antigravity Unlocker', {
        id: tId,
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setBusyAction(null)
    }
  }

  const handleRepair = async (): Promise<void> => {
    if (busyAction) return
    setBusyAction('repair')
    const tId = toast.loading('Перезапускаем службу обхода и обновляем правила NRPT…')
    try {
      const st = await agRepairService()
      setStatus(st)
      toast.success('Служба обхода Antigravity успешно восстановлена', {
        id: tId,
        style: POWER_ON_BANNER_STYLE
      })
    } catch (e) {
      toast.error('Не удалось починить службу обхода', {
        id: tId,
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setBusyAction(null)
    }
  }

  const handleToggleCap = async (cap: string, enabled: boolean, label: string): Promise<void> => {
    if (busyAction) return
    setBusyAction(cap)
    const tId = toast.loading(`${enabled ? 'Включаем' : 'Отключаем'}: ${label}…`)
    try {
      const st = await agSetCapability(cap, enabled)
      setStatus(st)
      toast.success(`${label}: ${enabled ? 'включено' : 'отключено'}`, {
        id: tId,
        style: enabled ? POWER_ON_BANNER_STYLE : undefined
      })
    } catch (e) {
      toast.error(`Ошибка переключения «${label}»`, {
        id: tId,
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setBusyAction(null)
    }
  }

  const handlePatchSingle = async (targetPath: string, label: string): Promise<void> => {
    if (busyAction) return
    setBusyAction(`patch:${targetPath}`)
    const tId = toast.loading(`Патчим ${label}…`)
    try {
      const res = await agPatchInstall(targetPath)
      await loadStatus(true)
      if (res.errors.length > 0) {
        toast.warning(`Патч завершён с предупреждениями: ${res.errors.join('; ')}`, { id: tId })
      } else {
        toast.success(`${label} успешно пропатчен`, {
          id: tId,
          style: POWER_ON_BANNER_STYLE
        })
      }
    } catch (e) {
      toast.error(`Ошибка патча ${label}`, {
        id: tId,
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setBusyAction(null)
    }
  }

  const handleUnpatchSingle = async (targetPath: string, label: string): Promise<void> => {
    if (busyAction) return
    setBusyAction(`unpatch:${targetPath}`)
    const tId = toast.loading(`Откатываем патч ${label}…`)
    try {
      const res = await agUnpatchInstall(targetPath)
      await loadStatus(true)
      if (res.errors.length > 0) {
        toast.warning(`Откат завершён с предупреждениями: ${res.errors.join('; ')}`, { id: tId })
      } else {
        toast.success(`Патч ${label} снят`, { id: tId })
      }
    } catch (e) {
      toast.error(`Ошибка отката ${label}`, {
        id: tId,
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setBusyAction(null)
    }
  }

  const handleAddFolder = async (): Promise<void> => {
    try {
      const folder = await agPickFolder()
      if (!folder) return
      setBusyAction('addPath')
      const st = await agAddManualPath(folder)
      setStatus(st)
      toast.success(`Добавлен путь установки: ${folder}`, { style: POWER_ON_BANNER_STYLE })
    } catch (e) {
      toast.error('Не удалось добавить путь', {
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setBusyAction(null)
    }
  }

  const handleRemoveFolder = async (dirPath: string): Promise<void> => {
    try {
      setBusyAction('removePath')
      const st = await agRemoveManualPath(dirPath)
      setStatus(st)
      toast.success('Путь удалён из списка')
    } catch (e) {
      toast.error('Ошибка удаления пути', {
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setBusyAction(null)
    }
  }

  const handleSaveOwnProxy = async (): Promise<void> => {
    if (busyAction) return
    setBusyAction('ownProxy')
    try {
      const st = await agSetOwnProxy(ownProxyInput)
      setStatus(st)
      toast.success(
        ownProxyInput.trim()
          ? 'Свой HTTP-прокси сохранён и подключён'
          : 'Свой HTTP-прокси очищен',
        { style: ownProxyInput.trim() ? POWER_ON_BANNER_STYLE : undefined }
      )
    } catch (e) {
      toast.error('Ошибка сохранения HTTP-прокси', {
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setBusyAction(null)
    }
  }

  const handleSaveGroupKey = async (): Promise<void> => {
    if (busyAction) return
    setBusyAction('groupKey')
    try {
      const st = await agSetGroupKey(groupKeyInput)
      setStatus(st)
      toast.success(
        groupKeyInput.trim() ? 'Ключ группы сохранён и активирован' : 'Ключ группы очищен',
        { style: groupKeyInput.trim() ? POWER_ON_BANNER_STYLE : undefined }
      )
    } catch (e) {
      toast.error('Ошибка сохранения ключа группы', {
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setBusyAction(null)
    }
  }

  const handleToggleProvider = async (name: string, enabled: boolean): Promise<void> => {
    try {
      const st = await agSetProvider(name, enabled)
      setStatus(st)
      toast.success(`Провайдер ${name} ${enabled ? 'включён' : 'отключён'}`)
    } catch (e) {
      toast.error('Не удалось изменить статус провайдера', {
        description: e instanceof Error ? e.message : String(e)
      })
    }
  }

  const handleMoveProvider = async (index: number, direction: -1 | 1): Promise<void> => {
    if (!status) return
    const list = status.providers.map((p) => p.name)
    const targetIdx = index + direction
    if (targetIdx < 0 || targetIdx >= list.length) return
    const swapped = [...list]
    const temp = swapped[index]
    swapped[index] = swapped[targetIdx]
    swapped[targetIdx] = temp
    try {
      const st = await agReorderProviders(swapped)
      setStatus(st)
    } catch (e) {
      toast.error('Не удалось изменить порядок провайдеров', {
        description: e instanceof Error ? e.message : String(e)
      })
    }
  }

  const foundInstalls = status?.installs.filter((i) => i.path) ?? []
  const patchedCount = foundInstalls.filter((i) => i.patched === true).length
  const allPatched = foundInstalls.length > 0 && patchedCount === foundInstalls.length
  const bypassActive = Boolean(
    status && (status.relayRunning || status.nrptApplied || status.proxyEnvSet)
  )

  return (
    <BasePage title="Antigravity Unlocker">
      <div className="px-4 pb-6 space-y-4">
        {agUpdate?.hasUpdate && !agUpdate.dismissed && !agUpdateDismissed && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-foreground shadow-sm">
            <div className="flex items-center gap-3">
              <div className="size-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                <ArrowUpCircle className="size-4" />
              </div>
              <div>
                <div className="text-sm font-semibold flex items-center gap-2">
                  Доступно обновление Antigravity Unlocker — v{agUpdate.latest}
                  <span className="text-xs font-mono text-muted-foreground">
                    (текущая: v{agUpdate.installed ?? '2.21.1'})
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Новый релиз confeden/Antigravity на GitHub. Обновите бинарник AG_*.exe в один клик.
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              <Button
                size="sm"
                disabled={agUpdating || !agUpdate.assetUrl}
                onClick={() => void handleInstallAgUpdate()}
                className="h-8 gap-1.5 bg-amber-500 text-black hover:bg-amber-400 text-xs font-medium"
              >
                {agUpdating ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                <span>Обновить сейчас</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDismissAgUpdate}
                className="h-8 size-8 p-0 text-muted-foreground hover:text-foreground"
                title="Скрыть"
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Hero / Master Control Card */}
        <Card className={cn(bypassActive && allPatched && 'border-emerald-500/40')}>
          <CardHeader className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Rocket className="h-5 w-5 text-primary" />
                Antigravity без VPN и смены региона Google
                {bypassActive && allPatched ? (
                  <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-400">
                    Защита и обход активны
                  </span>
                ) : bypassActive || patchedCount > 0 ? (
                  <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300">
                    Частично активен
                  </span>
                ) : (
                  <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    Отключён
                  </span>
                )}
              </CardTitle>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void loadStatus(true)}
                  disabled={loading || Boolean(busyAction)}
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
                  Проверить установки
                </Button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Двухуровневая разблокировка Google Antigravity IDE / 2.0 / CLI: снимает проверку
              региона аккаунта Google (<code className="text-foreground">ineligible</code>) и убирает
              ошибку 400 через локальный DNS-релей (<code className="text-foreground">127.0.0.53</code>),
              правила NRPT и многомаршрутный локальный прокси (<code className="text-foreground">AG_LS_PROXY</code>).
            </p>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Status Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <div className="rounded-lg border border-border bg-background/40 p-2.5">
                <div className="text-[11px] text-muted-foreground">Патч клиента</div>
                <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold">
                  {allPatched ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-emerald-400">
                        Пропатчен ({patchedCount}/{foundInstalls.length})
                      </span>
                    </>
                  ) : patchedCount > 0 ? (
                    <>
                      <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
                      <span className="text-amber-300">
                        Частично ({patchedCount}/{foundInstalls.length})
                      </span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Не применён</span>
                    </>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-background/40 p-2.5">
                <div className="text-[11px] text-muted-foreground">DNS-релей (127.0.0.53)</div>
                <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold">
                  {status?.relayRunning ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Работает</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Остановлен</span>
                    </>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-background/40 p-2.5">
                <div className="text-[11px] text-muted-foreground">Правила NRPT</div>
                <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold">
                  {status?.nrptApplied ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Установлены</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Сняты</span>
                    </>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-background/40 p-2.5">
                <div className="text-[11px] text-muted-foreground">AG_LS_PROXY</div>
                <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold">
                  {status?.proxyEnvSet ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Активен</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Выкл</span>
                    </>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-background/40 p-2.5">
                <div className="text-[11px] text-muted-foreground">Автопатч (Watchdog)</div>
                <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold">
                  {status?.watchdogInstalled ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Активен</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Выкл</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* One-click Action Bar */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => void handleEnableAll()}
                disabled={Boolean(busyAction) || !status?.binaryAvailable}
              >
                {busyAction === 'enableAll' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Включить всё (Патч + Обход 400)
              </Button>

              <Button
                size="sm"
                variant="secondary"
                onClick={() => void handleRepair()}
                disabled={Boolean(busyAction) || !status?.binaryAvailable}
              >
                {busyAction === 'repair' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wrench className="h-4 w-4" />
                )}
                Починить службу обхода
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleDisableAll()}
                disabled={Boolean(busyAction)}
              >
                {busyAction === 'disableAll' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                Полный откат
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Installations Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                Установки Antigravity на компьютере
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Патч переименовывает поле <code className="text-foreground">ineligible</code> и
                переключает Language Server на изолированную переменную прокси{' '}
                <code className="text-foreground">AG_LS_PROXY</code>.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleAddFolder()}
              disabled={Boolean(busyAction)}
            >
              <FolderPlus className="h-3.5 w-3.5" />
              Указать папку…
            </Button>
          </CardHeader>

          <CardContent className="space-y-2">
            {(status?.installs ?? []).map((inst, idx) => (
              <div
                key={`${inst.label}-${inst.path || idx}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/40 p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{inst.label}</span>
                    {inst.manual && (
                      <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] text-primary">
                        Вручную
                      </span>
                    )}
                    {inst.path ? (
                      inst.patched === true ? (
                        <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                          Пропатчен
                        </span>
                      ) : inst.patched === false ? (
                        <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                          Не пропатчен
                        </span>
                      ) : (
                        <span className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          Не проверен
                        </span>
                      )
                    ) : (
                      <span className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        Не установлен
                      </span>
                    )}
                  </div>
                  <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
                    {inst.path || 'Папка установки не обнаружена автоматически'}
                  </div>
                </div>

                {inst.path && (
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant={inst.patched ? 'secondary' : 'default'}
                      onClick={() => void handlePatchSingle(inst.path!, inst.label)}
                      disabled={Boolean(busyAction)}
                    >
                      {busyAction === `patch:${inst.path}` ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                      {inst.patched ? 'Перепатчить' : 'Пропатчить'}
                    </Button>
                    {inst.patched && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleUnpatchSingle(inst.path!, inst.label)}
                        disabled={Boolean(busyAction)}
                      >
                        Откатить
                      </Button>
                    )}
                    {inst.manual && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void handleRemoveFolder(inst.path!)}
                        disabled={Boolean(busyAction)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Collapsible Advanced Antigravity Settings */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl border border-border/40 bg-card/40 backdrop-blur-md px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-card/60 transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Sliders className="h-3.5 w-3.5 text-primary" />
              Тонкая настройка маршрутов, прокси, DNS и телеметрии
            </span>
            {showAdvanced ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>

          {showAdvanced && (
            <div className="mt-3 space-y-4">
              {/* Capability Switches Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Server className="h-4 w-4 text-muted-foreground" />
                    Модули и маршруты обхода
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    {
                      cap: 'client_patch',
                      title: 'Разблокировать вход в аккаунт',
                      desc: 'Патч бинарника Language Server и оболочки IDE (ineligible → inexigible)',
                      checked: allPatched || Boolean(status?.settings.client_patch)
                    },
                    {
                      cap: 'auto_patch',
                      title: 'Автопатч Antigravity (Watchdog)',
                      desc: 'Фоновая задача автоматически возвращает патч после обновлений IDE',
                      checked: Boolean(status?.watchdogInstalled && status?.settings.auto_patch)
                    },
                    {
                      cap: 'dns',
                      title: 'Обход через DNS (NRPT + 127.0.0.53)',
                      desc: 'Перехватывает cloudcode-pa и daily-cloudcode-pa через локальный DNS-релей',
                      checked: Boolean(status?.nrptApplied && status?.relayRunning)
                    },
                    {
                      cap: 'local_proxy',
                      title: 'Локальный CONNECT-прокси',
                      desc: `Маршрутизация трафика Language Server через ${status?.proxyUrl || '127.0.0.1:53129'}`,
                      checked: Boolean(status?.settings.local_proxy && status?.proxyEnvSet)
                    },
                    {
                      cap: 'builtin_exits',
                      title: 'Встроенные выходы (Built-in Exits)',
                      desc: 'Использовать встроенные зарубежные прокси-выходы при отказе DNS',
                      checked: Boolean(status?.settings.builtin_exits)
                    },
                    {
                      cap: 'group_proxy',
                      title: 'Прокси из группы (Group Proxy)',
                      desc: 'Использовать выделенный выход по ключу из Telegram-группы',
                      checked: Boolean(status?.settings.group_proxy)
                    },
                    {
                      cap: 'rotate_providers',
                      title: 'Ротация DNS-провайдеров',
                      desc: 'Опрашивать все включённые DNS-серверы параллельно вместо только первого',
                      checked: Boolean(status?.settings.rotate_providers)
                    },
                    {
                      cap: 'verify_tls',
                      title: 'Сверять TLS-сертификаты',
                      desc: 'Проверять подлинность сертификата *.googleapis.com у подменённых IP',
                      checked: Boolean(status?.settings.verify_tls)
                    }
                  ].map((item) => (
                    <div
                      key={item.cap}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/40 p-3"
                    >
                      <div className="space-y-0.5">
                        <div className="text-sm font-medium">{item.title}</div>
                        <div className="text-[11px] text-muted-foreground">{item.desc}</div>
                      </div>
                      <Switch
                        checked={item.checked}
                        disabled={Boolean(busyAction)}
                        onCheckedChange={(val) => void handleToggleCap(item.cap, val, item.title)}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Live Telemetry & Route Table (gate.json) */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                  <div>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Activity className="h-4 w-4 text-emerald-400" />
                      Живая телеметрия шлюза (gate.json)
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Текущий маршрут до серверов Google Cloud Code и статистика ответов в реальном времени.
                    </p>
                  </div>
                  {status?.gate?.route && (
                    <span className="rounded bg-emerald-500/20 px-2.5 py-1 text-xs font-mono font-medium text-emerald-400">
                      Активный маршрут: {status.gate.route}
                    </span>
                  )}
                </CardHeader>

                <CardContent className="space-y-3">
                  {status?.gate ? (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div className="rounded border border-border bg-background/40 p-2">
                          <span className="text-muted-foreground">Loopback 127.0.0.53:</span>{' '}
                          <span className={status.gate.loopback ? 'text-emerald-400 font-medium' : 'text-amber-300'}>
                            {status.gate.loopback ? 'Привязан' : 'Ожидание'}
                          </span>
                        </div>
                        <div className="rounded border border-border bg-background/40 p-2">
                          <span className="text-muted-foreground">VPN-туннель:</span>{' '}
                          <span className="font-mono">
                            {status.gate.tunnel ? status.gate.vpn_exit || 'Активен' : 'Нет'}
                          </span>
                        </div>
                        <div className="rounded border border-border bg-background/40 p-2">
                          <span className="text-muted-foreground">Последний 200 OK:</span>{' '}
                          <span className="font-mono text-emerald-400">
                            {status.gate.last_ok?.route || '—'}
                          </span>
                        </div>
                        <div className="rounded border border-border bg-background/40 p-2">
                          <span className="text-muted-foreground">Перехвачено 400:</span>{' '}
                          <span className="font-mono">
                            {status.gate.last_400 ? `${status.gate.last_400.count} (${status.gate.last_400.route})` : '0'}
                          </span>
                        </div>
                      </div>

                      {status.gate.routes && status.gate.routes.length > 0 && (
                        <div className="overflow-x-auto rounded-lg border border-border">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-muted/40 text-muted-foreground">
                              <tr>
                                <th className="px-3 py-2 font-medium">Маршрут</th>
                                <th className="px-3 py-2 font-medium">Состояние</th>
                                <th className="px-3 py-2 font-medium">Пинг</th>
                                <th className="px-3 py-2 font-medium">Ответов / Отказов</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {status.gate.routes.map((r) => (
                                <tr key={r.label} className="hover:bg-accent/20">
                                  <td className="px-3 py-2 font-medium">{r.label}</td>
                                  <td className="px-3 py-2">
                                    {r.usable ? (
                                      <span className="text-emerald-400">
                                        Доступен {r.proven ? '(проверен)' : ''}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">Недоступен</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 font-mono">
                                    {r.latency_ms != null ? `${r.latency_ms} мс` : '—'}
                                  </td>
                                  <td className="px-3 py-2 font-mono">
                                    {r.answers} / {r.refusals}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {status.gate.blockers && status.gate.blockers.length > 0 && (
                        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 space-y-1 text-xs">
                          <div className="font-semibold text-destructive">
                            Обнаружены сетевые блокировки / конфликты портов:
                          </div>
                          {status.gate.blockers.map((b, i) => (
                            <div key={i} className="font-mono text-destructive/90">
                              {b.what} ({b.addr}): {b.cause} {b.by ? `[процесс: ${b.by}]` : ''} — {b.error}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-xs text-muted-foreground py-2">
                      Служба DNS-релея ещё не записала телеметрию или остановлена. Нажмите «Включить всё»
                      для запуска.
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Custom Proxy, Group Key & DNS Providers */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <KeyRound className="h-4 w-4 text-muted-foreground" />
                      Свой HTTP-прокси и Ключ группы
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Свой HTTP-прокси (http://user:pass@host:port)</Label>
                      <div className="flex gap-2">
                        <Input
                          value={ownProxyInput}
                          onChange={(e) => setOwnProxyInput(e.target.value)}
                          placeholder="http://user:pass@1.2.3.4:8080"
                          className="font-mono text-xs h-8"
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-8"
                          onClick={() => void handleSaveOwnProxy()}
                          disabled={Boolean(busyAction)}
                        >
                          Сохранить
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Ключ прокси из группы (AG1-...)</Label>
                        {status?.pcCode && (
                          <button
                            type="button"
                            onClick={() => {
                              void writeClipboard(status.pcCode)
                              toast.success(`Код ПК скопирован: ${status.pcCode}`)
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-mono text-primary hover:underline cursor-pointer"
                          >
                            Код ПК: {status.pcCode}
                            <Copy className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Input
                          value={groupKeyInput}
                          onChange={(e) => setGroupKeyInput(e.target.value)}
                          placeholder="AG1-..."
                          className="font-mono text-xs h-8"
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-8"
                          onClick={() => void handleSaveGroupKey()}
                          disabled={Boolean(busyAction)}
                        >
                          Применить
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Server className="h-4 w-4 text-muted-foreground" />
                      Пул DNS-провайдеров подмены
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {(status?.providers ?? []).map((prov, index) => (
                      <div
                        key={prov.name}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background/40 px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground">#{index + 1}</span>
                          <span className="text-sm font-medium">{prov.name}</span>
                          {prov.name === 'dns-ai.ru' && (
                            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-400">
                              DoH HTTP/2
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            disabled={index === 0}
                            onClick={() => void handleMoveProvider(index, -1)}
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            disabled={index === (status?.providers.length ?? 1) - 1}
                            onClick={() => void handleMoveProvider(index, 1)}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                          <Switch
                            checked={prov.enabled}
                            onCheckedChange={(val) => void handleToggleProvider(prov.name, val)}
                          />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>

              {/* Logs Viewer Card */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    Журнал фоновых служб Antigravity Unlocker
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {showLogs && (
                      <Button size="sm" variant="ghost" onClick={() => void loadLogs()}>
                        <RefreshCw className="h-3.5 w-3.5" />
                        Обновить
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowLogs((v) => !v)}
                    >
                      {showLogs ? 'Скрыть журнал' : 'Показать журнал'}
                    </Button>
                  </div>
                </CardHeader>

                {showLogs && (
                  <CardContent className="space-y-3">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={activeLogTab === 'forwarder' ? 'default' : 'outline'}
                        onClick={() => setActiveLogTab('forwarder')}
                      >
                        forwarder.log (DNS + Прокси)
                      </Button>
                      <Button
                        size="sm"
                        variant={activeLogTab === 'watchdog' ? 'default' : 'outline'}
                        onClick={() => setActiveLogTab('watchdog')}
                      >
                        watchdog.log (Автопатч)
                      </Button>
                    </div>
                    <pre className="rounded-lg border border-border bg-background/70 p-3 text-[11px] font-mono whitespace-pre-wrap max-h-64 overflow-y-auto text-foreground/90">
                      {(activeLogTab === 'forwarder' ? logs.forwarder : logs.watchdog) ||
                        'Журнал пока пуст.'}
                    </pre>
                  </CardContent>
                )}
              </Card>
            </div>
          )}
        </div>
      </div>
    </BasePage>
  )
}

export default AntigravityPage
