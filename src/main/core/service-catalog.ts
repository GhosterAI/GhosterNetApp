export interface ServiceRule {
  listGeneral?: string[]
  listExclude?: string[]
  listGoogle?: string[]
  ipsetAll?: string[]
  ipsetExclude?: string[]
  hosts?: string[]
  extraLists?: Array<{ filename: string; lines: string[] }>
  winwsArgs?: string[]
  testTargets?: Array<{ label: string; target: string }>
}

export const ALWAYS_APPLY_SERVICE_IDS = ['cloudflare', 'clouds'] as const

export const SERVICE_PRESETS: Omit<ServicePresetInfo, 'enabled'>[] = [
  // Gaming
  {
    id: 'epic-games',
    title: 'Epic Games',
    description: 'Магазин, лаунчер, загрузки и сервисы Epic Games / Unreal Engine',
    category: 'gaming',
    accent: '#eef2f8'
  },
  {
    id: 'battle-net',
    title: 'Battle.net',
    description: 'Лаунчер, игры Blizzard и загрузка контента',
    category: 'gaming',
    accent: '#148eff'
  },
  {
    id: 'riot-games',
    title: 'Riot Games',
    description: 'Клиент Riot, авторизация, Valorant и игровые сервисы',
    category: 'gaming',
    accent: '#d32936'
  },
  {
    id: 'league-of-legends',
    title: 'League of Legends',
    description: 'Клиент League, игровые серверы Riot и порт TCP 2099 (syndata)',
    category: 'gaming',
    accent: '#c89b3c'
  },
  {
    id: 'roblox',
    title: 'Roblox',
    description: 'Игровая платформа, вход в игры и CDN Roblox',
    category: 'gaming',
    accent: '#d8dde8'
  },
  {
    id: 'minecraft',
    title: 'Minecraft / Modrinth / CurseForge',
    description: 'Mojang, Modrinth, CurseForge, PrismLauncher, Fabric и Xbox Auth',
    category: 'gaming',
    accent: '#4ade80'
  },
  {
    id: 'steam',
    title: 'Steam',
    description: 'Магазин Steam, Сообщество, Мастерская и медиа-серверы Valve',
    category: 'gaming',
    accent: '#66c0f4'
  },
  {
    id: 'dnd',
    title: 'D&D & VTT',
    description: 'D&D Beyond, Roll20, Foundry VTT, Owlbear Rodeo и инструменты',
    category: 'gaming',
    accent: '#9b2335'
  },

  // Socials & Media
  {
    id: 'discord',
    title: 'Discord',
    description: 'Голосовой чат (UDP), сообщения, шлюз и медиа-файлы Discord',
    category: 'socials',
    accent: '#5865f2'
  },
  {
    id: 'youtube',
    title: 'YouTube',
    description: 'Видео 4K, превью, Shorts и видео-серверы Google (googlevideo)',
    category: 'socials',
    accent: '#ff0033'
  },
  {
    id: 'telegram',
    title: 'Telegram Desktop & Web',
    description: 'Десктопный клиент Telegram, Web-версия и медиа-CDN telesco.pe',
    category: 'socials',
    accent: '#26a5e4'
  },
  {
    id: 'twitch',
    title: 'Twitch',
    description: 'Стримы, чат, API и видео-CDN Twitch (ttvnw.net)',
    category: 'socials',
    accent: '#9146ff'
  },
  {
    id: 'tiktok',
    title: 'TikTok',
    description: 'Лента, видео, авторизация и международный CDN TikTok',
    category: 'socials',
    accent: '#25f4ee'
  },
  {
    id: 'instagram',
    title: 'Instagram & Threads',
    description: 'Лента, фото, Reels, Stories и CDN Instagram / Threads',
    category: 'socials',
    accent: '#e4405f'
  },
  {
    id: 'spotify',
    title: 'Spotify',
    description: 'Веб-плеер, десктопный клиент, авторизация и аудио-CDN',
    category: 'socials',
    accent: '#1ed760'
  },
  {
    id: 'reddit',
    title: 'Reddit',
    description: 'Форумы, изображения, видео, API и статика Reddit',
    category: 'socials',
    accent: '#ff4500'
  },
  {
    id: 'x-twitter',
    title: 'X / Twitter',
    description: 'Лента, медиа twimg.com, API и короткие ссылки t.co',
    category: 'socials',
    accent: '#f2f6ff'
  },
  {
    id: 'netflix',
    title: 'Netflix',
    description: 'Стриминг, постеры, Fast.com и видео-CDN Netflix',
    category: 'socials',
    accent: '#e50914'
  },
  {
    id: 'facebook',
    title: 'Facebook',
    description: 'Лента, вход, медиа и CDN Facebook (fbcdn.net)',
    category: 'socials',
    accent: '#1877f2'
  },
  {
    id: 'wplace',
    title: 'WPlace',
    description: 'Виртуальные рабочие пространства WPlace.live',
    category: 'socials',
    accent: '#4f73d9'
  },
  {
    id: 'facetime',
    title: 'Apple FaceTime & iCloud',
    description: 'Видеозвонки Apple FaceTime, iCloud и Push-серверы Apple',
    category: 'socials',
    accent: '#30d158'
  },

  // Workplace & AI
  {
    id: 'github',
    title: 'GitHub',
    description: 'Сайт, raw-файлы, релизы, ассеты и GitHub Pages',
    category: 'workplace',
    accent: '#f0f6fc'
  },
  {
    id: 'figma',
    title: 'Figma',
    description: 'Файлы, макеты, плагины и AWS-CDN Figma',
    category: 'workplace',
    accent: '#a259ff'
  },
  {
    id: 'ai',
    title: 'AI (ChatGPT, Claude, Gemini)',
    description: 'OpenAI ChatGPT, Anthropic Claude, Google Gemini, Copilot и Perplexity',
    category: 'workplace',
    accent: '#7c3aed'
  },
  {
    id: 'cloudflare',
    title: 'Cloudflare & ECH',
    description: 'Проксируемые сайты Cloudflare, WARP и 1.1.1.1',
    category: 'workplace',
    accent: '#f38020'
  },
  {
    id: 'clouds',
    title: 'Cloud CDNs (AWS, Fastly, Bunny, OVH)',
    description: 'Облачные хостинги Amazon AWS, CloudFront, Fastly, Akamai, Bunny и OVH',
    category: 'workplace',
    accent: '#38bdf8'
  }
]

export const SERVICE_RULES: Record<string, ServiceRule> = {
  cloudflare: {
    listGeneral: [
      'cloudflare.com',
      'cloudflare-dns.com',
      'cloudflare-ech.com',
      'cloudflare-gateway.com',
      'cloudflareinsights.com',
      'cloudflarestream.com',
      'cloudflarewarp.com',
      'one.one.one.one',
      'workers.dev',
      'pages.dev'
    ],
    ipsetAll: [
      '1.1.1.0/24',
      '1.0.0.0/24',
      '104.16.0.0/13',
      '104.24.0.0/14',
      '108.162.192.0/18',
      '131.0.72.0/22',
      '141.101.64.0/18',
      '162.158.0.0/15',
      '172.64.0.0/13',
      '173.245.48.0/20',
      '188.114.96.0/20',
      '190.93.240.0/20',
      '197.234.240.0/22',
      '198.41.128.0/17'
    ],
    testTargets: [
      { label: 'Cloudflare', target: 'https://www.cloudflare.com' },
      { label: 'Cloudflare DNS', target: 'PING:1.1.1.1' }
    ]
  },

  clouds: {
    listGeneral: [
      'amazonaws.com',
      'awsstatic.com',
      'cloudfront.net',
      'b-cdn.net',
      'bunny.net',
      'bunnycdn.com',
      'ovh.net',
      'ovhcloud.com',
      'akamaized.net',
      'edgekey.net',
      'edgesuite.net',
      'fastly.net',
      'fastlylb.net',
      'fastly-edge.com',
      'cdn77.com',
      'cdn77.org',
      'digitaloceanspaces.com',
      'hetzner.com'
    ],
    ipsetExclude: [
      '0.0.0.0/8',
      '10.0.0.0/8',
      '127.0.0.0/8',
      '192.168.0.0/16',
      '185.71.66.225',
      '185.71.67.221'
    ],
    testTargets: [
      { label: 'Amazon AWS', target: 'https://aws.amazon.com' },
      { label: 'Bunny CDN', target: 'https://bunny.net' },
      { label: 'OVHcloud', target: 'https://www.ovhcloud.com' }
    ]
  },

  discord: {
    listGeneral: [
      'discord.com',
      'discord.gg',
      'discord.media',
      'discordapp.com',
      'discordapp.net',
      'discordcdn.com',
      'discordstatus.com',
      'gateway.discord.gg',
      'dis.gd',
      'discord-attachments-uploads-prd.storage.googleapis.com'
    ],
    hosts: [
      '162.159.138.232 discord.com',
      '162.159.137.232 discord.com',
      '162.159.128.233 discord.com',
      '162.159.135.232 discord.com',
      '162.159.138.232 updates.discord.com',
      '162.159.137.232 updates.discord.com',
      '162.159.128.233 updates.discord.com',
      '162.159.135.232 updates.discord.com'
    ],
    testTargets: [
      { label: 'Discord', target: 'https://discord.com' },
      { label: 'Discord Gateway', target: 'https://gateway.discord.gg' },
      { label: 'Discord Updates', target: 'https://updates.discord.com' }
    ]
  },

  youtube: {
    listGeneral: [
      'googlevideo.com',
      'gvt1.com',
      'video.google.com',
      'withyoutube.com',
      'youtu.be',
      'youtube.com',
      'youtube-nocookie.com',
      'youtubei.googleapis.com',
      'ytimg.com',
      'yt3.ggpht.com',
      'ggpht.com'
    ],
    listGoogle: ['googlevideo.com', 'gvt1.com', 'youtube.com', 'youtu.be', 'ytimg.com', 'ggpht.com'],
    testTargets: [
      { label: 'YouTube', target: 'https://www.youtube.com' },
      { label: 'YouTube 204', target: 'https://www.youtube.com/generate_204' },
      { label: 'YouTube Short', target: 'https://youtu.be' },
      { label: 'YouTube Image', target: 'https://i.ytimg.com' }
    ]
  },

  telegram: {
    listGeneral: [
      'telegram.org',
      't.me',
      'tdesktop.com',
      'telesco.pe',
      'telegram.me',
      'telegram.dog',
      'telegram.space',
      'tg.dev',
      'web.telegram.org'
    ],
    hosts: [
      '149.154.167.220 my.telegram.org',
      '149.154.167.220 desktop.telegram.org',
      '149.154.167.220 macos.telegram.org',
      '149.154.167.220 oauth.telegram.org',
      '149.154.167.220 oauth.tg.dev',
      '149.154.167.220 cdn.telesco.pe',
      '149.154.167.220 cdn1.telesco.pe',
      '149.154.167.220 cdn2.telesco.pe',
      '149.154.167.220 cdn3.telesco.pe',
      '149.154.167.220 cdn4.telesco.pe',
      '149.154.167.220 cdn5.telesco.pe',
      '149.154.167.220 cdn6.telesco.pe',
      '149.154.167.220 core.telegram.org',
      '149.154.167.220 zws4.web.telegram.org',
      '149.154.167.220 vesta.web.telegram.org',
      '149.154.167.220 vesta-1.web.telegram.org',
      '149.154.167.220 venus-1.web.telegram.org',
      '149.154.167.220 telegram.me',
      '149.154.167.220 telegram.dog',
      '149.154.167.220 telegram.space',
      '149.154.167.220 telesco.pe',
      '149.154.167.220 tg.dev',
      '149.154.167.220 telegram.org',
      '149.154.167.220 t.me',
      '149.154.167.220 api.telegram.org',
      '149.154.167.220 td.telegram.org',
      '149.154.167.220 venus.web.telegram.org',
      '149.154.167.220 web.telegram.org',
      '149.154.167.220 kws2-1.web.telegram.org',
      '149.154.167.220 kws2.web.telegram.org',
      '149.154.167.220 kws4-1.web.telegram.org',
      '149.154.167.220 kws4.web.telegram.org',
      '149.154.167.220 zws2-1.web.telegram.org',
      '149.154.167.220 zws2.web.telegram.org',
      '149.154.167.220 zws4-1.web.telegram.org'
    ],
    testTargets: [{ label: 'Telegram', target: 'https://telegram.org' }]
  },

  'telegram-desktop': {
    listGeneral: ['telegram.org', 't.me', 'tdesktop.com', 'telesco.pe', 'web.telegram.org'],
    testTargets: [{ label: 'Telegram', target: 'https://telegram.org' }]
  },

  roblox: {
    listGeneral: [
      'roblox.com',
      'rbxcdn.com',
      'robloxcdn.com',
      'rblx.com',
      'robloxapp.com',
      'gamejoin.roblox.com',
      'setup.rbxcdn.com',
      'setup.roblox.com',
      'contentdelivery.roblox.com'
    ],
    ipsetAll: [
      '103.140.28.0/23',
      '128.116.0.0/17',
      '141.193.3.0/24',
      '205.201.62.0/24'
    ],
    hosts: [
      '23.47.124.101 tr.rbxcdn.com',
      '23.47.124.78 tr.rbxcdn.com'
    ],
    testTargets: [
      { label: 'Roblox', target: 'https://www.roblox.com' },
      { label: 'Roblox CDN', target: 'https://setup.rbxcdn.com' }
    ]
  },

  minecraft: {
    listGeneral: [
      'modrinth.com',
      'api.modrinth.com',
      'cdn.modrinth.com',
      'www.modrinth.com',
      'curseforge.com',
      'mediafilez.forgecdn.net',
      'edge.forgecdn.net',
      'forgecdn.net',
      'maven.minecraftforge.net',
      'files.minecraftforge.net',
      'maven.neoforged.net',
      'neoforged.net',
      'prismlauncher.org',
      'mojang.com',
      'minecraft.net',
      'session.minecraft.net',
      'textures.minecraft.net',
      'authserver.mojang.com',
      'sessionserver.mojang.com',
      'api.mojang.com',
      'services.minecraft.net',
      'piston-meta.mojang.com',
      'piston-data.mojang.com',
      'libraries.minecraft.net',
      'launchermeta.mojang.com',
      'resources.download.minecraft.net',
      'fabricmc.net',
      'maven.fabricmc.net',
      'meta.fabricmc.net',
      'quiltmc.org',
      'maven.quiltmc.org',
      'meta.quiltmc.org',
      'spigotmc.org',
      'papermc.io',
      'api.papermc.io',
      'essential.gg'
    ],
    ipsetAll: [
      '172.65.173.152/32',
      '172.65.254.112/32',
      '172.65.198.32/32',
      '172.65.217.91/32'
    ],
    testTargets: [
      { label: 'Modrinth', target: 'https://modrinth.com' },
      { label: 'Minecraft', target: 'https://www.minecraft.net' }
    ]
  },

  steam: {
    listGeneral: [
      'steampowered.com',
      'steamcommunity.com',
      'steamstatic.com',
      'steamusercontent.com',
      'steamcontent.com',
      'steamgames.com',
      'steam-chat.com',
      's.team'
    ],
    testTargets: [
      { label: 'Steam Store', target: 'https://store.steampowered.com' },
      { label: 'Steam Community', target: 'https://steamcommunity.com' }
    ]
  },

  twitch: {
    listGeneral: [
      'twitch.tv',
      'ttvnw.net',
      'jtvnw.net',
      'twitchcdn.net',
      'twitchsvc.net',
      'gql.twitch.tv',
      'usher.ttvnw.net'
    ],
    testTargets: [{ label: 'Twitch', target: 'https://www.twitch.tv' }]
  },

  tiktok: {
    listGeneral: [
      'tiktok.com',
      'tiktokcdn.com',
      'tiktokv.com',
      'byteoversea.com',
      'ibytedtos.com',
      'muscdn.com',
      'bytecdn.cn'
    ],
    testTargets: [{ label: 'TikTok', target: 'https://www.tiktok.com' }]
  },

  instagram: {
    listGeneral: [
      'instagram.com',
      'cdninstagram.com',
      'static.cdninstagram.com',
      'ig.me',
      'threads.net'
    ],
    testTargets: [{ label: 'Instagram', target: 'https://www.instagram.com' }]
  },

  'epic-games': {
    listGeneral: [
      'epicgames.com',
      'epicgames.dev',
      'epicgamescdn.com',
      'unrealengine.com',
      'akamaized.net',
      'cloudfront.net'
    ],
    listExclude: ['easy.ac', 'easyanticheat.net', 'easyanticheat.com'],
    testTargets: [{ label: 'Epic Games', target: 'https://www.epicgames.com' }]
  },

  'battle-net': {
    listGeneral: [
      'battle.net',
      'blizzard.com',
      'blizzard.net',
      'blz-contentstack.com',
      'blzddist1-a.akamaihd.net'
    ],
    testTargets: [{ label: 'Battle.net', target: 'https://www.battle.net' }]
  },

  spotify: {
    listGeneral: [
      'spotify.com',
      'scdn.co',
      'spotifycdn.com',
      'open.spotify.com',
      'api.spotify.com',
      'accounts.spotify.com',
      'gew1-spclient.spotify.com',
      'login5.spotify.com',
      'spclient.wg.spotify.com',
      'api-partner.spotify.com',
      'appresolve.spotify.com'
    ],
    testTargets: [{ label: 'Spotify', target: 'https://open.spotify.com' }]
  },

  reddit: {
    listGeneral: [
      'reddit.com',
      'redd.it',
      'redditmedia.com',
      'redditstatic.com',
      'redditinc.com'
    ],
    testTargets: [{ label: 'Reddit', target: 'https://www.reddit.com' }]
  },

  'x-twitter': {
    listGeneral: [
      'x.com',
      'api.x.com',
      'twitter.com',
      'api.tweetdeck.com',
      'twimg.com',
      'pbs.twimg.com',
      'video.twimg.com',
      't.co'
    ],
    testTargets: [{ label: 'X / Twitter', target: 'https://x.com' }]
  },

  github: {
    listGeneral: [
      'github.com',
      'githubusercontent.com',
      'raw.githubusercontent.com',
      'githubassets.com',
      'github.io',
      'objects.githubusercontent.com',
      'codeload.github.com'
    ],
    hosts: [
      '140.82.121.3 github.com',
      '146.75.22.132 objects.githubusercontent.com',
      '146.75.22.132 raw.githubusercontent.com',
      '146.75.22.132 release-assets.githubusercontent.com',
      '146.75.22.132 private-user-images.githubusercontent.com',
      '146.75.22.132 gist.githubusercontent.com',
      '146.75.22.132 avatars.githubusercontent.com',
      '146.75.22.132 media.githubusercontent.com',
      '146.75.22.132 camo.githubusercontent.com',
      '146.75.22.132 cloud.githubusercontent.com'
    ],
    testTargets: [
      { label: 'GitHub', target: 'https://github.com' },
      { label: 'GitHub Raw', target: 'https://raw.githubusercontent.com' }
    ]
  },

  'riot-games': {
    listGeneral: [
      'riotgames.com',
      'riotcdn.net',
      'pvp.net',
      'auth.riotgames.com',
      'clientconfig.rpg.riotgames.com'
    ],
    testTargets: [{ label: 'Riot Games', target: 'https://www.riotgames.com' }]
  },

  'league-of-legends': {
    listGeneral: [
      'leagueoflegends.com',
      'lolstatic.com',
      'lolesports.com',
      'riotcdn.net',
      'pvp.net'
    ],
    ipsetAll: [
      '3.64.0.0/12',
      '18.156.0.0/14',
      '18.165.180.0/22',
      '35.156.0.0/14',
      '44.224.0.0/11',
      '99.83.128.0/20'
    ],
    extraLists: [
      {
        filename: 'ipset-lol.txt',
        lines: [
          '3.64.0.0/12',
          '18.156.0.0/14',
          '18.165.180.0/22',
          '35.156.0.0/14',
          '44.224.0.0/11',
          '99.83.128.0/20'
        ]
      }
    ],
    winwsArgs: [
      '--new',
      '--filter-tcp=2099',
      '--ipset={lists}/ipset-lol.txt',
      '--dpi-desync=syndata'
    ],
    testTargets: [{ label: 'League of Legends', target: 'https://www.leagueoflegends.com' }]
  },

  figma: {
    listGeneral: [
      'figma.com',
      'www.figma.com',
      'figma.net',
      'figma-alpha-api.s3.us-west-2.amazonaws.com'
    ],
    ipsetAll: [
      '18.66.0.0/16',
      '52.222.0.0/15',
      '54.230.0.0/16',
      '108.138.0.0/15',
      '143.204.0.0/16',
      '199.232.0.0/16',
      '205.251.192.0/18'
    ],
    testTargets: [{ label: 'Figma', target: 'https://www.figma.com' }]
  },

  ai: {
    listGeneral: [
      'openai.com',
      'chatgpt.com',
      'oaistatic.com',
      'oaiusercontent.com',
      'anthropic.com',
      'claude.ai',
      'gemini.google.com',
      'aistudio.google.com',
      'generativelanguage.googleapis.com',
      'perplexity.ai',
      'copilot.microsoft.com',
      'deepseek.com',
      'huggingface.co',
      'civitai.com',
      'elevenlabs.io',
      'midjourney.com',
      'suno.com',
      'cursor.sh',
      'cursor.com'
    ],
    hosts: [
      '132.243.112.221 gemini.google.com',
      '132.243.112.221 aistudio.google.com'
    ],
    testTargets: [
      { label: 'Google Gemini', target: 'https://gemini.google.com' },
      { label: 'ChatGPT', target: 'https://chatgpt.com' },
      { label: 'Claude', target: 'https://claude.ai' }
    ]
  },

  netflix: {
    listGeneral: [
      'netflix.com',
      'nflxvideo.net',
      'nflximg.net',
      'nflxso.net',
      'nflxext.com',
      'fast.com'
    ],
    testTargets: [{ label: 'Netflix', target: 'https://www.netflix.com' }]
  },

  facebook: {
    listGeneral: [
      'facebook.com',
      'fbcdn.net',
      'fbsbx.com',
      'accountkit.com',
      'facebookauth.com',
      'facebook.net',
      'fb.com',
      'fb.me'
    ],
    testTargets: [{ label: 'Facebook', target: 'https://www.facebook.com' }]
  },

  wplace: {
    listGeneral: ['wplace.live'],
    testTargets: [{ label: 'WPlace', target: 'https://wplace.live' }]
  },

  facetime: {
    listGeneral: [
      'apple.com',
      'icloud.com',
      'appleid.apple.com',
      'gs.apple.com',
      'gateway.push.apple.com',
      '*.push.apple.com',
      'init-p01md.push.apple.com',
      'init-p01st.push.apple.com',
      'apple-cloudkit.com',
      'cdn-apple.com',
      'apple-dns.net',
      'apple.news',
      'digicert.com'
    ],
    ipsetAll: [
      '17.0.0.0/8',
      '63.92.224.0/19',
      '65.199.176.0/20',
      '139.178.0.0/16',
      '144.178.0.0/16',
      '192.35.50.0/24',
      '192.35.52.0/24',
      '192.35.54.0/24',
      '192.35.56.0/24',
      '192.35.58.0/24'
    ],
    testTargets: [{ label: 'FaceTime', target: 'https://facetime.apple.com' }]
  },

  dnd: {
    listGeneral: [
      'dndbeyond.com',
      'www.dndbeyond.com',
      'auth.dndbeyond.com',
      'media.dndbeyond.com',
      'images.dndbeyond.com',
      'api.dndbeyond.com',
      'dnd.wizards.com',
      'dndstore.wizards.com',
      'accounts.wizards.com',
      'roll20.net',
      'www.roll20.net',
      'app.roll20.net',
      'marketplace.roll20.net',
      'owlbear.rodeo',
      'www.owlbear.rodeo',
      'app.owlbear.rodeo',
      'foundryvtt.com',
      'www.foundryvtt.com',
      'forge-vtt.com',
      'eu.forge-vtt.com',
      'us.forge-vtt.com',
      'inkarnate.com',
      'wonderdraft.net',
      'koboldplus.club'
    ],
    testTargets: [
      { label: 'D&D Beyond', target: 'https://www.dndbeyond.com' },
      { label: 'Roll20', target: 'https://roll20.net' },
      { label: 'Foundry VTT', target: 'https://foundryvtt.com' }
    ]
  }
}

export function getServicePresetsWithState(selectedIds: string[] = []): ServicePresetInfo[] {
  const selected = new Set(selectedIds)
  return SERVICE_PRESETS.map((preset) => ({
    ...preset,
    enabled: selected.has(preset.id)
  }))
}
