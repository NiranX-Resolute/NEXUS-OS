'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow, ipcMain, nativeTheme, shell } = require('electron');

const DEV_SERVER_URL = process.env.NEXUS_RENDERER_URL || process.env.VITE_DEV_SERVER_URL || 'http://localhost:5185';
const DIST_HTML = path.join(__dirname, '..', 'dist', 'index.html');

let mainWindow = null;

nativeTheme.themeSource = 'dark';

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
  process.exit(0);
}

function readIpcAuthToken() {
  const envToken = (process.env.NEXUS_IPC_TOKEN || '').trim();
  if (envToken) return envToken;

  try {
    const tokenPath = path.join(os.homedir(), '.nexus-agent', 'ipc_token.secret');
    if (fs.existsSync(tokenPath)) {
      return fs.readFileSync(tokenPath, 'utf8').trim();
    }
  } catch (err) {
    console.warn('[Nexus V5 Main] Failed reading ipc_token.secret:', err.message);
  }
  return '';
}

function registerIpcHandlers() {
  ipcMain.handle('get-auth-token', async () => readIpcAuthToken());

  ipcMain.handle('window-is-maximized', () => {
    return mainWindow && !mainWindow.isDestroyed() ? mainWindow.isMaximized() : false;
  });

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
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    title: 'Nexus V5 — Cyber Matrix Redux',
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#05080b',
    center: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  let fallbackLoaded = false;
  mainWindow.webContents.on('did-fail-load', () => {
    if (!fallbackLoaded && fs.existsSync(DIST_HTML) && mainWindow && !mainWindow.isDestroyed()) {
      fallbackLoaded = true;
      mainWindow.loadFile(DIST_HTML);
    }
  });

  const explicitUrl = process.env.NEXUS_RENDERER_URL || process.env.VITE_DEV_SERVER_URL;
  if (explicitUrl) {
    mainWindow.loadURL(explicitUrl);
  } else if (!app.isPackaged) {
    mainWindow.loadURL(DEV_SERVER_URL);
  } else if (fs.existsSync(DIST_HTML)) {
    mainWindow.loadFile(DIST_HTML);
  } else {
    mainWindow.loadURL(DEV_SERVER_URL);
  }
}

app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  registerIpcHandlers();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
