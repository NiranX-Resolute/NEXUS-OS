'use strict';

const { contextBridge, ipcRenderer } = require('electron');

if (process.env.NODE_ENV !== 'production' || process.defaultApp) {
  try {
    require('@reticlehq/electron/preload');
  } catch {
    // Reticle instrumentation is optional in standalone builds
  }
}

const ALLOWED_INVOKE_CHANNELS = new Set([
  'get-auth-token',
  'get-vault-secret',
  'set-vault-secret',
  'window-is-maximized',
  'nexus-telemetry:trigger-estop',
  'nexus-telemetry:reset-estop',
  'nexus-telemetry:switch-workspace',
  'nexus-telemetry:get-status',
]);

const ALLOWED_SEND_CHANNELS = new Set([
  'window-min',
  'window-max',
  'window-close',
]);

function isAllowedChannel(channel, exactSet) {
  if (typeof channel !== 'string') return false;
  if (exactSet.has(channel)) return true;
  return (
    channel.startsWith('nexus:') ||
    channel.startsWith('nexus-') ||
    channel.startsWith('window-')
  );
}

const nexusAuthAPI = {
  getAuthToken: () => ipcRenderer.invoke('get-auth-token'),
  getVaultSecret: (keyName) => ipcRenderer.invoke('get-vault-secret', keyName),
  setVaultSecret: (key, value) => ipcRenderer.invoke('set-vault-secret', { key, value }),
};

const nexusTelemetryAPI = {
  triggerEStop: (reason) => ipcRenderer.invoke('nexus-telemetry:trigger-estop', reason),
  resetEStop: () => ipcRenderer.invoke('nexus-telemetry:reset-estop'),
  switchWorkspace: (mode) => ipcRenderer.invoke('nexus-telemetry:switch-workspace', mode),
  getStatus: () => ipcRenderer.invoke('nexus-telemetry:get-status'),
  onEvent: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('nexus-telemetry-event', handler);
    return () => ipcRenderer.removeListener('nexus-telemetry-event', handler);
  },
};

const nexusWindowAPI = {
  minimize: () => ipcRenderer.send('window-min'),
  maximize: () => ipcRenderer.send('window-max'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onMaximizedChange: (callback) => {
    const handler = (_event, isMax) => callback(Boolean(isMax));
    ipcRenderer.on('window:maximized', handler);
    return () => ipcRenderer.removeListener('window:maximized', handler);
  },
};

const electronBridge = {
  ipcRenderer: {
    invoke: (channel, ...args) => {
      if (!isAllowedChannel(channel, ALLOWED_INVOKE_CHANNELS)) {
        return Promise.reject(new Error(`Blocked IPC invoke channel: ${String(channel)}`));
      }
      return ipcRenderer.invoke(channel, ...args);
    },
    send: (channel, ...args) => {
      if (!isAllowedChannel(channel, ALLOWED_SEND_CHANNELS)) {
        throw new Error(`Blocked IPC send channel: ${String(channel)}`);
      }
      ipcRenderer.send(channel, ...args);
    },
    on: (channel, listener) => {
      const subscription = (_event, ...args) => listener(...args);
      ipcRenderer.on(channel, subscription);
      return () => ipcRenderer.removeListener(channel, subscription);
    },
  },
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronBridge);
    contextBridge.exposeInMainWorld('nexusAuth', nexusAuthAPI);
    contextBridge.exposeInMainWorld('nexusTelemetry', nexusTelemetryAPI);
    contextBridge.exposeInMainWorld('nexusWindow', nexusWindowAPI);
  } catch (err) {
    console.error('[nexus-v4-minimal:preload] ContextBridge failure:', err);
  }
} else {
  window.electron = electronBridge;
  window.nexusAuth = nexusAuthAPI;
  window.nexusTelemetry = nexusTelemetryAPI;
  window.nexusWindow = nexusWindowAPI;
}
