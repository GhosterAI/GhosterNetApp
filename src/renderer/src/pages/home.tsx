import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import NumberFlow from '@number-flow/react'
import BasePage from '@renderer/components/base/base-page'
import { Spinner } from '@renderer/components/ui/spinner'
import { CharacterMorph } from '@renderer/components/ui/character-morph'
import { useTgwsStore } from '@renderer/store/tgws-store'
import { useZapretStore } from '@renderer/store/zapret-store'
import { useZapretTestStore } from '@renderer/store/zapret-test-store'
import { useVpnStore } from '@renderer/store/vpn-store'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import {
  tgwsStart, tgwsStop, tgwsRestart,
  zapretStart, zapretStop, zapretRestart,
  vpnStart, vpnStop, vpnRestart,
  profilesSwitch,
  getAppVersion
} from '@renderer/utils/ipc'
import { Button } from '@renderer/components/ui/button'
import { POWER_ON_BANNER_STYLE, BUNDLED_TGWS_VERSION, BUNDLED_ZAPRET_VERSION } from '@renderer/lib/utils'
import { RotateCw, Layers } from 'lucide-react'
import { CountryFlag, detectCountryCode } from '@renderer/components/ui/country-flag'
import Power from '@renderer/assets/on_icon.svg'
import Pause from '@renderer/assets/pause_icon.svg'

interface PowerToggleProps {
  label: string
  status: CoreStatus
  onToggle: (next: boolean) => Promise<void> | void
  // Currently-installed upstream version of the underlying binary or server badge
  version?: React.ReactNode
  disabled?: boolean
  disabledReason?: string
}

function stripEmojis(str?: string): string {
  if (!str) return ''
  return str
    .replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FE0F}]|[\u{1F300}-\u{1F9FF}]|[\u{2B50}-\u{2B55}]|[\u{200D}]|[\u{2300}-\u{23FF}]/gu, '')
    .trim()
}

const PowerToggle: React.FC<PowerToggleProps> = ({
  label, status, onToggle, version, disabled = false, disabledReason
}) => {
  const { t } = useTranslation()
  const [pending, setPending] = useState<null | boolean>(null)
  const isSelected = pending ?? status.state === 'running'
  const ipcLoading = status.state === 'starting' || status.state === 'stopping'
  const loading = ipcLoading || pending !== null
  const loadingDirection: 'connecting' | 'disconnecting' =
    status.state === 'stopping' || pending === false ? 'disconnecting' : 'connecting'

  const handleClick = async (): Promise<void> => {
    if (disabled || pending !== null || status.state === 'stopping') return
    // Allow canceling while starting
    if (status.state === 'starting') {
      setPending(false)
      try {
        await onToggle(false)
      } finally {
        setPending(null)
      }
      return
    }
    const next = !isSelected
    setPending(next)
    try {
      await onToggle(next)
    } finally {
      setPending(null)
    }
  }

  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!isSelected || !status.startedAt) {
      setElapsed(0)
      return
    }
    const tick = (): void => setElapsed(Math.floor((Date.now() - status.startedAt!) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [isSelected, status.startedAt])

  const statusText = loading
    ? loadingDirection === 'connecting'
      ? t('pages.home.connecting', { defaultValue: 'ПОДКЛЮЧЕНИЕ' })
      : t('pages.home.disconnecting', { defaultValue: 'ОТКЛЮЧЕНИЕ' })
    : isSelected
      ? t('pages.home.connected', { defaultValue: 'ПОДКЛЮЧЕНО' })
      : t('pages.home.disconnected', { defaultValue: 'ОТКЛЮЧЕНО' })
  const reserveTexts = [
    t('pages.home.connecting', { defaultValue: 'ПОДКЛЮЧЕНИЕ' }),
    t('pages.home.disconnecting', { defaultValue: 'ОТКЛЮЧЕНИЕ' }),
    t('pages.home.connected', { defaultValue: 'ПОДКЛЮЧЕНО' }),
    t('pages.home.disconnected', { defaultValue: 'ОТКЛЮЧЕНО' })
  ]

  const showTimer = !loading && isSelected
  const h = Math.floor(elapsed / 3600)
  const m = Math.floor((elapsed % 3600) / 60)
  const s = elapsed % 60

  return (
    <div className="flex flex-col items-center justify-center min-w-0">
      {/* Service label */}
      <div className="mb-1 text-sm font-medium text-foreground/80 uppercase tracking-wider">
        {label}
      </div>

      {/* Status text — animated character morph */}
      <div className="mb-3 flex h-6 items-center justify-center">
        <CharacterMorph
          texts={[statusText]}
          reserveTexts={reserveTexts}
          interval={3000}
          className="h-6 leading-none text-foreground font-semibold uppercase"
        />
      </div>

      {/* The disc */}
      <button
        disabled={pending !== null || disabled || status.state === 'stopping'}
        onClick={handleClick}
        title={disabled ? disabledReason : status.state === 'starting' ? 'Нажмите, чтобы отменить подключение' : undefined}
        className={`relative group transition-transform active:scale-95 cursor-pointer disabled:cursor-not-allowed ${
          disabled ? 'opacity-60' : ''
        }`}
      >

        <div
          className={`w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300 bg-radial-[at_30%_45%] backdrop-blur-xl border-2 ${
            isSelected
              ? 'from-gradient-start-power-on/60 to-gradient-end-power-on/60 border-stroke-power-on'
              : 'from-gradient-start-power-off/60 to-gradient-end-power-off/60 border-stroke-power-off'
          }`}
        >
          <div className="relative size-16">
            <Spinner
              className={`absolute inset-0 m-auto size-16 text-[#FAFAFA] transition-all duration-300 ease-out ${
                loading ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
              }`}
            />
            <img
              src={Pause}
              alt=""
              className={`absolute inset-0 size-16 fill-foreground transition-all duration-300 ease-out ${
                !loading && isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
              }`}
            />
            <img
              src={Power}
              alt=""
              className={`absolute inset-0 size-16 fill-foreground transition-all duration-300 ease-out ${
                !loading && !isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
              }`}
            />
          </div>
        </div>
      </button>

      {/* Animated uptime timer */}
      <div className="mt-3 h-8 flex items-center justify-center">
        <div
          aria-hidden={!showTimer}
          className={`inline-flex items-center gap-0.5 text-base font-bold text-foreground tabular-nums transition-all duration-300 ease-out ${
            showTimer ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'
          }`}
        >
          <NumberFlow value={h} format={{ minimumIntegerDigits: 2, useGrouping: false }} />
          <span>:</span>
          <NumberFlow value={m} format={{ minimumIntegerDigits: 2, useGrouping: false }} />
          <span>:</span>
          <NumberFlow value={s} format={{ minimumIntegerDigits: 2, useGrouping: false }} />
        </div>
      </div>

      {version && (
        <div className="mt-1 text-[11px] text-foreground/60 flex items-center justify-center gap-1.5 tabular-nums truncate max-w-[170px]">
          {typeof version === 'string' && /^\d/.test(version) ? `v${version}` : version}
        </div>
      )}

      {disabled && disabledReason && (
        <div className="mt-1 max-w-[180px] text-[11px] text-foreground/70 text-center leading-tight">
          {disabledReason}
        </div>
      )}

      {status.lastError && (
        <div className="mt-2 text-[11px] text-stroke-power-off text-center max-w-xs truncate">
          {status.lastError}
        </div>
      )}
    </div>
  )
}

const Home: React.FC = () => {
  const navigate = useNavigate()
  const tgws = useTgwsStore((s) => s.status)
  const zapret = useZapretStore((s) => s.status)
  const vpn = useVpnStore((s) => s.status)

  const isZapretTesting = useZapretTestStore((s) => s.isRunning)
  const { appConfig, mutateAppConfig } = useAppConfig()

  const zapretStrategy = appConfig?.zapret?.activeStrategy
  const profiles = appConfig?.profiles ?? []
  const activeProfileId = appConfig?.activeProfileId ?? 'default'

  const handleQuickProfile = async (id: string): Promise<void> => {
    if (id === activeProfileId) return
    try {
      await profilesSwitch(id)
      mutateAppConfig()
      const p = profiles.find((item) => item.id === id)
      toast.success(`Профиль: ${p?.name ?? id}`, { style: POWER_ON_BANNER_STYLE })
    } catch (e) {
      toast.error('Ошибка смены профиля', {
        description: e instanceof Error ? e.message : String(e)
      })
    }
  }

  const toggleTgws = async (next: boolean): Promise<void> => {
    try {
      if (next) await tgwsStart()
      else await tgwsStop()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(next ? 'Не удалось запустить Telegram' : 'Не удалось остановить Telegram', {
        description: msg
      })
    }
  }

  const toggleZapret = async (next: boolean): Promise<void> => {
    if (next && !zapretStrategy) {
      navigate('/zapret', { state: { autoStart: true } })
      return
    }
    try {
      if (next) await zapretStart()
      else await zapretStop()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(next ? 'Не удалось запустить Zapret' : 'Не удалось остановить Zapret', {
        description: msg
      })
    }
  }

  const toggleVpn = async (next: boolean): Promise<void> => {
    const hasServers = Boolean(appConfig?.vpn?.servers && appConfig.vpn.servers.length > 0)
    if (next && !hasServers && !appConfig?.vpn?.selectedServerId) {
      navigate('/vpn')
      return
    }
    try {
      if (next) await vpnStart()
      else await vpnStop()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(next ? 'Не удалось запустить VPN' : 'Не удалось остановить VPN', {
        description: msg
      })
    }
  }

  // App version pulled from main via IPC (electron's app.getVersion()
  const [appVersion, setAppVersion] = useState<string | null>(null)
  useEffect(() => {
    getAppVersion().then(setAppVersion).catch(() => setAppVersion(null))
  }, [])

  const [reloading, setReloading] = useState(false)
  const handleReloadAll = async (): Promise<void> => {
    if (reloading) return
    setReloading(true)
    try {
      const tasks: Promise<unknown>[] = []
      if (tgws.state === 'running' || tgws.state === 'error') tasks.push(tgwsRestart())
      if (zapret.state === 'running' || zapret.state === 'error') tasks.push(zapretRestart())
      if (vpn.state === 'running' || vpn.state === 'error') tasks.push(vpnRestart())
      if (tasks.length === 0) {
        toast.info('Нет запущенных процессов для перезагрузки', {
          style: {
            background:
              'radial-gradient(at 30% 45%, color-mix(in oklab, var(--gradient-start-power-off) 60%, transparent), color-mix(in oklab, var(--gradient-end-power-off) 60%, transparent))',
            borderColor: 'var(--stroke-power-off)',
            color: 'var(--foreground)'
          }
        })
        return
      }
      await Promise.allSettled(tasks)
      toast.success('Процессы перезагружены', {
        style: POWER_ON_BANNER_STYLE
      })
    } catch (e) {
      toast.error('Не удалось перезагрузить процессы', {
        description: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setReloading(false)
    }
  }

  const anyProcessActive =
    tgws.state === 'running' ||
    tgws.state === 'error' ||
    zapret.state === 'running' ||
    zapret.state === 'error' ||
    vpn.state === 'running' ||
    vpn.state === 'error'

  return (
    <BasePage>
      <div className="relative flex flex-col h-full overflow-y-auto px-4 py-2 space-y-4">
        {/* Top Bar: Profiles */}
        <div className="flex flex-wrap items-center gap-2 max-w-5xl mx-auto w-full">
          {profiles.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground mr-1">
                <Layers className="size-3.5" />
                Профиль:
              </span>
              {profiles.map((p) => (
                <Button
                  key={p.id}
                  size="sm"
                  variant={p.id === activeProfileId ? 'default' : 'outline'}
                  onClick={() => void handleQuickProfile(p.id)}
                  className="h-7 px-2.5 text-xs rounded-full"
                >
                  {p.name}
                </Button>
              ))}
            </div>
          ) : null}
        </div>

        {/* 3 Main Power Switches */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-4 items-center max-w-5xl mx-auto w-full">
          <PowerToggle
            label="Zapret"
            status={zapret}
            onToggle={toggleZapret}
            version={appConfig?.zapret?.installedVersion ?? BUNDLED_ZAPRET_VERSION}
            disabled={isZapretTesting}
            disabledReason={
              isZapretTesting
                ? 'Идёт тестирование стратегий — переключатель заблокирован'
                : undefined
            }
          />
          <PowerToggle
            label="Telegram"
            status={tgws}
            onToggle={toggleTgws}
            version={appConfig?.tgws?.installedVersion ?? BUNDLED_TGWS_VERSION}
          />
          <PowerToggle
            label="VPN"
            status={vpn}
            onToggle={toggleVpn}
            version={
              vpn.activeServer ? (
                <span className="inline-flex items-center gap-1.5 truncate max-w-[170px]">
                  <CountryFlag
                    code={vpn.activeServer.countryCode || detectCountryCode(vpn.activeServer.name)}
                    className="w-3.5 h-2.5 rounded-[1px]"
                  />
                  <span className="truncate">
                    {stripEmojis(vpn.activeServer.name) || vpn.activeServer.name}
                  </span>
                </span>
              ) : appConfig?.vpn?.servers?.length ? (
                `${appConfig.vpn.servers.length} серв.`
              ) : (
                'sing-box'
              )
            }
          />
        </div>

        {/* Footer controls */}
        <div className="flex items-center justify-center pb-4">
          {anyProcessActive && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleReloadAll}
              disabled={reloading}
              title="Перезагрузить запущенные процессы"
              className="rounded-full size-9 bg-card/45 backdrop-blur-md border border-border/30 text-muted-foreground hover:text-foreground"
            >
              <RotateCw className={`size-4 ${reloading ? 'animate-spin' : ''}`} />
            </Button>
          )}
        </div>

        {appVersion && (
          <div className="pointer-events-none absolute bottom-2 right-3 text-[11px] text-muted-foreground/50 select-none">
            GhosterNet <span className="font-mono">v{appVersion}</span>
          </div>
        )}
      </div>
    </BasePage>
  )
}

export default Home
