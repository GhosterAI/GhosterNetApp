import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useZapretStore } from '@renderer/store/zapret-store'
import { useTgwsStore } from '@renderer/store/tgws-store'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import {
  dnsAiGetStatus,
  agGetStatus,
  hostsStatus,
  type DnsAiStatus,
  type AgUnlockerStatus,
  type SystemHostsState
} from '@renderer/utils/ipc'
import { Zap, Send, Cpu, Rocket, FileCode2 } from 'lucide-react'

export const LiveSecurityHud: React.FC = () => {
  const navigate = useNavigate()
  const zapret = useZapretStore((s) => s.status)
  const tgws = useTgwsStore((s) => s.status)
  const { appConfig } = useAppConfig()

  const [dnsAi, setDnsAi] = useState<DnsAiStatus | null>(null)
  const [ag, setAg] = useState<AgUnlockerStatus | null>(null)
  const [hosts, setHosts] = useState<SystemHostsState | null>(null)

  useEffect(() => {
    let unmounted = false
    const poll = async (): Promise<void> => {
      try {
        const [d, a, h] = await Promise.all([
          dnsAiGetStatus().catch(() => null),
          agGetStatus().catch(() => null),
          hostsStatus().catch(() => null)
        ])
        if (!unmounted) {
          if (d) setDnsAi(d)
          if (a) setAg(a)
          if (h) setHosts(h)
        }
      } catch {
        // ignore
      }
    }

    void poll()
    const timer = setInterval(poll, 4000)
    return () => {
      unmounted = true
      clearInterval(timer)
    }
  }, [])

  const zapretRunning = zapret.state === 'running'
  const strategyName = appConfig?.zapret?.activeStrategy?.replace(/\.bat$/i, '') || 'Auto'

  const tgwsRunning = tgws.state === 'running'
  const cfProxyActive = Boolean(appConfig?.tgws?.cfproxy)

  const dnsAiActive = Boolean(dnsAi?.enabled)
  const dnsAiMode =
    dnsAi?.settings?.mode === 'native'
      ? 'Native Win11'
      : dnsAi?.serviceRunning
        ? 'DoH 127.0.0.1:53'
        : 'DoH Stub'

  const agActive = Boolean(ag && (ag.relayRunning || ag.nrptApplied || ag.proxyEnvSet))
  const agMode = ag?.relayRunning ? 'Relay & Watchdog' : agActive ? 'Обход активен' : 'Отключён'

  const hostsActive = Boolean(hosts?.activeInFile)
  const hostsCount = hosts?.entryCount ?? 0

  const items = [
    {
      id: 'zapret',
      title: 'Zapret DPI',
      value: zapretRunning ? strategyName : 'Выкл',
      active: zapretRunning,
      path: '/zapret',
      icon: Zap,
      accent: 'emerald',
      tooltip: zapretRunning ? `Zapret активен: стратегия ${strategyName}` : 'Zapret DPI отключён'
    },
    {
      id: 'tgws',
      title: 'Telegram WS',
      value: tgwsRunning ? (cfProxyActive ? 'CF-мост' : 'Активен') : 'Выкл',
      active: tgwsRunning,
      path: '/telegram',
      icon: Send,
      accent: 'sky',
      tooltip: tgwsRunning ? `TgWsProxy активен (порт ${appConfig?.tgws?.port ?? 21466})` : 'TG WS Proxy отключён'
    },
    {
      id: 'dnsai',
      title: 'DNS-AI',
      value: dnsAiActive ? dnsAiMode : 'Выкл',
      active: dnsAiActive,
      path: '/network',
      icon: Cpu,
      accent: 'indigo',
      tooltip: dnsAiActive ? `DNS-AI активен (${dnsAiMode})` : 'Шифрованный DoH отключён'
    },
    {
      id: 'antigravity',
      title: 'Antigravity',
      value: agActive ? agMode : 'Выкл',
      active: agActive,
      path: '/antigravity',
      icon: Rocket,
      accent: 'violet',
      tooltip: agActive ? `Antigravity: ${agMode}` : 'Google Antigravity обход отключён'
    },
    {
      id: 'hosts',
      title: 'Hosts',
      value: hostsActive ? `${hostsCount} правил` : 'Системный',
      active: hostsActive,
      path: '/services',
      icon: FileCode2,
      accent: 'amber',
      tooltip: hostsActive ? `В файле hosts активно ${hostsCount} правил GhosterNet` : 'Записи в hosts не внесены'
    }
  ]

  return (
    <div className="w-full px-3 py-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar app-nodrag border-t border-border/20 bg-background/50">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mr-1 shrink-0 select-none">
        HUD:
      </span>
      {items.map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.id}
            type="button"
            title={item.tooltip}
            onClick={() => navigate(item.path)}
            className={`group inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-mono border transition-all cursor-pointer shrink-0 select-none ${
              item.active
                ? 'bg-card/70 border-emerald-500/30 text-foreground hover:border-emerald-500/60 hover:bg-card'
                : 'bg-card/30 border-border/40 text-muted-foreground hover:text-foreground hover:bg-card/50 hover:border-border'
            }`}
          >
            <span
              className={`size-1.5 rounded-full transition-all ${
                item.active
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse'
                  : 'bg-muted-foreground/40'
              }`}
            />
            <Icon
              className={`size-3 transition-colors ${
                item.active ? 'text-emerald-400' : 'text-muted-foreground/60 group-hover:text-muted-foreground'
              }`}
            />
            <span className="font-sans font-medium text-[11px] text-foreground/80">{item.title}:</span>
            <span
              className={`truncate max-w-[110px] ${
                item.active ? 'text-emerald-400 font-semibold' : 'text-muted-foreground/70'
              }`}
            >
              {item.value}
            </span>
          </button>
        )
      })}
    </div>
  )
}
export default LiveSecurityHud
