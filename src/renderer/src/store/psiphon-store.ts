import { create } from 'zustand'
import { psiphonStatus } from '@renderer/utils/ipc'

interface PsiphonStore {
  status: PsiphonStatus
  setStatus: (s: PsiphonStatus) => void
}

export const usePsiphonStore = create<PsiphonStore>((set) => ({
  status: {
    state: 'stopped',
    httpPort: 20807,
    socksPort: 20808,
    systemProxy: false,
    availableRegions: []
  },
  setStatus: (status): void => set({ status })
}))

let listener: ((event: unknown, payload: PsiphonStatus) => void) | null = null

export const attachPsiphonStore = (): (() => void) => {
  window.electron.ipcRenderer.removeAllListeners('psiphon:status')
  listener = (_e, payload) => usePsiphonStore.getState().setStatus(payload)
  window.electron.ipcRenderer.on('psiphon:status', listener)
  psiphonStatus().then((s) => usePsiphonStore.getState().setStatus(s)).catch(() => void 0)
  return () => {
    if (listener) {
      window.electron.ipcRenderer.removeListener('psiphon:status', listener)
      listener = null
    }
  }
}
