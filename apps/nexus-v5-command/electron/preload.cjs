'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const nexusAuthAPI = {
  getAuthToken: () => ipcRenderer.invoke('get-auth-token'),
};

const nexusWindowAPI = {
  minimize: () => ipcRenderer.send('window-min'),
  maximize: () => ipcRenderer.send('window-max'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
};

const electronBridge = {
  ipcRenderer: {
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    send: (channel, ...args) => ipcRenderer.send(channel, ...args),
    on: (channel, listener) => {
      const subscription = (_event, ...args) => listener(...args);
      ipcRenderer.on(channel, subscription);
      return () => ipcRenderer.removeListener(channel, subscription);
    },
    removeListener: (channel, listener) => ipcRenderer.removeListener(channel, listener),
  },
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('nexusAuth', nexusAuthAPI);
    contextBridge.exposeInMainWorld('nexusWindow', nexusWindowAPI);
    contextBridge.exposeInMainWorld('electron', electronBridge);
  } catch (err) {
    console.error('[Nexus V5 Preload] contextBridge failure:', err);
  }
} else {
  window.nexusAuth = nexusAuthAPI;
  window.nexusWindow = nexusWindowAPI;
  window.electron = electronBridge;
}
