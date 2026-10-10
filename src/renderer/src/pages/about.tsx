import React from 'react'
import { ExternalLink, Github } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import BasePage from '@renderer/components/base/base-page'
import { BUNDLED_TGWS_VERSION, BUNDLED_ZAPRET_VERSION } from '@renderer/lib/utils'
import ghostSculpture from '@renderer/assets/ghost-sculpture.svg'

const About: React.FC = () => {
  const openUrl = (url: string): void => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <BasePage title="Информация">
      <div className="px-4 pb-6 space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-center gap-3.5 pb-2">
            <img
              src={ghostSculpture}
              alt="GhosterNet"
              draggable={false}
              className="h-12 w-12 object-contain select-none pointer-events-none shrink-0"
            />
            <div>
              <CardTitle>О приложении GhosterNet</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Свободная сеть без границ — Zapret, Telegram WS Proxy, DNS-AI и Antigravity Unlocker
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              <span className="font-semibold text-foreground">GhosterNet</span> — универсальный
              клиент для обхода сетевых ограничений DPI, ускорения Telegram и разблокировки ИИ-сервисов
              с полной поддержкой системных служб, DNS-AI, Antigravity Unlocker и пользовательских списков.
            </p>
            <p>Ключевые возможности приложения:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <span className="font-semibold text-foreground">
                  Telegram WS Proxy (v{BUNDLED_TGWS_VERSION})
                </span>{' '}
                — встроенный локальный MTProto-прокси поверх WebSocket с автоподбором самого
                быстрого Cloudflare-моста, режимом ускорения медиа (DC1–DC5) и поддержкой
                Fake-TLS.
              </li>
              <li>
                <span className="font-semibold text-foreground">
                  Zapret DPI Bypass (v{BUNDLED_ZAPRET_VERSION})
                </span>{' '}
                — 20+ базовых стратегий обхода блокировок + встроенный мод{' '}
                <code className="text-xs">GhosterNet Hub</code>, автоматическое тестирование
                стратегий, автоподбор режимов IPset и Игрового фильтра, блокировка QUIC и
                бесконфликтная работа совместно с VPN.
              </li>
              <li>
                <span className="font-semibold text-foreground">
                  Antigravity Unlocker (v2.21.1)
                </span>{' '}
                — работа Google Antigravity IDE без VPN и смены региона аккаунта Google через
                локальный туннель, Loopback IP, Hosts Pinning и патчинг IDE.
              </li>
              <li>
                <span className="font-semibold text-foreground">
                  DNS-AI (v1.0.0) &amp; Системный DNS
                </span>{' '}
                — локальный зашифрованный DoH/DoT резолвер (127.0.0.1:53) с поддержкой Comss,
                Xbox DNS, Malw.link, Cloudflare и Quad9 для разблокировки ChatGPT, Claude, Gemini
                и Copilot, а также встроенная диагностика служб Windows.
              </li>
              <li>
                <span className="font-semibold text-foreground">Каталог сервисов и Hosts</span> —
                24 готовых пресета для игр, соцсетей и ИИ-сервисов, 4 коллекции пользовательских
                списков и автоматическое управление системным файлом <code className="text-xs">hosts</code>.
              </li>
            </ul>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => openUrl('https://github.com/GhosterAI/GhosterNetApp')}
              >
                <Github className="h-3.5 w-3.5" />
                GhosterAI/GhosterNetApp
                <ExternalLink className="h-3 w-3 opacity-70" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => openUrl('https://github.com/Flowseal/zapret-discord-youtube')}
              >
                Flowseal/zapret-discord-youtube
                <ExternalLink className="h-3 w-3 opacity-70" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => openUrl('https://github.com/Flowseal/tg-ws-proxy')}
              >
                Flowseal/tg-ws-proxy
                <ExternalLink className="h-3 w-3 opacity-70" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => openUrl('https://github.com/confeden/DNS-AI')}
              >
                confeden/DNS-AI
                <ExternalLink className="h-3 w-3 opacity-70" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => openUrl('https://github.com/confeden/Antigravity')}
              >
                confeden/Antigravity
                <ExternalLink className="h-3 w-3 opacity-70" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Разработка и авторы</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <p>
              <span className="font-semibold text-foreground">GhosterAI</span> — разработка и
              поддержка <span className="font-medium">GhosterNet</span>.
            </p>
            <p className="text-muted-foreground text-xs">
              Встроенные сетевые компоненты: <span className="text-foreground">Flowseal</span> (Zapret, TgWsProxy),{' '}
              <span className="text-foreground">confeden</span> (DNS-AI, Antigravity) и{' '}
              <span className="text-foreground">bol-van</span> (zapret core).
            </p>
          </CardContent>
        </Card>
      </div>
    </BasePage>
  )
}

export default About
