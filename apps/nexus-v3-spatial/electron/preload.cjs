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

const electronBridgeAPI = {
  ipcRenderer: {
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    send: (channel, ...args) => ipcRenderer.send(channel, ...args),
    on: (channel, listener) => {
      const wrapped = (_event, ...args) => listener(...args);
      ipcRenderer.on(channel, wrapped);
      return () => ipcRenderer.removeListener(channel, wrapped);
    },
  },
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('nexusAuth', nexusAuthAPI);
    contextBridge.exposeInMainWorld('nexusWindow', nexusWindowAPI);
    contextBridge.exposeInMainWorld('electron', electronBridgeAPI);
  } catch (err) {
    console.error('[Nexus V3 Preload] contextBridge error:', err);
  }
} else {
  window.nexusAuth = nexusAuthAPI;
  window.nexusWindow = nexusWindowAPI;
  window.electron = electronBridgeAPI;
}
