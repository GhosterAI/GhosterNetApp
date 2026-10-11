import React from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTheme } from 'next-themes'
import { Home as HomeIcon, ScrollText, Settings as SettingsIcon, Info as InfoIcon, Blocks, Rocket, Globe } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import ZapretIcon from '@renderer/components/zapret-icon'
import TelegramIcon from '@renderer/components/telegram-icon'
import logoDark from '@renderer/assets/logo.png'
import logoLight from '@renderer/assets/logo_white.png'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@renderer/components/ui/sidebar'

const nav = [
  { key: 'home',        path: '/home',        icon: HomeIcon,     label: 'Главная' },
  { key: 'vpn',         path: '/vpn',         icon: Globe,        label: 'VPN' },
  { key: 'telegram',    path: '/telegram',    icon: TelegramIcon, label: 'Telegram' },
  { key: 'zapret',      path: '/zapret',      icon: ZapretIcon,   label: 'Zapret' },
  { key: 'antigravity', path: '/antigravity', icon: Rocket,       label: 'Antigravity' },
  { key: 'network',     path: '/network',     icon: Blocks,       label: 'Сеть и DNS' },
  { key: 'settings',    path: '/settings',    icon: SettingsIcon, label: 'Настройки' }
]

const AppSidebar: React.FC = () => {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const { resolvedTheme } = useTheme()
  const logoSrc = resolvedTheme === 'light' ? logoLight : logoDark

  return (
    <Sidebar collapsible="icon" side="left" variant="floating">
      <SidebarHeader className="h-14.25 p-0 flex items-center justify-center shrink-0">
        <img
          src={logoSrc}
          alt="GhosterNet"
          draggable={false}
          className="h-9 w-9 object-contain select-none pointer-events-none"
        />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {nav.map((item) => {
                const Icon = item.icon
                const isActive =
                  location.pathname.startsWith(item.path) ||
                  (item.key === 'zapret' && location.pathname.startsWith('/services'))
                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton
                      className={cn(
                        "cursor-pointer rounded-xl transition-all duration-200 border",
                        isActive
                          ? "bg-primary/15 border-primary/40 text-primary font-medium shadow-xs"
                          : "border-transparent text-muted-foreground hover:bg-muted/40 hover:border-border/30 hover:text-foreground"
                      )}
                      tooltip={item.label}
                      isActive={isActive}
                      onClick={() => navigate(item.path)}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span>{t(`sider.${item.key}`, { defaultValue: item.label })}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Логи"
              isActive={location.pathname.startsWith('/logs')}
              onClick={() => navigate('/logs')}
              className={cn(
                "cursor-pointer rounded-xl transition-all duration-200 border",
                location.pathname.startsWith('/logs')
                  ? "bg-primary/15 border-primary/40 text-primary font-medium shadow-xs"
                  : "border-transparent text-muted-foreground hover:bg-muted/40 hover:border-border/30 hover:text-foreground"
              )}
            >
              <ScrollText className="size-4 shrink-0" />
              <span>Логи</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="О программе"
              isActive={location.pathname.startsWith('/about')}
              onClick={() => navigate('/about')}
              className={cn(
                "cursor-pointer rounded-xl transition-all duration-200 border",
                location.pathname.startsWith('/about')
                  ? "bg-primary/15 border-primary/40 text-primary font-medium shadow-xs"
                  : "border-transparent text-muted-foreground hover:bg-muted/40 hover:border-border/30 hover:text-foreground"
              )}
            >
              <InfoIcon className="size-4 shrink-0" />
              <span>О программе</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

export default AppSidebar
