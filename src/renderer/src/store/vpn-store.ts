import { create } from 'zustand'
import { vpnStatus } from '@renderer/utils/ipc'

interface VpnStore {
  status: VpnStatus
  setStatus: (s: VpnStatus) => void
  isTestingLatency: boolean
  setIsTestingLatency: (testing: boolean) => void
}

export const useVpnStore = create<VpnStore>((set) => ({
  status: {
    state: 'stopped',
    routingMode: 'bypass-ru',
    tunMode: true,
    localHttpPort: 2080,
    localSocksPort: 2081
  },
  setStatus: (status): void => set({ status }),
  isTestingLatency: false,
  setIsTestingLatency: (isTestingLatency): void => set({ isTestingLatency })
}))

let listener: ((event: unknown, payload: VpnStatus) => void) | null = null

export const attachVpnStore = (): (() => void) => {
  window.electron.ipcRenderer.removeAllListeners('vpn:status')
  listener = (_e, payload) => useVpnStore.getState().setStatus(payload)
  window.electron.ipcRenderer.on('vpn:status', listener)
  vpnStatus().then((s) => useVpnStore.getState().setStatus(s)).catch(() => void 0)
  return () => {
    if (listener) {
      window.electron.ipcRenderer.removeListener('vpn:status', listener)
      listener = null
    }
  }
}
