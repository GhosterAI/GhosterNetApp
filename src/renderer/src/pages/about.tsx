import React from 'react'
import { ExternalLink, Github } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import BasePage from '@renderer/components/base/base-page'
import { BUNDLED_TGWS_VERSION, BUNDLED_ZAPRET_VERSION } from '@renderer/lib/utils'

const About: React.FC = () => {
  const openUrl = (url: string): void => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <BasePage title="Информация">
      <div className="px-4 pb-6 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>О приложении GhosterNet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              <span className="font-semibold text-foreground">GhosterNet</span> — универсальный
              клиент для обхода сетевых ограничений DPI и ускорения Telegram на базе архитектуры{' '}
              <span className="text-foreground font-medium">Slipgate</span> и полного набора
              инструментов <span className="text-foreground font-medium">Zapret-Zen</span>.
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
                <code className="text-xs">unified-by-peshk0v (Hub)</code>, автоматическое
                тестирование стратегий, автоподбор режимов IPset и Игрового фильтра, блокировка
                QUIC и бесконфликтная работа совместно с VPN.
              </li>
              <li>
                <span className="font-semibold text-foreground">Каталог сервисов и Hosts</span> —
                24 готовых пресета для игр, соцсетей и ИИ-сервисов, 4 коллекции пользовательских
                списков и автоматическое управление системным файлом <code className="text-xs">hosts</code>.
              </li>
              <li>
                <span className="font-semibold text-foreground">DNS &amp; Диагностика</span> —
                переключение системных DNS/DoH (Xbox DNS, Comss, Cloudflare, Google, Quad9) и
                встроенная диагностика служб Windows с автоисправлением.
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
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Авторы и благодарности</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <p>
              <span className="font-semibold text-foreground">GhosterAI</span> — сборка и
              объединение функционала в <span className="font-medium">GhosterNet</span>
            </p>
            <p className="text-muted-foreground text-xs">
              Основано на проектах <span className="text-foreground">Slipgate</span> (lazzy &amp;
              cherry), <span className="text-foreground">Zapret-Zen</span> (peshk0v) и сборках{' '}
              <span className="text-foreground">Flowseal</span> / <span className="text-foreground">bol-van</span>.
            </p>
          </CardContent>
        </Card>
      </div>
    </BasePage>
  )
}

export default About
