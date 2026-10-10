import { useState } from 'react'
import { toast } from 'sonner'
import { Layers, Plus, Save, Trash2, Download, Upload, HardDrive } from 'lucide-react'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  appRelaunch,
  profilesSwitch,
  profilesCreate,
  profilesDelete,
  profilesSave,
  configExportDialog,
  configImportDialog
} from '@renderer/utils/ipc'
import BasePage from '@renderer/components/base/base-page'
import { UpdateCenterCard } from '@renderer/components/update-center-card'
import { cn, POWER_ON_BANNER_STYLE } from '@renderer/lib/utils'

const themes: AppTheme[] = ['dark', 'oled', 'night', 'light']
const themeLabels: Record<AppTheme, string> = {
  dark: 'Тёмная',
  oled: 'OLED Чёрная',
  night: 'Ночная (Navy)',
  light: 'Светлая'
}

const ACCENT_COLORS: { id: AccentColor; label: string; hex: string }[] = [
  { id: 'default', label: 'Монохром', hex: '#FAFAFA' },
  { id: 'violet', label: 'Фиолетовый', hex: '#8B5CF6' },
  { id: 'cyan', label: 'Бирюзовый', hex: '#06B6D4' },
  { id: 'emerald', label: 'Изумрудный', hex: '#10B981' },
  { id: 'blue', label: 'Синий', hex: '#3B82F6' },
  { id: 'amber', label: 'Янтарный', hex: '#F59E0B' },
  { id: 'rose', label: 'Рубиновый', hex: '#F43F5E' }
]

const Settings: React.FC = () => {
  const { appConfig, patchAppConfig, mutateAppConfig } = useAppConfig()
  const [newProfileName, setNewProfileName] = useState('')
  const [profileBusy, setProfileBusy] = useState(false)
  const [backupBusy, setBackupBusy] = useState(false)

  const profiles = appConfig?.profiles ?? []
  const activeProfileId = appConfig?.activeProfileId ?? 'default'

  const handleExportBackup = async (): Promise<void> => {
    if (backupBusy) return
    setBackupBusy(true)
    try {
      const res = await configExportDialog()
      if (res.saved) {
        toast.success('Профиль успешно экспортирован', {
          description: res.path,
          style: POWER_ON_BANNER_STYLE
        })
      }
    } catch (e) {
      toast.error('Не удалось экспортировать профиль', {
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setBackupBusy(false)
    }
  }

  const handleImportBackup = async (): Promise<void> => {
    if (backupBusy) return
    setBackupBusy(true)
    try {
      const res = await configImportDialog()
      if (res.ok) {
        mutateAppConfig()
        toast.success(res.message, { style: POWER_ON_BANNER_STYLE })
      }
    } catch (e) {
      toast.error('Не удалось импортировать профиль', {
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setBackupBusy(false)
    }
  }

  const handleSwitchProfile = async (id: string): Promise<void> => {
    if (profileBusy || id === activeProfileId) return
    setProfileBusy(true)
    try {
      await profilesSwitch(id)
      mutateAppConfig()
      const target = profiles.find((p) => p.id === id)
      toast.success(`Профиль переключён: ${target?.name ?? id}`, {
        style: POWER_ON_BANNER_STYLE
      })
    } catch (e) {
      toast.error('Не удалось переключить профиль', {
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setProfileBusy(false)
    }
  }

  const handleSaveCurrentProfile = async (): Promise<void> => {
    if (profileBusy) return
    setProfileBusy(true)
    try {
      await profilesSave()
      mutateAppConfig()
      toast.success('Текущие настройки сохранены в активный профиль', {
        style: POWER_ON_BANNER_STYLE
      })
    } catch (e) {
      toast.error('Ошибка сохранения профиля', {
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setProfileBusy(false)
    }
  }

  const handleCreateProfile = async (): Promise<void> => {
    if (!newProfileName.trim() || profileBusy) return
    setProfileBusy(true)
    try {
      await profilesCreate(newProfileName.trim())
      setNewProfileName('')
      mutateAppConfig()
      toast.success('Новый профиль создан', { style: POWER_ON_BANNER_STYLE })
    } catch (e) {
      toast.error('Не удалось создать профиль', {
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setProfileBusy(false)
    }
  }

  const handleDeleteProfile = async (id: string): Promise<void> => {
    if (profileBusy || id === 'default') return
    setProfileBusy(true)
    try {
      await profilesDelete(id)
      mutateAppConfig()
      toast.success('Профиль удалён')
    } catch (e) {
      toast.error('Не удалось удалить профиль', {
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setProfileBusy(false)
    }
  }

  return (
    <BasePage title="Настройки">
      <div className="px-4 pb-6 space-y-4">
        {/* Profiles Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                Профили конфигурации
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Быстрое переключение между наборами настроек (стратегия Zapret, Игровой фильтр,
                IPset, сервисы, моды, DNS и режим Telegram).
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleSaveCurrentProfile()}
              disabled={profileBusy}
            >
              <Save className="h-3.5 w-3.5" />
              Сохранить текущий
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {profiles.map((prof) => {
                const isActive = prof.id === activeProfileId
                return (
                  <div
                    key={prof.id}
                    onClick={() => void handleSwitchProfile(prof.id)}
                    className={cn(
                      'cursor-pointer rounded-lg border p-2.5 transition flex items-center justify-between gap-2',
                      isActive
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:bg-accent/30'
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-xs truncate">{prof.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {prof.activeStrategy
                          ? prof.activeStrategy.replace(/\.bat$/i, '')
                          : 'Стратегия не задана'}{' '}
                        • GF: {prof.gameFilterMode}
                      </div>
                    </div>
                    {prof.id !== 'default' && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="h-6 w-6 text-red-400 hover:text-red-300 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation()
                          void handleDeleteProfile(prof.id)
                        }}
                        title="Удалить профиль"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="flex items-center gap-2">
              <Input
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleCreateProfile()
                }}
                placeholder="Название нового профиля (например: Турнирный / Работа)..."
                className="h-8 text-xs"
              />
              <Button
                size="sm"
                onClick={() => void handleCreateProfile()}
                disabled={profileBusy || !newProfileName.trim()}
              >
                <Plus className="h-3.5 w-3.5" />
                Создать профиль
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Backup & Portability Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-emerald-400" />
                Резервная копия и перенос настроек
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Экспорт и импорт полного профиля <code className="text-[11px]">.ghosternet</code> со всеми вашими пользовательскими списками,
                стратегиями Zapret, параметрами моста TgWs, настройками DNS-AI и Antigravity.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleExportBackup()}
                disabled={backupBusy}
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Экспорт профиля
              </Button>
              <Button
                size="sm"
                variant="default"
                onClick={() => void handleImportBackup()}
                disabled={backupBusy}
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                Импорт профиля
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border/60 bg-card/40 p-3 text-xs text-muted-foreground flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="font-medium text-foreground">Быстрый перенос на другой ПК или ноутбук</div>
                <div>Файл бэкапа содержит полную конфигурацию GhosterNet и восстанавливается в 1 клик без ручной настройки.</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono text-[11px] px-2.5 py-1 rounded bg-muted/60 text-muted-foreground border border-border/40">
                  *.ghosternet / *.json
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Внешний вид</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm">Тема оформления</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {themes.map((theme) => (
                  <Button
                    key={theme}
                    size="sm"
                    variant={appConfig?.appTheme === theme ? 'default' : 'outline'}
                    onClick={() => patchAppConfig({ appTheme: theme })}
                  >
                    {themeLabels[theme]}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-sm">Акцентный цвет</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {ACCENT_COLORS.map((c) => {
                  const selected = (appConfig?.accentColor ?? 'default') === c.id
                  return (
                    <Button
                      key={c.id}
                      size="sm"
                      variant={selected ? 'default' : 'outline'}
                      onClick={() => patchAppConfig({ accentColor: c.id })}
                      className="gap-1.5"
                    >
                      <span
                        className="inline-block h-3 w-3 rounded-full border border-white/20"
                        style={{ backgroundColor: c.hex }}
                      />
                      {c.label}
                    </Button>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <UpdateCenterCard />

        <Card>
          <CardHeader>
            <CardTitle>Запуск и питание</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Запускать при входе в Windows</Label>
              <Switch
                checked={appConfig?.autoLaunch ?? false}
                onCheckedChange={(v) => patchAppConfig({ autoLaunch: v })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Тихий старт (в системный трей без окна)</Label>
              <Switch
                checked={appConfig?.silentStart ?? false}
                onCheckedChange={(v) => patchAppConfig({ silentStart: v })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Автозапуск Telegram WS Proxy</Label>
              <Switch
                checked={appConfig?.tgws?.autoStart ?? false}
                onCheckedChange={(v) =>
                  patchAppConfig({ tgws: { ...appConfig!.tgws!, autoStart: v } })
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Автозапуск Zapret</Label>
              <Switch
                checked={appConfig?.zapret?.autoStart ?? false}
                onCheckedChange={(v) =>
                  patchAppConfig({ zapret: { ...appConfig!.zapret!, autoStart: v } })
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <Label className="text-sm">Автоперезапуск после выхода из сна (Wake)</Label>
                <span className="text-xs text-muted-foreground">
                  Автоматически перезапускает активные процессы Zapret и TgWsProxy при пробуждении
                  ПК
                </span>
              </div>
              <Switch
                checked={appConfig?.autoRestartOnWake ?? true}
                onCheckedChange={(v) => patchAppConfig({ autoRestartOnWake: v })}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Интерфейс</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <Label className="text-sm">Иконка в системном трее</Label>
                <span className="text-xs text-muted-foreground">
                  Если выключена — при нажатии на «X» приложение полностью закрывается и завершает
                  работу.
                </span>
              </div>
              <Switch
                checked={!(appConfig?.disableTray ?? false)}
                onCheckedChange={(v) => patchAppConfig({ disableTray: !v })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <Label className="text-sm">Убрать иконку с панели задач</Label>
                <span className="text-xs text-muted-foreground">
                  Скрывает окно из панели задач при сворачивании в трей.
                </span>
              </div>
              <Switch
                checked={appConfig?.hideTaskbarIcon ?? false}
                onCheckedChange={(v) => patchAppConfig({ hideTaskbarIcon: v })}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Дополнительно</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Отключить аппаратное ускорение GPU (нужен перезапуск)</Label>
              <Switch
                checked={appConfig?.disableGPU ?? false}
                onCheckedChange={(v) => patchAppConfig({ disableGPU: v })}
              />
            </div>
            <Button size="sm" variant="outline" onClick={() => appRelaunch()}>
              Перезапустить приложение
            </Button>
          </CardContent>
        </Card>
      </div>
    </BasePage>
  )
}

export default Settings
