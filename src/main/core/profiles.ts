import { getAppConfig, patchAppConfig } from '../config'
import { getZapretStatus, restartZapret } from './zapret'
import { applyDnsConfig, resetDnsToDhcp } from './dns-manager'
import { appLog } from '../utils/app-logger'

export async function listProfiles(): Promise<{
  activeProfileId: string
  profiles: ConfigProfile[]
}> {
  const cfg = await getAppConfig()
  const profiles = cfg.profiles && cfg.profiles.length > 0
    ? cfg.profiles
    : [
        {
          id: 'default',
          name: 'Основной',
          activeStrategy: cfg.zapret?.activeStrategy,
          gameFilter: cfg.zapret?.gameFilter ?? false,
          gameFilterMode: cfg.zapret?.gameFilterMode ?? 'disabled',
          ipsetMode: cfg.zapret?.ipsetMode ?? 'loaded',
          blockQuic: cfg.zapret?.blockQuic ?? false,
          selectedServices: cfg.zapret?.selectedServices ?? [],
          enabledMods: cfg.zapret?.enabledMods ?? [],
          dnsPresetId: cfg.dns?.presetId ?? 'system'
        }
      ]
  return {
    activeProfileId: cfg.activeProfileId || profiles[0].id,
    profiles
  }
}

export async function saveCurrentToProfile(profileId?: string, customName?: string): Promise<{
  activeProfileId: string
  profiles: ConfigProfile[]
}> {
  const cfg = await getAppConfig()
  const { activeProfileId, profiles } = await listProfiles()
  const targetId = profileId || activeProfileId
  const z = cfg.zapret ?? ({} as ZapretConfig)

  const snapshot: ConfigProfile = {
    id: targetId,
    name: customName?.trim() || profiles.find((p) => p.id === targetId)?.name || 'Профиль',
    activeStrategy: z.activeStrategy,
    gameFilter: Boolean(z.gameFilter),
    gameFilterMode: z.gameFilterMode ?? 'disabled',
    ipsetMode: z.ipsetMode ?? 'loaded',
    blockQuic: Boolean(z.blockQuic),
    selectedServices: z.selectedServices ?? [],
    enabledMods: z.enabledMods ?? [],
    dnsPresetId: cfg.dns?.active ? cfg.dns.presetId : 'system'
  }

  const idx = profiles.findIndex((p) => p.id === targetId)
  const nextProfiles = [...profiles]
  if (idx >= 0) nextProfiles[idx] = snapshot
  else nextProfiles.push(snapshot)

  await patchAppConfig({
    activeProfileId: targetId,
    profiles: nextProfiles
  })
  appLog('info', `Профиль "${snapshot.name}" сохранён`)
  return { activeProfileId: targetId, profiles: nextProfiles }
}

export async function createProfile(name: string): Promise<{
  activeProfileId: string
  profiles: ConfigProfile[]
}> {
  const id = `profile-${Date.now()}`
  return saveCurrentToProfile(id, name.trim() || 'Новый профиль')
}

export async function deleteProfile(profileId: string): Promise<{
  activeProfileId: string
  profiles: ConfigProfile[]
}> {
  const { activeProfileId, profiles } = await listProfiles()
  if (profiles.length <= 1) {
    throw new Error('Нельзя удалить единственный профиль')
  }
  const nextProfiles = profiles.filter((p) => p.id !== profileId)
  const nextActive = activeProfileId === profileId ? nextProfiles[0].id : activeProfileId
  await patchAppConfig({
    activeProfileId: nextActive,
    profiles: nextProfiles
  })
  return { activeProfileId: nextActive, profiles: nextProfiles }
}

export async function switchProfile(profileId: string): Promise<{
  activeProfileId: string
  profiles: ConfigProfile[]
}> {
  const cfg = await getAppConfig()
  const { profiles } = await listProfiles()
  const target = profiles.find((p) => p.id === profileId)
  if (!target) throw new Error(`Профиль ${profileId} не найден`)

  await patchAppConfig({
    activeProfileId: target.id,
    zapret: {
      ...(cfg.zapret as ZapretConfig),
      activeStrategy: target.activeStrategy ?? cfg.zapret?.activeStrategy,
      gameFilter: target.gameFilter,
      gameFilterMode: target.gameFilterMode ?? (target.gameFilter ? 'tcpudp' : 'disabled'),
      ipsetMode: target.ipsetMode,
      blockQuic: Boolean(target.blockQuic),
      selectedServices: target.selectedServices,
      enabledMods: target.enabledMods
    }
  })

  if (target.dnsPresetId && target.dnsPresetId !== 'system') {
    await applyDnsConfig({ presetId: target.dnsPresetId }).catch(() => void 0)
  } else if (cfg.dns?.active) {
    await resetDnsToDhcp().catch(() => void 0)
  }

  if (getZapretStatus().state === 'running') {
    await restartZapret().catch(() => void 0)
  }

  appLog('info', `Переключён активный профиль: "${target.name}"`)
  return { activeProfileId: target.id, profiles }
}
