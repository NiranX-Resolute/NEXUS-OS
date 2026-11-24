import { contextBridge, ipcRenderer, webFrame } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Dev-only Reticle Electron IPC instrumentation
if (process.env.NODE_ENV !== 'production' || process.defaultApp) {
  try {
    // @ts-ignore
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@reticlehq/electron/preload')
  } catch {
    // Reticle not active or stripped in production
  }
}

const api = {
  whiteboardOps: (payload: any) => ipcRenderer.invoke('nexus:whiteboard-ops', payload),
  fetchStock: (ticker: string) => ipcRenderer.invoke('nexus:fetch-stock', ticker)
}

const nexusTelemetryAPI = {
  onEvent: (callback: (event: any) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('nexus-telemetry-event', handler)
    return () => {
      ipcRenderer.removeListener('nexus-telemetry-event', handler)
    }
  },
  triggerEStop: () => ipcRenderer.invoke('nexus-telemetry:trigger-estop'),
  resetEStop: () => ipcRenderer.invoke('nexus-telemetry:reset-estop'),
  switchWorkspace: (mode: string) => ipcRenderer.invoke('nexus-telemetry:switch-workspace', mode),
  inspectNode: (node: string) => ipcRenderer.invoke('nexus-telemetry:inspect-node', node),
  getAgents: () => ipcRenderer.invoke('nexus-telemetry:get-agents'),
  postAudioRms: (rms: number) => ipcRenderer.invoke('nexus-telemetry:post-audio-rms', rms),
  getStatus: () => ipcRenderer.invoke('nexus-telemetry:get-status')
}

const nexusAuthAPI = {
  getAuthToken: () => ipcRenderer.invoke('get-auth-token'),
  getVaultSecret: (keyName: string) => ipcRenderer.invoke('get-vault-secret', keyName),
  setVaultSecret: (key: string, value: string) => ipcRenderer.invoke('set-vault-secret', { key, value }),
  onDeepLink: (channel: string, callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on(channel, handler)
    return () => {
      ipcRenderer.removeListener(channel, handler)
    }
  }
}

const webFrameAPI = {
  setZoomFactor: (factor: number) => webFrame.setZoomFactor(factor),
  getZoomFactor: () => webFrame.getZoomFactor(),
  setZoomLevel: (level: number) => webFrame.setZoomLevel(level),
  getZoomLevel: () => webFrame.getZoomLevel()
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', {
      ...electronAPI,
      webFrame: webFrameAPI,
      ipcRenderer: {
        ...electronAPI.ipcRenderer,
        invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args)
      }
    })
    contextBridge.exposeInMainWorld('nexusTelemetry', nexusTelemetryAPI)
    contextBridge.exposeInMainWorld('nexusAuth', nexusAuthAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error('[Preload] ContextBridge error:', error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = {
    ...electronAPI,
    webFrame: webFrameAPI,
    ipcRenderer: {
      ...electronAPI.ipcRenderer,
      invoke: ipcRenderer.invoke.bind(ipcRenderer)
    }
  }
  // @ts-ignore (define in dts)
  window.nexusTelemetry = nexusTelemetryAPI
  // @ts-ignore (define in dts)
  window.nexusAuth = nexusAuthAPI
  // @ts-ignore (define in dts)
  window.api = api
}
