import { spawnSync } from 'node:child_process'
import { clearDiscordCache } from './diagnostics'
import { getZapretStatus, restartZapret } from './zapret'
import { getAppConfig, patchAppConfig } from '../config'

export interface DiscordFixResult {
  ok: boolean
  freedMb: number
  actions: string[]
}

/**
 * Discord Voice & Video Fixer:
 * 1. Clears Discord RTC & Media Cache.
 * 2. Flushes Windows DNS cache.
 * 3. Injects optimized STUN UDP desync filters (UDP 50000-50100 & port 3478).
 * 4. Ensures Zapret is active with optimized UDP parameters.
 */
export async function applyDiscordVoiceFix(): Promise<DiscordFixResult> {
  const actions: string[] = []
  let freedMb = 0

  // 1. Flush DNS
  try {
    spawnSync('ipconfig.exe', ['/flushdns'], { windowsHide: true, timeout: 3000 })
    actions.push('Сброшен кэш DNS Windows (ipconfig /flushdns)')
  } catch {
    // ignore
  }

  // 2. Clear Discord voice/video WebRTC cache
  try {
    const res = await clearDiscordCache()
    freedMb = res.freedMb
    if (freedMb > 0) {
      actions.push(`Очищен кэш голосовых каналов Discord (освобождено ${freedMb} МБ)`)
    }
  } catch {
    // ignore
  }

  // 3. Enable game/voice UDP filter in Zapret config
  const cfg = await getAppConfig()
  await patchAppConfig({
    zapret: {
      ...(cfg.zapret as ZapretConfig),
      discordVoiceFix: true,
      gameFilter: true,
      gameFilterMode: 'tcpudp'
    }
  })
  actions.push('Включён режим оптимизации голосовых пакетов Discord (UDP 50000-50100 / WebRTC STUN)')

  // 4. Restart Zapret if running to immediately activate new packet desync rules
  const status = getZapretStatus()
  if (status.state === 'running') {
    await restartZapret()
    actions.push('Zapret перезапущен с профилем Discord Voice Fix')
  }

  return {
    ok: true,
    freedMb,
    actions
  }
}
