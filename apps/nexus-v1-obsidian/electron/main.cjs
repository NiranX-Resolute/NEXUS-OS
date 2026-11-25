'use strict';

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5181';
const DIST_INDEX = path.join(__dirname, '..', 'dist', 'index.html');

let mainWindow = null;

function resolveTokenPath() {
  const userProfile = process.env.USERPROFILE || os.homedir();
  return path.join(userProfile, '.nexus-agent', 'ipc_token.secret');
}

function readIpcAuthToken() {
  try {
    const tokenPath = resolveTokenPath();
    if (fs.existsSync(tokenPath)) {
      const token = fs.readFileSync(tokenPath, 'utf8').trim();
      if (token) {
        return token;
      }
    }
  } catch (err) {
    console.warn('[nexus-v1-obsidian] Failed reading ipc_token.secret:', err?.message || err);
  }
  return (process.env.NEXUS_IPC_TOKEN || '').trim();
}

function probeUrl(urlString, timeoutMs = 600) {
  return new Promise((resolve) => {
    const req = http.get(urlString, (res) => {
      res.resume();
      resolve(res.statusCode !== undefined && res.statusCode < 500);
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

function registerIpcHandlers() {
  ipcMain.handle('get-auth-token', () => readIpcAuthToken());

  ipcMain.handle('window-minimize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }
    return true;
  });

  ipcMain.handle('window-maximize', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return false;
    }
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
    return mainWindow.isMaximized();
  });

  ipcMain.handle('window-close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
    return true;
  });

  ipcMain.handle('window-is-maximized', () => {
    return Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isMaximized());
  });

  ipcMain.on('window-min', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }
  });

  ipcMain.on('window-max', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
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
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    frame: false,
    backgroundColor: '#07090d',
    title: 'NEXUS V1 — Obsidian Sovereign',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || (parsed.protocol === 'http:' && parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost')) {
        void shell.openExternal(url);
      }
    } catch {
      // Ignore invalid external URLs
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (!app.isPackaged) {
    const devAlive = await probeUrl(DEV_SERVER_URL);
    if (devAlive) {
      await mainWindow.loadURL(DEV_SERVER_URL);
      return;
    }
  }

  if (fs.existsSync(DIST_INDEX)) {
    await mainWindow.loadFile(DIST_INDEX);
    return;
  }

  await mainWindow.loadURL(DEV_SERVER_URL);
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    registerIpcHandlers();
    void createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
