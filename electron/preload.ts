import { contextBridge, ipcRenderer } from 'electron'
import type { Api, ScanProgress } from '../src/types/file'

// Only these channels exist for the renderer; it never gets raw ipcRenderer or Node.
const channels: Exclude<keyof Api, 'onScanProgress'>[] = [
  'getRoot', 'chooseRoot', 'scan', 'cancelScan', 'stats', 'search', 'duplicates',
  'preview', 'retarget', 'organize', 'history', 'undo', 'categories', 'addCategory', 'removeCategory',
]

const api = {
  ...Object.fromEntries(channels.map((c) => [c, (...args: unknown[]) => ipcRenderer.invoke(c, ...args)])),
  onScanProgress(cb: (p: ScanProgress) => void) {
    const handler = (_: unknown, p: ScanProgress) => cb(p)
    ipcRenderer.on('scanProgress', handler)
    return () => ipcRenderer.removeListener('scanProgress', handler)
  },
}

contextBridge.exposeInMainWorld('api', api)
