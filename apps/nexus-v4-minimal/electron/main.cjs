'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow, ipcMain, nativeTheme, shell } = require('electron');

const IPC_ORIGIN = 'http://127.0.0.1:47630';
const DEV_SERVER_PORT = 5184;

if (!app.isPackaged) {
  try {
    const { initReticle } = require('@reticlehq/electron/main');
    if (typeof initReticle === 'function') {
      initReticle();
    }
  } catch {
    // Reticle instrumentation is optional
  }
}

app.setName('Nexus V4 Minimal');
nativeTheme.themeSource = 'dark';

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
  process.exit(0);
}

/** @type {BrowserWindow | null} */
let mainWindow = null;

function readIpcToken() {
  const envToken = (process.env.NEXUS_IPC_TOKEN || '').trim();
  if (envToken) return envToken;
  try {
    const tokenPath = path.join(os.homedir(), '.nexus-agent', 'ipc_token.secret');
    if (fs.existsSync(tokenPath)) {
      return fs.readFileSync(tokenPath, 'utf8').trim();
    }
  } catch (err) {
    console.warn('[nexus-v4-minimal:main] Token read warning:', err);
  }
  return '';
}

async function callGatewayJson(routePath, options = {}) {
  const token = readIpcToken();
  const headers = {
    Accept: 'application/json',
    ...(options.headers || {}),
  };
  if (typeof options.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers['X-Nexus-Token'] = token;
  }

  try {
    const response = await fetch(`${IPC_ORIGIN}${routePath}`, {
      ...options,
      headers,
    });
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return {
        success: response.ok,
        error: response.ok ? undefined : text || `HTTP ${response.status}`,
      };
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Gateway unreachable',
    };
  }
}

function registerIpcHandlers() {
  ipcMain.handle('get-auth-token', async () => readIpcToken());

  ipcMain.handle('get-vault-secret', async (_event, keyName) => {
    const key = String(keyName || '').trim();
    if (!key) return { success: false, error: 'Secret key name is required' };
    return callGatewayJson('/api/vault/get', {
      method: 'POST',
      body: JSON.stringify({ key }),
    });
  });

  ipcMain.handle('set-vault-secret', async (_event, payload) => {
    const key = String(payload?.key || '').trim();
    const value = payload?.value !== undefined ? String(payload.value) : '';
    if (!key) return { success: false, error: 'Secret key name is required' };
    return callGatewayJson('/api/vault/set', {
      method: 'POST',
      body: JSON.stringify({ key, value }),
    });
  });

  ipcMain.handle('nexus-telemetry:trigger-estop', async (_event, reason) =>
    callGatewayJson('/api/estop', {
      method: 'POST',
      body: JSON.stringify({
        reset: false,
        reason: typeof reason === 'string' && reason.trim() ? reason.trim() : 'Manual Operator E-Stop',
      }),
    })
  );

  ipcMain.handle('nexus-telemetry:reset-estop', async () =>
    callGatewayJson('/api/estop', {
      method: 'POST',
      body: JSON.stringify({ reset: true }),
    })
  );

  ipcMain.handle('nexus-telemetry:switch-workspace', async (_event, mode) =>
    callGatewayJson('/api/workspace/mode', {
      method: 'POST',
      body: JSON.stringify({ mode: String(mode || 'DEV').toUpperCase() }),
    })
  );

  ipcMain.handle('nexus-telemetry:get-status', async () =>
    callGatewayJson('/api/health', { method: 'GET' })
  );

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

  ipcMain.handle('window-is-maximized', () =>
    Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isMaximized())
  );
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    title: 'Nexus V4 — Zen Linear Monograph',
    width: 1400,
    height: 880,
    minWidth: 960,
    minHeight: 600,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#090a0c',
    center: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      webviewTag: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximized', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximized', false);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  const distEntry = path.join(__dirname, '..', 'dist', 'index.html');
  const devUrl = process.env.VITE_DEV_SERVER_URL || `http://127.0.0.1:${DEV_SERVER_PORT}`;

  if (app.isPackaged) {
    void mainWindow.loadFile(distEntry);
    return;
  }

  let fellBackToDist = false;
  mainWindow.webContents.on('did-fail-load', () => {
    if (!fellBackToDist && fs.existsSync(distEntry) && mainWindow && !mainWindow.isDestroyed()) {
      fellBackToDist = true;
      void mainWindow.loadFile(distEntry);
    }
  });

  void mainWindow.loadURL(devUrl);
}

app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
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
