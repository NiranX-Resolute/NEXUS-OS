const { app, BrowserWindow, ipcMain, nativeTheme, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5183';
const DIST_INDEX_PATH = path.join(__dirname, '..', 'dist', 'index.html');
const TOKEN_FILE_PATH = path.join(os.homedir(), '.nexus-agent', 'ipc_token.secret');

let mainWindow = null;

nativeTheme.themeSource = 'dark';
app.setName('Nexus V3 Spatial');

function readIpcToken() {
  try {
    if (fs.existsSync(TOKEN_FILE_PATH)) {
      const token = fs.readFileSync(TOKEN_FILE_PATH, 'utf8').trim();
      if (token) return token;
    }
  } catch (err) {
    console.warn('[Nexus V3 Main] Failed reading IPC token file:', err.message);
  }
  return (process.env.NEXUS_IPC_TOKEN || '').trim();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 700,
    frame: false,
    show: false,
    backgroundColor: '#0b1016',
    title: 'Nexus V3 — Spatial Floating Dock',
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
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        const isLocal = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
        if (!isLocal) {
          void shell.openExternal(url);
          return { action: 'deny' };
        }
      }
    } catch {
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  let fallbackLoaded = false;
  mainWindow.webContents.on('did-fail-load', () => {
    if (!fallbackLoaded && fs.existsSync(DIST_INDEX_PATH) && mainWindow && !mainWindow.isDestroyed()) {
      fallbackLoaded = true;
      void mainWindow.loadFile(DIST_INDEX_PATH);
    }
  });

  if (!app.isPackaged) {
    void mainWindow.loadURL(DEV_SERVER_URL).catch(() => {
      if (fs.existsSync(DIST_INDEX_PATH) && mainWindow && !mainWindow.isDestroyed()) {
        fallbackLoaded = true;
        void mainWindow.loadFile(DIST_INDEX_PATH);
      }
    });
  } else if (fs.existsSync(DIST_INDEX_PATH)) {
    void mainWindow.loadFile(DIST_INDEX_PATH);
  } else {
    void mainWindow.loadURL(DEV_SERVER_URL);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerIpcHandlers() {
  ipcMain.handle('get-auth-token', () => readIpcToken());

  ipcMain.handle('window-is-maximized', () => {
    return Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isMaximized());
  });

  const minimizeWin = () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
  };
  const toggleMaximizeWin = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  };
  const closeWin = () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
  };

  ipcMain.on('window-min', minimizeWin);
  ipcMain.on('window-max', toggleMaximizeWin);
  ipcMain.on('window-close', closeWin);
  ipcMain.on('window:minimize', minimizeWin);
  ipcMain.on('window:maximize', toggleMaximizeWin);
  ipcMain.on('window:close', closeWin);
}

app.whenReady().then(() => {
  registerIpcHandlers();
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
