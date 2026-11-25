'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const VALID_INVOKE_CHANNELS = new Set([
  'get-auth-token',
  'window-is-maximized',
]);

const VALID_SEND_CHANNELS = new Set([
  'window-min',
  'window-max',
  'window-close',
]);

const VALID_ON_CHANNELS = new Set([
  'window-state-changed',
]);

contextBridge.exposeInMainWorld('nexusAuth', {
  getAuthToken: () => ipcRenderer.invoke('get-auth-token'),
});

contextBridge.exposeInMainWorld('nexusWindow', {
  minimize: () => ipcRenderer.send('window-min'),
  maximize: () => ipcRenderer.send('window-max'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onStateChange: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('window-state-changed', handler);
    return () => ipcRenderer.removeListener('window-state-changed', handler);
  },
});

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    invoke: (channel, ...args) => {
      if (!VALID_INVOKE_CHANNELS.has(channel)) {
        return Promise.reject(new Error(`Unauthorized IPC invoke channel: ${channel}`));
      }
      return ipcRenderer.invoke(channel, ...args);
    },
    send: (channel, ...args) => {
      if (VALID_SEND_CHANNELS.has(channel)) {
        ipcRenderer.send(channel, ...args);
      }
    },
    on: (channel, listener) => {
      if (!VALID_ON_CHANNELS.has(channel) || typeof listener !== 'function') {
        return () => {};
      }
      const wrapped = (_event, ...args) => listener(...args);
      ipcRenderer.on(channel, wrapped);
      return () => ipcRenderer.removeListener(channel, wrapped);
    },
  },
});
