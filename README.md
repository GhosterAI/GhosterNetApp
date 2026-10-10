<div align="center">
  <h1>GhosterNet</h1>
  <p><strong>Универсальный клиент для обхода сетевых ограничений (DPI Bypass) и ускорения Telegram на Windows</strong></p>
  <p>
    <a href="https://github.com/GhosterAI/GhosterNetApp/releases/latest">Скачать последнюю версию (Windows x64)</a>
    ·
    <a href="https://github.com/GhosterAI/GhosterNetApp/issues">Сообщить об ошибке</a>
  </p>
</div>

---

## О проекте

**GhosterNet** — десктопное приложение для Windows (Electron + React + TypeScript), объединяющее локальный WebSocket-прокси для Telegram (**TgWsProxy**) и систему обхода блокировок на пакетном уровне (**Zapret / WinDivert**) с расширенным управлением сервисами, DNS/DoH, системным файлом `hosts`, модами и диагностикой сети.

---

## Основные возможности

### 1. Telegram WS Proxy (`v1.11.1`)
- Локальный MTProto-прокси поверх WebSocket (`127.0.0.1:1443`) для мгновенной работы звонков, видео, кружков и загрузки файлов в Telegram.
- **Автоподбор моста (`Fast Tune` / `Full Tune`)**: автоматическое тестирование задержки TLS/WebSocket рукопожатий и прямой доступности датацентров Telegram (`DC1–DC5`).
- **Режимы маршрутизации медиа**:
  - `Стандартный (Все DC)` — базовый маппинг DC2/DC4 с резервированием через WS-мост.
  - `Ускорение медиа (DC 1–5)` — прямые маршруты ко всем 5 датацентрам для максимальной скорости загрузки медиа.
  - `Свой список DC:IP` — ручная конфигурация пар `DC:IP`.
- Поддержка кастомного `cfproxy-user-domain`, Fake-TLS домена (`ee`-секреты) и флагов `--no-h2` / `--no-secure`.

### 2. Обход DPI — Zapret (`v1.10.3`)
- Более 20 встроенных стратегий `winws.exe` + встроенный пакет расширения **`GhosterNet Hub`** (`ALT7–12.2`, `EA`, `Minecraft`).
- **Автоматическое тестирование стратегий** по целям выбранных сервисов с расчётом рейтинга и подсветкой лучшей стратегии под вашего провайдера.
- **Автоподбор параметров фильтрации (`IPset × Game Filter`)**: автоматический бенчмарк комбинаций режимов на выбранной стратегии.
- **Режимы IPset**:
  - `Loaded` — полный список IP-подсетей (`ipset-all.txt`).
  - `None` — обход только по доменным именам.
  - `Any` — агрессивный перехват всех IP (`0.0.0.0/0`).
- **Игровой фильтр (порты `1024–65535`)**: `Выключен`, `TCP + UDP`, `Только TCP`, `Только UDP`.
- **Блокировка QUIC (UDP 443)** через брандмауэр Windows для принудительного перехода браузеров на TLS/TCP.
- **Совместимость с VPN**: автоматическое обнаружение активных VPN/TUN/WireGuard-соединений и исключение их IP и UDP-портов (`51820` и др.) из перехвата WinDivert.

### 3. Каталог сервисов, списки и системный Hosts
- **24 готовых пресета сервисов** в 3 категориях:
  - *Игры и лаунчеры*: Epic Games, Battle.net, Riot Games, League of Legends (включая спец-профиль TCP 2099 `syndata`), Roblox, Minecraft / Modrinth / CurseForge, Steam, EA / Origin, Ubisoft Connect, Genshin Impact / HoYoverse.
  - *Соцсети и медиа*: YouTube, Discord, Telegram, Twitch, Spotify, Instagram / Facebook, X (Twitter), TikTok, SoundCloud, Rutracker.
  - *Работа и ИИ*: ChatGPT / OpenAI, Claude / Gemini / Copilot, GitHub, Notion / Figma / Canva.
- **4 коллекции пользовательских списков** (`list-general-user.txt`, `list-exclude-user.txt`, `ipset-all-user.txt`, `ipset-exclude-user.txt`) и встроенный редактор файлов `lists/*.txt`.
- **Менеджер системного файла `hosts`** (`C:\Windows\System32\drivers\etc\hosts`): безопасное добавление и очистка изолированного блока `# === GhosterNet START/END ===` с автоматическим сбросом DNS-кэша (`ipconfig /flushdns`).

### 4. Моды, DNS & DoH и Диагностика
- **Управление DNS и DoH**: быстрое переключение системных DNS-серверов (*Xbox DNS*, *Comss.one*, *Cloudflare*, *Google*, *Quad9*, *Yandex* или свой IPv4/DoH) и возврат к стандартному DHCP.
- **Менеджер модов**: подключение и отключение пакетов стратегий, импорт сторонних `.zip`-модов.
- **Диагностика системы**: проверка прав Администратора, службы базовой фильтрации (`BFE`), драйвера `WinDivert64.sys`, `TCP Timestamps`, конфликтующих служб (`GoodbyeDPI`, `Killer Network`, `SmartByte`) и соединения с GitHub с кнопками исправления в один клик + очистка кэша Discord.
- **Профили конфигурации**: сохранение и мгновенное переключение пресетов настроек с главного экрана или из меню системного трея.

---

## Сборка и запуск из исходного кода

### Требования
- **ОС**: Windows 10 / 11 (x64)
- **Node.js**: 20+ и **pnpm** 9+
- Запуск от имени **Администратора** (требуется для драйвера `WinDivert64.sys`, управления системным `hosts` и настройки адаптеров DNS).

### Команды

```bash
# Установка зависимостей
pnpm install

# Запуск в режиме разработки
pnpm dev

# Проверка типов TypeScript
pnpm typecheck

# Сборка установщика Windows (dist/GhosterNet_x64.exe и dist/GhosterNet_x64-portable.7z)
pnpm run build:win
```

---

## Лицензия

Проект распространяется под лицензией **GNU General Public License v3.0 (GPL-3.0)**. Подробности в файле [LICENSE](./LICENSE) и [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).
