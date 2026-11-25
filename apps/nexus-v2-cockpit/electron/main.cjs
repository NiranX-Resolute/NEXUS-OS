'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow, ipcMain, shell } = require('electron');

const DEV_SERVER_PORT = 5182;
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || `http://127.0.0.1:${DEV_SERVER_PORT}`;
const DIST_INDEX = path.join(__dirname, '..', 'dist', 'index.html');

let mainWindow = null;

function readIpcToken() {
  const homeDir = process.env.USERPROFILE || os.homedir();
  const secretPath = path.join(homeDir, '.nexus-agent', 'ipc_token.secret');
  try {
    if (fs.existsSync(secretPath)) {
      const token = fs.readFileSync(secretPath, 'utf8').trim();
      if (token) {
        return token;
      }
    }
  } catch (err) {
    console.warn('[nexus-v2-cockpit] Failed reading ipc_token.secret:', err && err.message ? err.message : err);
  }
  return (process.env.NEXUS_IPC_TOKEN || '').trim();
}

function resolveStartTarget() {
  if (process.env.VITE_DEV_SERVER_URL || process.argv.includes('--dev') || process.env.NODE_ENV === 'development') {
    return { type: 'url', target: DEV_SERVER_URL };
  }
  if (fs.existsSync(DIST_INDEX)) {
    return { type: 'file', target: DIST_INDEX };
  }
  return { type: 'url', target: DEV_SERVER_URL };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'Nexus V2 — Aether Telemetry Cockpit',
    backgroundColor: '#050a14',
    frame: false,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow = win;

  win.once('ready-to-show', () => {
    win.show();
  });

  win.on('maximize', () => {
    win.webContents.send('window-state-changed', { maximized: true });
  });

  win.on('unmaximize', () => {
    win.webContents.send('window-state-changed', { maximized: false });
  });

  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });

  const entry = resolveStartTarget();
  if (entry.type === 'file') {
    win.loadFile(entry.target).catch((err) => {
      console.error('[nexus-v2-cockpit] Failed loading dist bundle:', err);
    });
  } else {
    win.loadURL(entry.target).catch(() => {
      if (fs.existsSync(DIST_INDEX)) {
        win.loadFile(DIST_INDEX).catch(() => {});
      }
    });
  }
}

ipcMain.handle('get-auth-token', async () => readIpcToken());
ipcMain.handle('window-is-maximized', async () => Boolean(mainWindow && mainWindow.isMaximized()));

ipcMain.on('window-min', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize();
  }
});

ipcMain.on('window-max', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
