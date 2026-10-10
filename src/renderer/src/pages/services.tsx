import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Briefcase,
  CheckSquare,
  FileCode2,
  Gamepad2,
  Globe,
  HardDrive,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Share2,
  ShieldAlert,
  Sparkles,
  Square,
  Trash2
} from 'lucide-react'
import BasePage from '@renderer/components/base/base-page'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Switch } from '@renderer/components/ui/switch'
import { Label } from '@renderer/components/ui/label'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useZapretStore } from '@renderer/store/zapret-store'
import { cn, POWER_ON_BANNER_STYLE } from '@renderer/lib/utils'
import {
  servicesList,
  servicesToggle,
  servicesSetAll,
  hostsStatus,
  hostsApply,
  hostsRevert,
  zapretGetCollections,
  zapretSaveCollection,
  zapretReadRawList,
  zapretWriteRawList,
  zapretRestart,
  type SystemHostsState,
  type ZapretCollectionSnapshot,
  type ZapretListCollectionKey
} from '@renderer/utils/ipc'

const CATEGORY_META: Record<
  'all' | ServiceCategory,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  all: { label: 'Все сервисы', icon: Globe },
  gaming: { label: 'Игры и лаунчеры', icon: Gamepad2 },
  socials: { label: 'Соцсети и медиа', icon: Share2 },
  workplace: { label: 'Работа и ИИ', icon: Briefcase }
}

const RAW_LIST_FILES = [
  'list-general.txt',
  'list-general-user.txt',
  'list-exclude.txt',
  'list-exclude-user.txt',
  'list-google.txt',
  'ipset-all.txt',
  'ipset-all-user.txt',
  'ipset-exclude.txt',
  'ipset-exclude-user.txt'
]

const ServicesPage: React.FC = () => {
  const { appConfig, patchAppConfig, mutateAppConfig } = useAppConfig()
  const zapretStatus = useZapretStore((s) => s.status)
  const zapret = appConfig?.zapret

  const [catalog, setCatalog] = useState<ServicePresetInfo[]>([])
  const [category, setCategory] = useState<'all' | ServiceCategory>('all')
  const [search, setSearch] = useState('')
  const [hostsState, setHostsState] = useState<SystemHostsState | null>(null)
  const [hostsBusy, setHostsBusy] = useState(false)

  // User collections state
  const [collections, setCollections] = useState<ZapretCollectionSnapshot[]>([])
  const [activeCollection, setActiveCollection] = useState<ZapretListCollectionKey>('domains')
  const [newEntryInput, setNewEntryInput] = useState('')
  const [collectionBusy, setCollectionBusy] = useState(false)

  // Raw file editor state
  const [rawEditorOpen, setRawEditorOpen] = useState(false)
  const [selectedRawFile, setSelectedRawFile] = useState<string>('list-general-user.txt')
  const [rawContent, setRawContent] = useState<string>('')
  const [rawSaving, setRawSaving] = useState(false)

  const loadInitial = async (): Promise<void> => {
    try {
      const [cat, hStat, cols] = await Promise.all([
        servicesList(),
        hostsStatus().catch(() => null),
        zapretGetCollections().catch(() => [])
      ])
      setCatalog(cat)
      if (hStat) setHostsState(hStat)
      setCollections(cols)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void loadInitial()
  }, [])

  useEffect(() => {
    if (!rawEditorOpen || !selectedRawFile) return
    zapretReadRawList(selectedRawFile)
      .then((res) => setRawContent(res.content))
      .catch(() => setRawContent(''))
  }, [rawEditorOpen, selectedRawFile])

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase()
    return catalog.filter((item) => {
      if (category !== 'all' && item.category !== category) return false
      if (!q) return true
      return (
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q)
      )
    })
  }, [catalog, category, search])

  const enabledCount = useMemo(() => catalog.filter((s) => s.enabled).length, [catalog])

  const handleToggleService = async (id: string, nextEnabled: boolean): Promise<void> => {
    try {
      const updated = await servicesToggle(id, nextEnabled)
      setCatalog(updated)
      mutateAppConfig()
      if (zapretStatus.state === 'running') {
        toast.info('Список сервисов обновлён. Перезапустите Zapret для применения.', {
          action: {
            label: 'Перезапустить',
            onClick: () => {
              void zapretRestart()
            }
          }
        })
      }
    } catch (e) {
      toast.error('Ошибка переключения сервиса', {
        description: e instanceof Error ? e.message : String(e)
      })
    }
  }

  const selectAllFiltered = async (): Promise<void> => {
    const enabledSet = new Set(catalog.filter((c) => c.enabled).map((c) => c.id))
    for (const item of filteredCatalog) enabledSet.add(item.id)
    try {
      const updated = await servicesSetAll([...enabledSet])
      setCatalog(updated)
      mutateAppConfig()
    } catch {
      // ignore
    }
  }

  const deselectAllFiltered = async (): Promise<void> => {
    const enabledSet = new Set(catalog.filter((c) => c.enabled).map((c) => c.id))
    for (const item of filteredCatalog) enabledSet.delete(item.id)
    try {
      const updated = await servicesSetAll([...enabledSet])
      setCatalog(updated)
      mutateAppConfig()
    } catch {
      // ignore
    }
  }

  const handleApplyHosts = async (): Promise<void> => {
    if (hostsBusy) return
    setHostsBusy(true)
    const tId = toast.loading('Обновляем системный файл hosts…')
    try {
      const res = await hostsApply()
      setHostsState(res)
      mutateAppConfig()
      toast.success(`Системный hosts обновлён (${res.entryCount} записей)`, {
        id: tId,
        style: POWER_ON_BANNER_STYLE
      })
    } catch (e) {
      toast.error('Не удалось обновить системный hosts (нужны права Администратора)', {
        id: tId,
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setHostsBusy(false)
    }
  }

  const handleClearHosts = async (): Promise<void> => {
    if (hostsBusy) return
    setHostsBusy(true)
    const tId = toast.loading('Очищаем записи GhosterNet из системного hosts…')
    try {
      const res = await hostsRevert()
      setHostsState(res)
      mutateAppConfig()
      toast.success('Записи GhosterNet удалены из системного hosts', { id: tId })
    } catch (e) {
      toast.error('Не удалось очистить системный hosts', {
        id: tId,
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setHostsBusy(false)
    }
  }

  const currentCollection = useMemo(
    () =>
      collections.find((c) => c.key === activeCollection) ?? {
        key: activeCollection,
        title: 'Пользовательский список',
        filename: 'list-general.txt',
        userFilename: 'list-general-user.txt',
        userEntries: [],
        baseCount: 0,
        added: [],
        removed: []
      },
    [collections, activeCollection]
  )

  const handleAddCollectionItems = async (): Promise<void> => {
    if (!newEntryInput.trim() || collectionBusy) return
    setCollectionBusy(true)
    const tokens = newEntryInput
      .split(/[\s,;]+/)
      .map((t) => t.trim())
      .filter(Boolean)
    const merged = Array.from(new Set([...currentCollection.userEntries, ...tokens]))
    try {
      const updated = await zapretSaveCollection(activeCollection, merged)
      setCollections(updated)
      setNewEntryInput('')
      toast.success('Записи сохранены в пользовательский список', {
        style: POWER_ON_BANNER_STYLE
      })
    } catch (e) {
      toast.error('Ошибка сохранения списка', {
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setCollectionBusy(false)
    }
  }

  const handleRemoveItem = async (value: string): Promise<void> => {
    const next = currentCollection.userEntries.filter((item) => item !== value)
    try {
      const updated = await zapretSaveCollection(activeCollection, next)
      setCollections(updated)
    } catch (e) {
      toast.error('Не удалось удалить запись', {
        description: e instanceof Error ? e.message : String(e)
      })
    }
  }

  const handleSaveRawFile = async (): Promise<void> => {
    if (!selectedRawFile || rawSaving) return
    setRawSaving(true)
    try {
      const res = await zapretWriteRawList(selectedRawFile, rawContent)
      toast.success(`Файл ${res.filename} сохранён (${res.lines} строк)`, {
        style: POWER_ON_BANNER_STYLE
      })
      const cols = await zapretGetCollections().catch(() => null)
      if (cols) setCollections(cols)
    } catch (e) {
      toast.error('Не удалось сохранить файл', {
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setRawSaving(false)
    }
  }

  return (
    <BasePage title="Сервисы и Списки">
      <div className="px-4 pb-6 space-y-4">
        {/* Service Presets Card */}
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  Каталог сервисов
                  <span className="text-xs font-normal text-muted-foreground">
                    выбрано {enabledCount} из {catalog.length}
                  </span>
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Отметьте игры, соцсети и рабочие сервисы. Их домены, IP-подсети, аргументы winws и
                  цели тестирования автоматически собираются при запуске Zapret. Базовые пресеты{' '}
                  <span className="text-foreground font-medium">Cloudflare</span> и{' '}
                  <span className="text-foreground font-medium">Clouds (AWS/Akamai/Fastly)</span>{' '}
                  включены всегда.
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" onClick={() => void selectAllFiltered()}>
                  <CheckSquare className="h-3.5 w-3.5" />
                  Выбрать все
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void deselectAllFiltered()}>
                  <Square className="h-3.5 w-3.5" />
                  Снять
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(['all', 'gaming', 'socials', 'workplace'] as const).map((cat) => {
                const Icon = CATEGORY_META[cat].icon
                return (
                  <Button
                    key={cat}
                    size="sm"
                    variant={category === cat ? 'default' : 'outline'}
                    onClick={() => setCategory(cat)}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {CATEGORY_META[cat].label}
                  </Button>
                )
              })}
              <div className="relative ml-auto min-w-[200px] flex-1 sm:flex-initial">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск сервиса..."
                  className="h-8 pl-8 text-xs"
                />
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {filteredCatalog.map((srv) => {
                const checked = srv.enabled
                return (
                  <div
                    key={srv.id}
                    onClick={() => void handleToggleService(srv.id, !checked)}
                    className={cn(
                      'cursor-pointer select-none rounded-lg border p-3 transition flex items-start justify-between gap-2.5',
                      checked
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:bg-accent/30'
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: srv.accent }}
                        />
                        <span className="font-medium text-sm truncate">{srv.title}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                        {srv.description}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                        {(srv.domainsCount ?? 0) > 0 && (
                          <span className="rounded bg-muted/70 px-1.5 py-0.5">
                            доменов: {srv.domainsCount}
                          </span>
                        )}
                        {(srv.ipsCount ?? 0) > 0 && (
                          <span className="rounded bg-muted/70 px-1.5 py-0.5">
                            IP/подсетей: {srv.ipsCount}
                          </span>
                        )}
                        {(srv.hostsCount ?? 0) > 0 && (
                          <span className="rounded bg-amber-500/15 text-amber-400 px-1.5 py-0.5">
                            hosts: {srv.hostsCount}
                          </span>
                        )}
                      </div>
                    </div>
                    <Switch
                      checked={checked}
                      onCheckedChange={(v) => void handleToggleService(srv.id, v)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* System Hosts Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-muted-foreground" />
                Системный файл Hosts
                {hostsState?.activeInFile ? (
                  <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                    Активно ({hostsState.entryCount} записей)
                  </span>
                ) : (
                  <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-normal text-muted-foreground">
                    Не применён
                  </span>
                )}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Некоторые сервисы (Instagram, Facebook, ChatGPT, Spotify, Notion, GitHub и др.) и
                моды требуют прописывания прямых IP-адресов в{' '}
                <code className="text-[11px]">C:\Windows\System32\drivers\etc\hosts</code>.
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <Label className="text-sm">Автоматически применять hosts при старте Zapret</Label>
                <span className="text-xs text-muted-foreground">
                  Записи помещаются в изолированный блок # === GhosterNet START ===
                </span>
              </div>
              <Switch
                checked={zapret?.systemHostsManaged ?? false}
                onCheckedChange={(v) =>
                  zapret && patchAppConfig({ zapret: { ...zapret, systemHostsManaged: v } })
                }
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button size="sm" onClick={() => void handleApplyHosts()} disabled={hostsBusy}>
                {hostsBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Применить в системный hosts
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleClearHosts()}
                disabled={hostsBusy || !hostsState?.activeInFile}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Очистить записи GhosterNet
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* User Custom Lists (4 Collections) */}
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  Пользовательские списки и исключения
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Ваши личные домены и IP сохраняются отдельно в{' '}
                  <code className="text-[11px]">*-user.txt</code> и не затираются при обновлении
                  сборки Zapret или переключении сервисов.
                </p>
              </div>
              <Button
                variant={rawEditorOpen ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setRawEditorOpen((v) => !v)}
              >
                <FileCode2 className="h-3.5 w-3.5" />
                {rawEditorOpen ? 'Скрыть редактор .txt' : 'Редактор файлов lists/*.txt'}
              </Button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { key: 'domains', label: 'Домены обхода' },
                  { key: 'exclude_domains', label: 'Исключения доменов' },
                  { key: 'all_ips', label: 'IP и подсети' },
                  { key: 'ips', label: 'Исключения IP' }
                ] as const
              ).map((col) => (
                <Button
                  key={col.key}
                  size="sm"
                  variant={activeCollection === col.key ? 'default' : 'outline'}
                  onClick={() => setActiveCollection(col.key)}
                >
                  {col.label}
                </Button>
              ))}
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Базовых записей: <strong>{currentCollection.baseCount}</strong> • Пользовательских:{' '}
                <strong>{currentCollection.userEntries.length}</strong>
              </span>
              <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                {currentCollection.userFilename}
              </code>
            </div>

            <div className="flex items-center gap-2">
              <Input
                value={newEntryInput}
                onChange={(e) => setNewEntryInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleAddCollectionItems()
                }}
                placeholder="Введите домен или IP/CIDR (можно несколько через пробел или запятую)..."
                className="font-mono text-xs"
              />
              <Button
                size="sm"
                onClick={() => void handleAddCollectionItems()}
                disabled={collectionBusy || !newEntryInput.trim()}
              >
                <Plus className="h-3.5 w-3.5" />
                Добавить
              </Button>
            </div>

            {currentCollection.userEntries.length === 0 ? (
              <div className="rounded-md border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                Пользовательский список пуст. Добавьте домены или IP-адреса выше.
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                {currentCollection.userEntries.map((val) => (
                  <div
                    key={val}
                    className="flex items-center justify-between gap-2 rounded-md border border-border bg-card/50 px-3 py-1.5 text-xs font-mono"
                  >
                    <span className="truncate">{val}</span>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="h-6 w-6 text-red-400 hover:text-red-300 shrink-0"
                      onClick={() => void handleRemoveItem(val)}
                      title="Удалить"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {rawEditorOpen && (
              <div className="mt-4 rounded-lg border border-border bg-background/50 p-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {RAW_LIST_FILES.map((fname) => (
                      <Button
                        key={fname}
                        size="sm"
                        variant={selectedRawFile === fname ? 'default' : 'outline'}
                        onClick={() => setSelectedRawFile(fname)}
                        className="h-7 text-xs font-mono"
                      >
                        {fname}
                      </Button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        selectedRawFile &&
                        zapretReadRawList(selectedRawFile).then((r) => setRawContent(r.content))
                      }
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => void handleSaveRawFile()}
                      disabled={rawSaving}
                    >
                      {rawSaving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      Сохранить {selectedRawFile}
                    </Button>
                  </div>
                </div>
                <textarea
                  value={rawContent}
                  onChange={(e) => setRawContent(e.target.value)}
                  rows={10}
                  spellCheck={false}
                  className="w-full rounded-md border border-border bg-background/80 p-2.5 font-mono text-xs focus:border-primary focus:outline-none"
                />
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                  <span>
                    Внимание: файлы <code className="font-mono">list-general.txt</code> и{' '}
                    <code className="font-mono">ipset-all.txt</code> автоматически пересобираются
                    при запуске Zapret. Для постоянных записей используйте файлы{' '}
                    <code className="font-mono">*-user.txt</code>.
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </BasePage>
  )
}

export default ServicesPage
