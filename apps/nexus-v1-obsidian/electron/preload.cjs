'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const ALLOWED_INVOKE_CHANNELS = new Set([
  'get-auth-token',
  'window-minimize',
  'window-maximize',
  'window-close',
  'window-is-maximized',
]);

const ALLOWED_SEND_CHANNELS = new Set([
  'window-min',
  'window-max',
  'window-close',
]);

const nexusAuth = {
  getAuthToken: () => ipcRenderer.invoke('get-auth-token'),
};

const nexusWindow = {
  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  close: () => ipcRenderer.invoke('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
};

const electronBridge = {
  ipcRenderer: {
    invoke: (channel, ...args) => {
      if (!ALLOWED_INVOKE_CHANNELS.has(channel)) {
        return Promise.reject(new Error(`Disallowed IPC invoke channel: ${channel}`));
      }
      return ipcRenderer.invoke(channel, ...args);
    },
    send: (channel, ...args) => {
      if (ALLOWED_SEND_CHANNELS.has(channel)) {
        ipcRenderer.send(channel, ...args);
      }
    },
  },
};

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('nexusAuth', nexusAuth);
  contextBridge.exposeInMainWorld('nexusWindow', nexusWindow);
  contextBridge.exposeInMainWorld('electron', electronBridge);
} else {
  window.nexusAuth = nexusAuth;
  window.nexusWindow = nexusWindow;
  window.electron = electronBridge;
}
