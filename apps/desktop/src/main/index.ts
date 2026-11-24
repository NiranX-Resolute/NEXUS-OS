import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  globalShortcut,
  screen,
  session,
  safeStorage,
  systemPreferences,
  Menu,
  Tray,
  nativeImage,
  NativeImage,
  nativeTheme,
  Notification,
  MenuItemConstructorOptions,
  protocol,
  net
} from 'electron'
import path, { join } from 'path'
import os from 'os'
import fs from 'fs'
import http from 'http'
import { get as httpsGet } from 'https'
import { execFile } from 'child_process'
import { pathToFileURL } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

import registerIpcHandlers from './logic/nexus-memory-save'
import registerSystemHandlers from './logic/get-system-info'
import registerFileSearch from './logic/file-search'
import registerFileOps from './logic/file-ops'
import registerFileWrite from './logic/file-write'
import registerFilePatcher from './logic/file-patch'
import registerSnapshotHandlers from './logic/snapshot-manager'
import registerVisualGrounding from './logic/visual-grounding'
import registerVisualSentry from './logic/visual-sentry'
import registerKnowledgeGraph from './services/knowledge-graph'
import registerFileRead from './logic/file-read'
import registerFileOpen from './logic/file-open'
import registerDirLoader from './logic/dir-load'
import registerFileScanner from './logic/file-launcher'
import registerAppLauncher from './logic/app-launcher'
import registerNotesHandlers from './logic/notes-manager'
import registerWhiteboardDocs from './logic/whiteboard-docs'
import registerWebAgent from './logic/web-agent'
import registerGhostControl from './logic/ghost-control'
import registerterminalControl from './logic/terminal-control'
import registerGalleryHandlers from './logic/gallery-manager'
import registerGmailHandlers from './logic/gmail-manager'
import registerLocationHandlers from './logic/live-location'
import registerAdbHandlers from './logic/adb-manager'
import registerMediaControl from './logic/media-control'
import registerPerformanceGovernor from './logic/performance-governor'
import registerRealityHacker from './logic/reality-hacker'
import registerNexusCoder from './services/nexus-coder'
import registerTelekinesis from './logic/telekinesis'
import registerWallpaperEngine from './logic/wallpaper-engine'
import registerWhatsAppManager from './logic/whatsapp-manager'
import registerDocForge from './logic/doc-forge'
import registerFocusProtocol from './logic/focus-protocol'
import registerPermanentMemory from './logic/permanent-memory'
import registerWormhole from './services/wormhole'
import registerOracle from './services/RAG-oracle'
import registerDeepResearch from './services/deep-research'
import registerIssueReporter from './services/issue-reporter'
import registerAiGateway from './services/ai-gateway'
import registerMcpHandlers from './services/mcp-manager'
import registerAgentFleet from './services/agent-fleet'
import registerMobileCommandBridge from './services/mobile-command-bridge'
import { registerEcosystemManager } from './services/nexus-ecosystem-manager'
import registerWidgetMaker from './auto/widget-manager'
import registerWebsiteBuilder from './auto/website-builder'
import registerWorkflowManager from './workflow/workflow-manager'
import registerDropZoneControl from './handlers/SmartDropZone-Handler'
import registerScreenPeeler from './handlers/ScreenPeeler-handler'
import registerPhantomKeyboard from './handlers/PhantomControl-handler'
import registerSecurityVault from './security/Security'
import registerSandboxManager from './security/sandbox-manager'
import registerEmailAuth from './security/email-auth'
import registerLockSystem from './security/lock-system'
import registerSkyvernAgent from './services/skyvern-screen-agent'
import { registerDemandSystemCoordinator } from './services/demand-system-coordinator'
import registerBackupManager from './services/backup-manager'
import registerChatHistoryManager from './logic/chat-history-manager'
import registerInterviewLauncher from './logic/interview-launcher'
import { nexusUpdater } from './services/nexus-updater'
import { dockManager } from './logic/dock-manager'
import { TelemetryBridge } from './telemetryBridge'

// Dev-only Reticle Electron main process instrumentation
if (!app.isPackaged || is.dev) {
  try {
    // @ts-ignore
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { initReticle } = require('@reticlehq/electron/main')
    initReticle?.()
  } catch {
    // Dev-only fallback if reticle package is not loaded
  }
}

// Privileged scheme registration for local nexus-asset:// URLs (wallpapers & screenshots)
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'nexus-asset',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      bypassCSP: true
    }
  }
])

app.commandLine.appendSwitch('use-fake-ui-for-media-stream')
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('enable-features', 'CanvasOopRasterization')
app.setName('Nexus AI 9.1')
app.setPath('userData', join(app.getPath('appData'), 'Nexus AI 9.1'))
nativeTheme.themeSource = 'dark'

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('nexus', process.execPath, [path.resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient('nexus')
}

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
  process.exit(0)
}

function handleDeepLinkUrl(urlStr: string) {
  try {
    const parsed = new URL(urlStr)
    if (parsed.protocol === 'nexus:' && (parsed.hostname === 'auth' || parsed.pathname.includes('auth'))) {
      const key = parsed.searchParams.get('key') || ''
      const token = parsed.searchParams.get('token') || ''
      const user = parsed.searchParams.get('user') || ''

      if (key) {
        try {
          const configPath = join(app.getPath('userData'), 'nexus_secure_vault.json')
          let existing: any = {}
          if (fs.existsSync(configPath)) {
            existing = JSON.parse(fs.readFileSync(configPath, 'utf8'))
          }
          const encrypted = safeStorage.isEncryptionAvailable()
            ? safeStorage.encryptString(key).toString('base64')
            : Buffer.from(key).toString('base64')

          existing.gemini = encrypted
          if (!existing.groq) existing.groq = encrypted
          fs.writeFileSync(configPath, JSON.stringify(existing, null, 2))
          console.log('[DEEP LINK] Stored API key from web bridge.')
        } catch (err) {
          console.error('[DEEP LINK] Failed to store API key:', err)
        }
      }

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('web-auth-bridge:synced', { key, token, user })
      }
    }

    const isInstallSkill = parsed.protocol === 'nexus:' && (parsed.hostname === 'install-skill' || parsed.pathname.includes('install-skill'))
    const isInstallPack = parsed.protocol === 'nexus:' && (parsed.hostname === 'install-pack' || parsed.pathname.includes('install-pack'))

    if (isInstallSkill || isInstallPack) {
      const slug = parsed.searchParams.get('slug') || ''
      const bundle = parsed.searchParams.get('bundle') || ''
      const pack = parsed.searchParams.get('pack') || ''

      const postPayload: Record<string, any> = { auto_elevate: false }
      if (isInstallPack || pack) {
        postPayload.pack = pack || slug
      } else {
        if (slug) postPayload.slug = slug
        if (bundle) postPayload.bundle = bundle
      }

      const targetDesc = postPayload.pack ? `Starter Pack '${postPayload.pack}'` : `Skill '${slug || bundle}'`
      console.log(`[DEEP LINK] Installing ${targetDesc} via local IPC gateway...`)
      const postData = JSON.stringify(postPayload)

      let token = process.env.NEXUS_IPC_TOKEN || ''
      try {
        const tokenPath = join(os.homedir(), '.nexus-agent', 'ipc_token.secret')
        if (fs.existsSync(tokenPath)) {
          token = fs.readFileSync(tokenPath, 'utf8').trim()
        }
      } catch (e) {
        console.debug('[DEEP LINK] Token read notice:', e)
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData).toString()
      }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: 47630,
          path: '/api/skills/import',
          method: 'POST',
          headers
        },
        (res) => {
          let body = ''
          res.on('data', (d) => (body += d))
          res.on('end', () => {
            try {
              const result = JSON.parse(body)
              console.log(`[DEEP LINK] ${targetDesc} install response:`, result)
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('skill:install-result', result)
              }
              new Notification({
                title: 'Nexus OS Skill Marketplace',
                body: result.success
                  ? `✓ Installed ${result.pack ? `Pack '${result.pack}'` : (result.skill_command || `/skill:${slug}`)} [AgentShield Verified]`
                  : `Notice: ${result.error || result.message || 'Review permissions.'}`
              }).show()
            } catch (e) {
              console.error('[DEEP LINK] Failed to parse install response:', e)
            }
          })
        }
      )
      req.on('error', (err) => {
        console.error('[DEEP LINK] Failed to connect to IPC server:', err)
      })
      req.write(postData)
      req.end()
    }

    const isAddProvider =
      parsed.protocol === 'nexus:' &&
      (parsed.hostname === 'add-provider' || parsed.pathname.includes('add-provider'))
    if (isAddProvider) {
      const providerId =
        parsed.searchParams.get('id') || parsed.searchParams.get('provider_id') || ''
      const model = parsed.searchParams.get('model') || ''
      const key = parsed.searchParams.get('key') || ''
      const baseUrl = parsed.searchParams.get('base_url') || ''

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('nexus:add-provider', {
          provider_id: providerId,
          model,
          key,
          base_url: baseUrl
        })
      }

      if (providerId) {
        let token = process.env.NEXUS_IPC_TOKEN || ''
        try {
          const tokenPath = join(os.homedir(), '.nexus-agent', 'ipc_token.secret')
          if (fs.existsSync(tokenPath)) {
            token = fs.readFileSync(tokenPath, 'utf8').trim()
          }
        } catch {}

        const postData = JSON.stringify({
          api_key: key,
          selected_model: model,
          base_url: baseUrl,
          enabled: true
        })

        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: 47630,
            path: `/api/providers/${encodeURIComponent(providerId)}/save`,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData).toString(),
              ...(token ? { Authorization: `Bearer ${token}` } : {})
            }
          },
          () => {
            new Notification({
              title: 'Nexus Provider Hub',
              body: `✓ Provider '${providerId}' configured in Nexus DPAPI Vault.`
            }).show()
          }
        )
        req.on('error', () => {})
        req.write(postData)
        req.end()
      }
    }

    const isConnectKaggle =
      parsed.protocol === 'nexus:' &&
      (parsed.hostname === 'connect-kaggle' || parsed.pathname.includes('connect-kaggle'))
    if (isConnectKaggle) {
      const endpoint = parsed.searchParams.get('endpoint') || parsed.searchParams.get('url') || ''
      const model = parsed.searchParams.get('model') || 'qwen3.8:27b'
      const token = parsed.searchParams.get('token') || ''
      const accelerator = parsed.searchParams.get('accelerator') || 'gpu_t4_x2'

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('nexus:connect-kaggle', {
          endpoint,
          model,
          token,
          accelerator
        })
      }

      if (endpoint) {
        let ipcToken = process.env.NEXUS_IPC_TOKEN || ''
        try {
          const tokenPath = join(os.homedir(), '.nexus-agent', 'ipc_token.secret')
          if (fs.existsSync(tokenPath)) {
            ipcToken = fs.readFileSync(tokenPath, 'utf8').trim()
          }
        } catch {}

        const postData = JSON.stringify({
          type: 'gpu',
          url: endpoint,
          model,
          token,
          accelerator
        })

        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: 47630,
            path: '/api/compute/nodes/direct',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData).toString(),
              ...(ipcToken ? { Authorization: `Bearer ${ipcToken}` } : {})
            }
          },
          () => {
            new Notification({
              title: 'Nexus Compute Pool',
              body: `✓ Connected Kaggle GPU worker node: ${model}`
            }).show()
          }
        )
        req.on('error', () => {})
        req.write(postData)
        req.end()
      }
    }

    const isConnectHf =
      parsed.protocol === 'nexus:' &&
      (parsed.hostname === 'connect-hf' || parsed.pathname.includes('connect-hf'))
    if (isConnectHf) {
      const endpoint = parsed.searchParams.get('endpoint') || parsed.searchParams.get('url') || ''
      const model = parsed.searchParams.get('model') || 'llama-3.2-3b'
      const token = parsed.searchParams.get('token') || ''
      const hardware = parsed.searchParams.get('hardware') || 'zero_gpu'

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('nexus:connect-hf', {
          endpoint,
          model,
          token,
          hardware
        })
      }

      if (endpoint) {
        let ipcToken = process.env.NEXUS_IPC_TOKEN || ''
        try {
          const tokenPath = join(os.homedir(), '.nexus-agent', 'ipc_token.secret')
          if (fs.existsSync(tokenPath)) {
            ipcToken = fs.readFileSync(tokenPath, 'utf8').trim()
          }
        } catch {}

        const postData = JSON.stringify({
          type: 'cpu',
          url: endpoint,
          model,
          token,
          hardware
        })

        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: 47630,
            path: '/api/compute/nodes/direct',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData).toString(),
              ...(ipcToken ? { Authorization: `Bearer ${ipcToken}` } : {})
            }
          },
          () => {
            new Notification({
              title: 'Nexus Compute Pool',
              body: `✓ Connected Hugging Face Space node: ${model}`
            }).show()
          }
        )
        req.on('error', () => {})
        req.write(postData)
        req.end()
      }
    }
  } catch (err) {
    console.error('[DEEP LINK] Error parsing deep link:', err)
  }
}

app.on('second-instance', (_event, commandLine) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }

  const urlArg = commandLine.find((arg) => arg.startsWith('nexus://'))
  if (urlArg) {
    handleDeepLinkUrl(urlArg)
  }
})

app.on('open-url', (event, url) => {
  event.preventDefault()
  handleDeepLinkUrl(url)
})

let mainWindow: BrowserWindow | null = null
let dockWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isOverlayMode = false
let isQuitting = false
let dockCollapseTimer: NodeJS.Timeout | null = null

const CM_TO_PX = 37.8
const DOCK_COLLAPSED_WIDTH = 204
const DOCK_COLLAPSED_HEIGHT = 40
const DOCK_EXPANDED_WIDTH = 620
const DOCK_EXPANDED_HEIGHT = 188
const DOCK_TOP_MARGIN = 8

const secureConfigPath = join(app.getPath('userData'), 'nexus_secure_vault.json')

const loadLocalEnvFile = () => {
  const candidates = [
    join(path.dirname(process.execPath), '.env.local'),
    join(app.getPath('userData'), '.env.local'),
    join(process.cwd(), '.env.local'),
    join(app.getAppPath(), '.env.local'),
    join(process.resourcesPath || '', '.env.local'),
    join(path.dirname(process.execPath), 'resources', '.env.local')
  ]

  for (const filePath of Array.from(new Set(candidates))) {
    try {
      if (!filePath || !fs.existsSync(filePath)) continue
      const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
        const [key, ...rest] = trimmed.split('=')
        if (!key || process.env[key]) continue
        process.env[key] = rest.join('=').replace(/^['"]|['"]$/g, '')
      }
    } catch {}
  }
}

loadLocalEnvFile()

function getAppIcon(): NativeImage {
  const iconPaths = [
    join(__dirname, '../../build/icon.ico'),
    join(__dirname, '../../resources/icon.png'),
    join(process.resourcesPath, 'icon.png'),
    join(process.resourcesPath, 'icon.ico'),
    join(process.resourcesPath, '../nexus-ai.ico'),
    join(process.resourcesPath, '../icon.ico'),
    join(process.resourcesPath, '../uninstallerIcon.ico'),
    join(app.getAppPath(), 'build/icon.ico'),
    join(app.getAppPath(), 'resources/icon.png'),
    icon
  ]
  for (const p of iconPaths) {
    if (p && fs.existsSync(p)) {
      const img = nativeImage.createFromPath(p)
      if (!img.isEmpty()) return img
    }
  }
  return nativeImage.createFromPath(icon)
}

let localRendererServer: http.Server | null = null
let localRendererUrl = ''

const RENDERER_MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm'
}

function startLocalRendererServer(): Promise<string> {
  if (localRendererUrl) return Promise.resolve(localRendererUrl)
  const rendererDir = join(__dirname, '../renderer')

  return new Promise((resolve) => {
    try {
      const server = http.createServer((req, res) => {
        try {
          const parsed = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`)
          let reqPath = decodeURIComponent(parsed.pathname)
          if (reqPath === '/' || !reqPath) reqPath = '/index.html'

          let filePath = join(rendererDir, reqPath)

          // Fallback to index.html for SPA routes or directories
          if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
            filePath = join(rendererDir, 'index.html')
          }

          if (!fs.existsSync(filePath)) {
            res.writeHead(404, { 'Content-Type': 'text/plain' })
            res.end('Not Found')
            return
          }

          const ext = path.extname(filePath).toLowerCase()
          const contentType = RENDERER_MIME_TYPES[ext] || 'application/octet-stream'

          res.writeHead(200, {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Cache-Control': 'no-cache'
          })

          const stream = fs.createReadStream(filePath)
          stream.on('error', () => {
            if (!res.headersSent) res.writeHead(500)
            res.end('Stream error')
          })
          stream.pipe(res)
        } catch {
          if (!res.headersSent) res.writeHead(500)
          res.end('Server Error')
        }
      })

      localRendererServer = server

      // Listen on 127.0.0.1 with port 0 (OS chooses an open ephemeral port)
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address()
        const port = typeof addr === 'object' && addr ? addr.port : 0
        localRendererUrl = `http://127.0.0.1:${port}`
        console.log(`[Production Server] Renderer served locally at ${localRendererUrl}`)
        resolve(localRendererUrl)
      })

      server.on('error', (err) => {
        console.warn('[Production Server] Local server error, fallback to file://', err)
        resolve('')
      })
    } catch (err) {
      console.warn('[Production Server] Could not initialize local server:', err)
      resolve('')
    }
  })
}

function createWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    showDesktopApp()
    return
  }

  mainWindow = new BrowserWindow({
    title: 'Nexus AI 9.1',
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: true,
    autoHideMenuBar: true,
    frame: false,
    backgroundColor: '#050505',
    center: true,
    icon: getAppIcon(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      backgroundThrottling: false,
      webSecurity: false,
      webviewTag: true
    }
  })

  nexusUpdater.setMainWindow(mainWindow)
  dockManager.setWindows(dockWindow, mainWindow)

  mainWindow.on('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription) => {
    console.error('MainWindow failed to load:', errorCode, errorDescription)
  })
  mainWindow.webContents.on('console-message', (_e, _level, message) => {
    console.log('[Renderer]', message)
  })
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('Renderer process gone:', details)
  })

  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show()
      mainWindow.focus()
    }
  }, 1200)

  mainWindow.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    hideDesktopApp()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else if (localRendererUrl) {
    mainWindow.loadURL(localRendererUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function loadRendererRoute(window: BrowserWindow, route = '') {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}${route ? `#${route}` : ''}`)
  } else if (localRendererUrl) {
    window.loadURL(`${localRendererUrl}${route ? `#${route}` : ''}`)
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'), route ? { hash: route } : {})
  }
}

function createDockWindow(): void {
  if (dockWindow && !dockWindow.isDestroyed()) {
    dockWindow.show()
    dockWindow.focus()
    return
  }

  const initialBounds = dockManager.computeCollapsedBounds()

  dockWindow = new BrowserWindow({
    width: initialBounds.width,
    height: initialBounds.height,
    x: initialBounds.x,
    y: initialBounds.y,
    show: false,
    frame: false,
    icon: getAppIcon(),
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      backgroundThrottling: false,
      webSecurity: false
    }
  })

  dockManager.setWindows(dockWindow, mainWindow)

  dockWindow.setAlwaysOnTop(true, 'screen-saver')
  dockWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  dockWindow.on('ready-to-show', () => dockWindow?.showInactive())
  dockWindow.on('closed', () => {
    dockWindow = null
    dockManager.setWindows(null, mainWindow)
  })

  loadRendererRoute(dockWindow, '/dock')

  setTimeout(() => {
    if (dockWindow && !dockWindow.isDestroyed() && !dockWindow.isVisible()) {
      dockWindow.showInactive()
    }
  }, 1500)
}

function sendDockCommand(command: string, payload?: any) {
  mainWindow?.webContents.send('dock-command', { command, payload })
  dockWindow?.webContents.send('dock-command', { command, payload })
}

function setDockExpanded(expanded: boolean) {
  dockManager.setExpanded(expanded)
}

function setDockBounds(_expanded: boolean) {
  dockManager.applyCurrentBounds()
}

function showDesktopApp() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  mainWindow.show()
  mainWindow.focus()
}

function hideDesktopApp() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.hide()
}

function getRepoRoot(): string {
  let curr = __dirname
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(curr, 'nexus.py'))) {
      return curr
    }
    const parent = path.dirname(curr)
    if (parent === curr) break
    curr = parent
  }
  return process.cwd()
}

function getVenvPython(gui = true): string {
  const wsDir = getRepoRoot()
  const py = path.join(wsDir, '.venv', 'Scripts', gui ? 'pythonw.exe' : 'python.exe')
  if (fs.existsSync(py)) return py
  return gui ? 'pythonw' : 'python'
}

type WorkspaceMode = 'DEV' | 'STUDY' | 'STUDIO' | 'SILENT'
let currentWorkspaceMode: WorkspaceMode = 'DEV'

function setWorkspaceMode(mode: WorkspaceMode) {
  currentWorkspaceMode = mode
  if (tray) {
    tray.setToolTip(`Nexus OS v5.0 — Sovereign Runtime [${mode}]`)
  }
  mainWindow?.webContents.send('nexus:workspace-mode-changed', { mode })

  // POST http://127.0.0.1:47630/api/workspace/mode
  try {
    const postData = JSON.stringify({ mode })
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 47630,
        path: '/api/workspace/mode',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      },
      (res) => {
        res.resume()
      }
    )
    req.on('error', () => {})
    req.write(postData)
    req.end()
  } catch {}

  const nexusHome = path.join(os.homedir(), '.nexus-agent')
  const dbPath = path.join(nexusHome, 'db', 'agent_local.db')
  const pyCode = `import sqlite3, pathlib, time; p = pathlib.Path(r"${dbPath}"); p.parent.mkdir(parents=True, exist_ok=True); c = sqlite3.connect(p, timeout=5.0); c.execute("PRAGMA journal_mode=WAL;"); c.execute("CREATE TABLE IF NOT EXISTS system_flags (flag_key TEXT PRIMARY KEY, flag_value TEXT NOT NULL, updated_at REAL NOT NULL);"); c.execute("INSERT INTO system_flags (flag_key, flag_value, updated_at) VALUES ('active_mode', '${mode}', ?) ON CONFLICT(flag_key) DO UPDATE SET flag_value='${mode}', updated_at=?", (time.time(), time.time())); c.commit(); c.close()`
  execFile(getVenvPython(true), ['-c', pyCode], { windowsHide: true }, () => {})
  updateTrayMenu()
}

function triggerEStop() {
  if (tray) {
    tray.setToolTip('Nexus OS v5.0 — 🛑 E-STOP TRIGGERED')
  }
  mainWindow?.webContents.send('nexus:estop-triggered', { timestamp: Date.now() })

  // POST http://127.0.0.1:47630/api/estop
  try {
    const postData = JSON.stringify({ reason: 'System Tray Emergency Stop Triggered' })
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 47630,
        path: '/api/estop',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      },
      (res) => {
        res.resume()
      }
    )
    req.on('error', () => {})
    req.write(postData)
    req.end()
  } catch {}

  const nexusHome = path.join(os.homedir(), '.nexus-agent')
  const dbPath = path.join(nexusHome, 'db', 'agent_local.db')
  const pyCode = `import sqlite3, pathlib, time; p = pathlib.Path(r"${dbPath}"); p.parent.mkdir(parents=True, exist_ok=True); c = sqlite3.connect(p, timeout=5.0); c.execute("PRAGMA journal_mode=WAL;"); c.execute("CREATE TABLE IF NOT EXISTS system_flags (flag_key TEXT PRIMARY KEY, flag_value TEXT NOT NULL, updated_at REAL NOT NULL);"); c.execute("INSERT INTO system_flags (flag_key, flag_value, updated_at) VALUES ('ESTOP', '1', ?) ON CONFLICT(flag_key) DO UPDATE SET flag_value='1', updated_at=?", (time.time(), time.time())); c.commit(); c.close()`
  execFile(getVenvPython(true), ['-c', pyCode], { windowsHide: true }, () => {})

  try {
    new Notification({
      title: 'Nexus OS — Emergency Stop Triggered',
      body: 'All execution slices, UIA clicks, and voice streams have been halted.'
    }).show()
  } catch {}
}

function toggleNotchHud(show?: boolean) {
  const pywPath = getVenvPython(true).replace(/\\/g, '\\\\')
  const wsRoot = getRepoRoot().replace(/\\/g, '\\\\')
  const pyCode = `import ctypes
user32 = ctypes.windll.user32
found = False
def enum_cb(hwnd, lparam):
    global found
    length = user32.GetWindowTextLengthW(hwnd)
    if length > 0:
        buff = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buff, length + 1)
        if "Nexus Dynamic Notch" in buff.value:
            found = True
            vis = user32.IsWindowVisible(hwnd)
            target = ${show === true ? 'True' : show === false ? 'False' : 'not vis'}
            user32.ShowWindow(hwnd, 5 if target else 0)
            if target:
                user32.SetForegroundWindow(hwnd)
    return True
WNDENUM = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
user32.EnumWindows(WNDENUM(enum_cb), 0)
if not found and ${show !== false ? 'True' : 'False'}:
    import subprocess, os
    workspace = r"${wsRoot}"
    si = subprocess.STARTUPINFO()
    si.lpDesktop = "WinSta0\\\\Default"
    subprocess.Popen([r"${pywPath}", "apps/notch_hud/main.py", "--no-tray"], cwd=workspace, startupinfo=si)
`
  execFile(getVenvPython(true), ['-c', pyCode], { windowsHide: true }, () => {})
}

function updateTrayMenu() {
  if (!tray) return
  const nexusHome = path.join(os.homedir(), '.nexus-agent')
  const logDir = path.join(nexusHome, 'logs')

  const template: MenuItemConstructorOptions[] = [
    {
      label: '🛑 TRIGGER E-STOP (Halt All Slices)',
      click: () => triggerEStop()
    },
    { type: 'separator' },
    {
      label: '⚡ Neural Workspace Mode',
      submenu: (['DEV', 'STUDY', 'STUDIO', 'SILENT'] as WorkspaceMode[]).map((mode) => ({
        label: `[${mode}]`,
        type: 'radio' as const,
        checked: currentWorkspaceMode === mode,
        click: () => setWorkspaceMode(mode)
      }))
    },
    { type: 'separator' },
    {
      label: '🛸 Open Nexus Workstation',
      click: () => showDesktopApp()
    },
    {
      label: '📌 Toggle Notch HUD',
      click: () => toggleNotchHud()
    },
    { type: 'separator' },
    {
      label: '📋 Open Boot & Telemetry Logs',
      click: () => {
        fs.mkdirSync(logDir, { recursive: true })
        shell.openPath(logDir)
      }
    },
    { type: 'separator' },
    {
      label: '🔄 Restart Nexus OS',
      click: () => {
        const workspaceRoot = getRepoRoot()
        const pyExec = getVenvPython(true)
        const nexusEntry = path.join(workspaceRoot, 'nexus.py')
        execFile(pyExec, [nexusEntry], { cwd: workspaceRoot, windowsHide: true }, () => {})
        app.relaunch()
        app.exit(0)
      }
    },
    {
      label: 'Quit Nexus OS',
      click: () => requestAppQuit()
    }
  ]

  tray.setContextMenu(Menu.buildFromTemplate(template))
}

function requestAppQuit() {
  isQuitting = true
  try {
    const pyCode = `import ctypes
user32 = ctypes.windll.user32
def enum_cb(hwnd, lparam):
    length = user32.GetWindowTextLengthW(hwnd)
    if length > 0:
        buff = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buff, length + 1)
        if "Nexus Dynamic Notch" in buff.value:
            user32.PostMessageW(hwnd, 0x0010, 0, 0)
    return True
WNDENUM = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
user32.EnumWindows(WNDENUM(enum_cb), 0)
`
    execFile('pythonw', ['-c', pyCode], { windowsHide: true }, () => {
      app.quit()
    })
  } catch {
    app.quit()
  }
}

function createTray() {
  if (tray) return
  const iconImg = getAppIcon()
  const image = iconImg.resize({ width: 16, height: 16 })
  tray = new Tray(image)
  tray.setToolTip(`Nexus OS v5.0 — Sovereign Runtime [${currentWorkspaceMode}]`)
  updateTrayMenu()
  tray.on('click', () => showDesktopApp())
  tray.on('double-click', () => showDesktopApp())
}

app.on('second-instance', (_event, commandLine) => {
  showDesktopApp()
  if (mainWindow && !mainWindow.isDestroyed()) {
    const url = commandLine.find((arg) => arg.startsWith('nexus://'))
    if (url) {
      mainWindow.webContents.send('oauth-callback', url)
    }
  }
})

function toggleOverlayMode() {
  if (!mainWindow) return

  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height } = primaryDisplay.workAreaSize

  if (isOverlayMode) {
    mainWindow.setResizable(true)
    mainWindow.setAlwaysOnTop(false)
    mainWindow.setBounds({ width: 950, height: 670 })
    mainWindow.center()
    mainWindow.webContents.send('overlay-mode', false)
  } else {
    const w = 340
    const h = 70
    mainWindow.setBounds({
      width: w,
      height: h,
      x: Math.floor(width / 2 - w / 2),
      y: height - h - 50
    })
    mainWindow.setAlwaysOnTop(true, 'screen-saver')
    mainWindow.setResizable(false)
    mainWindow.webContents.send('overlay-mode', true)
  }
  isOverlayMode = !isOverlayMode
}

function registerNexusAssetProtocol(): void {
  const repoRoot = getRepoRoot()
  const wallpapersDir = path.resolve(os.homedir(), '.nexus-agent', 'wallpapers')
  const screenshotsDir = path.resolve(repoRoot, 'docs', 'screenshots')

  try {
    if (!fs.existsSync(wallpapersDir)) {
      fs.mkdirSync(wallpapersDir, { recursive: true })
    }
  } catch {}

  try {
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true })
    }
  } catch {}

  protocol.handle('nexus-asset', async (request) => {
    try {
      const parsedUrl = new URL(request.url)

      // Strict null-byte and illegal control character check
      if (parsedUrl.href.includes('\0')) {
        return new Response('Access Denied: Invalid character in asset URL', {
          status: 403,
          statusText: 'Forbidden'
        })
      }

      let decodedPath = ''
      try {
        decodedPath = decodeURIComponent(parsedUrl.pathname)
      } catch {
        return new Response('Bad Request: Malformed URI encoding', {
          status: 400,
          statusText: 'Bad Request'
        })
      }

      const host = parsedUrl.hostname.toLowerCase()
      const normalizedPath = decodedPath.replace(/\\/g, '/')

      // Determine jail root: wallpapers or screenshots
      let baseDir = wallpapersDir
      let relativeSubPath = ''

      if (host === 'screenshots' || normalizedPath.startsWith('/screenshots/') || normalizedPath === '/screenshots') {
        baseDir = screenshotsDir
        relativeSubPath = host === 'screenshots'
          ? normalizedPath.replace(/^\/+/, '')
          : normalizedPath.replace(/^\/screenshots\/?/, '')
      } else if (
        (host === 'docs' && (normalizedPath.startsWith('/screenshots/') || normalizedPath === '/screenshots')) ||
        normalizedPath.startsWith('/docs/screenshots/') ||
        normalizedPath === '/docs/screenshots'
      ) {
        baseDir = screenshotsDir
        relativeSubPath = normalizedPath.replace(/^\/(?:docs\/)?screenshots\/?/, '')
      } else if (host === 'wallpapers' || normalizedPath.startsWith('/wallpapers/') || normalizedPath === '/wallpapers') {
        baseDir = wallpapersDir
        relativeSubPath = host === 'wallpapers'
          ? normalizedPath.replace(/^\/+/, '')
          : normalizedPath.replace(/^\/wallpapers\/?/, '')
      } else if (host && host !== 'localhost' && host !== '127.0.0.1') {
        const combined = `${parsedUrl.hostname}${normalizedPath}`.replace(/^\/+/, '')
        if (combined.startsWith('screenshots/')) {
          baseDir = screenshotsDir
          relativeSubPath = combined.replace(/^screenshots\/?/, '')
        } else if (combined.startsWith('docs/screenshots/')) {
          baseDir = screenshotsDir
          relativeSubPath = combined.replace(/^docs\/screenshots\/?/, '')
        } else if (combined.startsWith('wallpapers/')) {
          baseDir = wallpapersDir
          relativeSubPath = combined.replace(/^wallpapers\/?/, '')
        } else {
          baseDir = wallpapersDir
          relativeSubPath = combined
        }
      } else {
        const cleanPath = normalizedPath.replace(/^\/+/, '')
        const checkWallpaper = path.resolve(wallpapersDir, cleanPath)
        const checkScreenshot = path.resolve(screenshotsDir, cleanPath)
        if (fs.existsSync(checkScreenshot) && !fs.existsSync(checkWallpaper)) {
          baseDir = screenshotsDir
          relativeSubPath = cleanPath
        } else {
          baseDir = wallpapersDir
          relativeSubPath = cleanPath
        }
      }

      // Canonical jail root validation
      const jailRoot = path.resolve(baseDir)
      const targetPath = path.resolve(jailRoot, relativeSubPath)

      // Path traversal check: must not escape jail root
      const relToJail = path.relative(jailRoot, targetPath)
      const jailRootWithSep = jailRoot.endsWith(path.sep) ? jailRoot : jailRoot + path.sep

      const isInsideJail =
        !relToJail.startsWith('..') &&
        !path.isAbsolute(relToJail) &&
        (targetPath === jailRoot || targetPath.toLowerCase().startsWith(jailRootWithSep.toLowerCase()))

      if (!isInsideJail) {
        return new Response('Access Denied: Path Traversal Prohibited', {
          status: 403,
          statusText: 'Forbidden'
        })
      }

      // Check file existence
      if (!fs.existsSync(targetPath)) {
        return new Response('Asset Not Found', {
          status: 404,
          statusText: 'Not Found'
        })
      }

      // Symlink jail breakout verification (canonical target must reside inside jail)
      try {
        const realTarget = fs.realpathSync(targetPath)
        let realJailRoot = jailRoot
        try {
          realJailRoot = fs.realpathSync(jailRoot)
        } catch {}
        const realJailWithSep = realJailRoot.endsWith(path.sep) ? realJailRoot : realJailRoot + path.sep
        const realRel = path.relative(realJailRoot, realTarget)
        const isRealInside =
          !realRel.startsWith('..') &&
          !path.isAbsolute(realRel) &&
          (realTarget === realJailRoot || realTarget.toLowerCase().startsWith(realJailWithSep.toLowerCase()))

        if (!isRealInside) {
          return new Response('Access Denied: Symlink Jail Breakout Prohibited', {
            status: 403,
            statusText: 'Forbidden'
          })
        }
      } catch {
        return new Response('Access Denied: Cannot verify asset security constraints', {
          status: 403,
          statusText: 'Forbidden'
        })
      }

      const stat = fs.statSync(targetPath)
      if (stat.isDirectory()) {
        return new Response('Access Denied: Directory Access Prohibited', {
          status: 403,
          statusText: 'Forbidden'
        })
      }

      // Stream asset safely via net.fetch with file:// URL
      return await net.fetch(pathToFileURL(targetPath).toString())
    } catch (err: any) {
      return new Response(`Internal Asset Error: ${err?.message || 'Unknown asset error'}`, {
        status: 500,
        statusText: 'Internal Server Error'
      })
    }
  })
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.resolutenexus.nexusai')
  registerNexusAssetProtocol()


  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowedPermissions = [
      'media',
      'audioCapture',
      'videoCapture',
      'desktopVideoCapture',
      'microphone',
      'camera'
    ]
    if (allowedPermissions.includes(permission)) {
      callback(true)
    } else {
      callback(false)
    }
  })

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    const allowedPermissions = [
      'media',
      'audioCapture',
      'videoCapture',
      'desktopVideoCapture',
      'microphone',
      'camera'
    ]
    return allowedPermissions.includes(permission)
  })

  if (process.platform === 'darwin') {
    if (systemPreferences.getMediaAccessStatus('microphone') !== 'granted') {
      systemPreferences.askForMediaAccess('microphone')
    }
    if (systemPreferences.getMediaAccessStatus('camera') !== 'granted') {
      systemPreferences.askForMediaAccess('camera')
    }
  }

  ipcMain.handle(
    'secure-save-keys',
    async (_, { groqKey, geminiKey, fireworksKey = '', puterToken = '' }) => {
      try {
        let groqEncrypted, geminiEncrypted, fireworksEncrypted, puterEncrypted

        if (safeStorage.isEncryptionAvailable()) {
          groqEncrypted = safeStorage.encryptString(groqKey).toString('base64')
          geminiEncrypted = safeStorage.encryptString(geminiKey).toString('base64')
          fireworksEncrypted = safeStorage.encryptString(fireworksKey).toString('base64')
          puterEncrypted = safeStorage.encryptString(puterToken).toString('base64')
        } else {
          groqEncrypted = Buffer.from(groqKey).toString('base64')
          geminiEncrypted = Buffer.from(geminiKey).toString('base64')
          fireworksEncrypted = Buffer.from(fireworksKey).toString('base64')
          puterEncrypted = Buffer.from(puterToken).toString('base64')
        }

        const secureData = {
          groq: groqEncrypted,
          gemini: geminiEncrypted,
          fireworks: fireworksEncrypted,
          puter: puterEncrypted
        }

        fs.writeFileSync(secureConfigPath, JSON.stringify(secureData))
        return { success: true }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  ipcMain.handle('secure-get-keys', async () => {
    let groqKey = process.env.GROQ_API_KEY || ''
    let geminiKey = process.env.GEMINI_API_KEY || ''
    let fireworksKey = process.env.FIREWORKS_API_KEY || ''
    let puterToken =
      process.env.PUTER_AUTH_TOKEN || process.env.NEXUS_PUTER_TOKEN || ''

    if (fs.existsSync(secureConfigPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(secureConfigPath, 'utf8'))
        if (safeStorage.isEncryptionAvailable()) {
          groqKey = data.groq ? safeStorage.decryptString(Buffer.from(data.groq, 'base64')) : groqKey
          const decryptedGemini = data.gemini ? safeStorage.decryptString(Buffer.from(data.gemini, 'base64')) : ''
          geminiKey = decryptedGemini || geminiKey
          fireworksKey = data.fireworks
            ? safeStorage.decryptString(Buffer.from(data.fireworks, 'base64'))
            : fireworksKey
          puterToken = data.puter
            ? safeStorage.decryptString(Buffer.from(data.puter, 'base64'))
            : puterToken
        } else {
          groqKey = data.groq ? Buffer.from(data.groq, 'base64').toString('utf8') : groqKey
          const decryptedGemini = data.gemini ? Buffer.from(data.gemini, 'base64').toString('utf8') : ''
          geminiKey = decryptedGemini || geminiKey
          fireworksKey = data.fireworks ? Buffer.from(data.fireworks, 'base64').toString('utf8') : fireworksKey
          puterToken = data.puter
            ? Buffer.from(data.puter, 'base64').toString('utf8')
            : puterToken
        }
      } catch (_err) {
        // fallback
      }
    }

    return { groqKey, geminiKey, fireworksKey, puterToken }
  })

  ipcMain.handle('check-keys-exist', () => {
    return true
  })

  ipcMain.handle('save-whiteboard-pdf', async (_event, { imageDataUrl, title }) => {
    const annotationDir = join(app.getPath('documents'), 'Annotation')
    fs.mkdirSync(annotationDir, { recursive: true })

    const safeTitle = String(title || 'Nexus Whiteboard')
      .replace(/[<>:"/\\|?*]+/g, '-')
      .slice(0, 80)
    const filename = `${safeTitle}-${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`
    const outputPath = join(annotationDir, filename)

    const pdfWindow = new BrowserWindow({
      show: false,
      width: 1240,
      height: 1754,
      webPreferences: {
        sandbox: false
      }
    })

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            html, body { margin: 0; background: white; }
            body { width: 1240px; min-height: 1754px; display: flex; align-items: flex-start; justify-content: center; }
            img { width: 1120px; margin-top: 48px; border: 1px solid #d6efe7; }
          </style>
        </head>
        <body><img src="${imageDataUrl}" /></body>
      </html>`

    await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const pdf = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { marginType: 'none' }
    })
    fs.writeFileSync(outputPath, pdf)
    pdfWindow.close()
    return { success: true, path: outputPath }
  })

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders }
    delete responseHeaders['content-security-policy']
    delete responseHeaders['x-content-security-policy']
    delete responseHeaders['access-control-allow-origin']
    delete responseHeaders['x-frame-options']
    delete responseHeaders['X-Frame-Options']

    callback({
      responseHeaders,
      statusLine: details.statusLine
    })
  })

  ipcMain.removeHandler('open-external-url')
  ipcMain.handle('open-external-url', async (_event, url: string) => {
    try {
      if (url && typeof url === 'string') {
        await shell.openExternal(url)
        return { success: true }
      }
      return { success: false, error: 'Empty or invalid URL' }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to open external URL' }
    }
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  app.on('open-url', (event, url) => {
    event.preventDefault()
    if (mainWindow && url.startsWith('nexus://')) {
      mainWindow.webContents.send('oauth-callback', url)
    }
  })

  registerDemandSystemCoordinator(ipcMain)
  registerBackupManager()
  registerLockSystem()
  registerEmailAuth()
  registerSecurityVault()
  registerSandboxManager(ipcMain)
  registerPhantomKeyboard()
  registerScreenPeeler()
  registerDropZoneControl(ipcMain)
  registerPerformanceGovernor({ ipcMain, app, getMainWindow: () => mainWindow })
  registerWorkflowManager()
  registerWebsiteBuilder()
  registerWidgetMaker()
  registerAiGateway(ipcMain)
  registerChatHistoryManager({ ipcMain, app })
  registerMcpHandlers(ipcMain)
  registerAgentFleet(ipcMain)
  registerMobileCommandBridge({ app, getMainWindow: () => mainWindow })
  registerIssueReporter({
    ipcMain,
    app,
    getMainWindow: () => mainWindow,
    webAppUrl: process.env.NEXUS_WEB_APP_URL || 'https://nexusaix.vercel.app'
  })
  registerDeepResearch({ ipcMain })
  registerOracle({ ipcMain })
  registerWormhole({ ipcMain })
  registerPermanentMemory({ ipcMain, app })
  registerTelekinesis({ ipcMain })
  registerNexusCoder({ ipcMain, app })
  registerRealityHacker(ipcMain)
  registerAdbHandlers(ipcMain)
  registerMediaControl(ipcMain)
  registerLocationHandlers(ipcMain)
  registerGmailHandlers(ipcMain)
  registerGalleryHandlers(ipcMain)
  registerterminalControl(ipcMain)
  registerGhostControl(ipcMain)
  registerWebAgent(ipcMain)
  registerWhiteboardDocs({ ipcMain, app })
  registerNotesHandlers(ipcMain)
  registerAppLauncher(ipcMain)
  registerDirLoader(ipcMain)
  registerFileOpen(ipcMain)
  registerFileSearch(ipcMain)
  registerFileRead(ipcMain)
  registerFileWrite(ipcMain)
  registerFilePatcher(ipcMain)
  registerSnapshotHandlers(ipcMain)
  registerVisualGrounding(ipcMain)
  registerVisualSentry(ipcMain)
  registerKnowledgeGraph({ ipcMain, app })
  registerFileOps(ipcMain)
  registerFileScanner(ipcMain)
  registerSystemHandlers(ipcMain)
  registerIpcHandlers({ ipcMain, app })
  registerWallpaperEngine(ipcMain)
  registerWhatsAppManager(ipcMain)
  registerDocForge(ipcMain)
  registerFocusProtocol(ipcMain)
  registerSkyvernAgent(ipcMain, app)
  registerEcosystemManager({ app, getMainWindow: () => mainWindow })
  registerInterviewLauncher(ipcMain)
  dockManager.registerIpcHandlers()

  ipcMain.handle('get-vault-secret', async (_event, keyName: string) => {
    try {
      if (process.env[keyName]) {
        return { success: true, value: process.env[keyName] }
      }
      const token = process.env.NEXUS_IPC_TOKEN || ''
      const resp = await fetch('http://127.0.0.1:47630/api/vault/get', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ key: keyName })
      }).catch(() => null)
      if (resp && resp.ok) {
        const data = (await resp.json()) as any
        if (data.value) return { success: true, value: data.value }
      }
      return await new Promise((resolve) => {
        const pyCode = `import json; from core.security.vault import VaultManager; print(json.dumps({'value': VaultManager().get_secret('${keyName}')}))`
        execFile(
          getVenvPython(false),
          ['-c', pyCode],
          { cwd: getRepoRoot(), windowsHide: true },
          (err, stdout) => {
            if (err || !stdout) {
              resolve({ success: false, value: '' })
            } else {
              try {
                const parsed = JSON.parse(stdout.trim())
                resolve({ success: true, value: parsed.value || '' })
              } catch {
                resolve({ success: false, value: '' })
              }
            }
          }
        )
      })
    } catch (err: any) {
      return { success: false, value: '', error: err?.message }
    }
  })

  ipcMain.handle('set-vault-secret', async (_event, data: { key: string; value: string } | string, secretVal?: string) => {
    try {
      const keyName = typeof data === 'string' ? data : data?.key
      const keyValue = typeof data === 'string' ? (secretVal || '') : (data?.value || '')
      if (!keyName) return { success: false, error: 'Secret key name is required' }

      let token = process.env.NEXUS_IPC_TOKEN || ''
      try {
        const tokenPath = join(os.homedir(), '.nexus-agent', 'ipc_token.secret')
        if (fs.existsSync(tokenPath)) {
          token = fs.readFileSync(tokenPath, 'utf8').trim()
        }
      } catch {}

      const resp = await fetch('http://127.0.0.1:47630/api/vault/set', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ key: keyName, value: keyValue })
      }).catch(() => null)

      if (resp && resp.ok) {
        return { success: true }
      }

      return await new Promise((resolve) => {
        const pyCode = `import json, sys; from core.security.vault import VaultManager; VaultManager().set_secret(sys.argv[1], sys.argv[2]); print(json.dumps({'success': True}))`
        execFile(
          getVenvPython(false),
          ['-c', pyCode, keyName, keyValue],
          { cwd: getRepoRoot(), windowsHide: true },
          (err, stdout) => {
            if (err || !stdout) {
              resolve({ success: false, error: String(err) })
            } else {
              try {
                const parsed = JSON.parse(stdout.trim())
                resolve({ success: Boolean(parsed.success) })
              } catch {
                resolve({ success: false })
              }
            }
          }
        )
      })
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  })

  ipcMain.handle('get-auth-token', async () => {
    let token = process.env.NEXUS_IPC_TOKEN || ''
    try {
      const tokenPath = join(os.homedir(), '.nexus-agent', 'ipc_token.secret')
      if (fs.existsSync(tokenPath)) {
        token = fs.readFileSync(tokenPath, 'utf8').trim()
      }
    } catch (e) {
      console.debug('[AUTH] Token read notice:', e)
    }
    return token
  })

  ipcMain.handle('fetch-yahoo-stock', async (_event, ticker: string) => {
    return new Promise((resolve) => {
      const sanitizedTicker = encodeURIComponent(String(ticker || '').trim().toUpperCase())
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sanitizedTicker}?range=1d&interval=5m`
      httpsGet(
        url,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            Accept: 'application/json'
          }
        },
        (res) => {
          let data = ''
          res.on('data', (chunk) => {
            data += chunk
          })
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data)
              if (parsed?.chart?.result?.[0]) {
                resolve({ success: true, result: parsed.chart.result[0] })
              } else {
                resolve({
                  success: false,
                  error: parsed?.chart?.error?.description || 'Invalid ticker response'
                })
              }
            } catch (err: any) {
              resolve({ success: false, error: err?.message || 'JSON parse error' })
            }
          })
        }
      ).on('error', (err) => {
        resolve({ success: false, error: err.message })
      })
    })
  })

  // Official nexus:fetch-stock IPC handler + structured stock API client
  ipcMain.handle('nexus:fetch-stock', async (_event, ticker: string) => {
    return new Promise((resolve) => {
      const sanitizedTicker = encodeURIComponent(String(ticker || '').trim().toUpperCase())
      if (!sanitizedTicker) {
        return resolve({ success: false, error: 'Empty ticker symbol' })
      }
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sanitizedTicker}?range=1d&interval=5m`
      httpsGet(
        url,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            Accept: 'application/json'
          }
        },
        (res) => {
          let data = ''
          res.on('data', (chunk) => {
            data += chunk
          })
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data)
              const chartResult = parsed?.chart?.result?.[0]
              if (chartResult) {
                const meta = chartResult.meta || {}
                const quote = chartResult.indicators?.quote?.[0] || {}
                const closes = (quote.close || []).filter((v: any) => typeof v === 'number')
                const currentPrice = meta.regularMarketPrice ?? (closes.length ? closes[closes.length - 1] : 0)
                const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? currentPrice
                const change = currentPrice - prevClose
                const changePct = prevClose ? (change / prevClose) * 100 : 0

                resolve({
                  success: true,
                  ticker: sanitizedTicker,
                  price: currentPrice,
                  previousClose: prevClose,
                  change: Math.round(change * 100) / 100,
                  changePercent: Math.round(changePct * 100) / 100,
                  currency: meta.currency || 'USD',
                  exchangeName: meta.exchangeName || '',
                  timestamps: chartResult.timestamp || [],
                  closes,
                  raw: chartResult,
                  result: chartResult
                })
              } else {
                resolve({
                  success: false,
                  ticker: sanitizedTicker,
                  error: parsed?.chart?.error?.description || 'Invalid ticker response'
                })
              }
            } catch (err: any) {
              resolve({ success: false, error: err?.message || 'JSON parse error' })
            }
          })
        }
      ).on('error', (err) => {
        resolve({ success: false, error: err.message })
      })
    })
  })

  // Official nexus:whiteboard-ops IPC handler supporting export_png and snapshot management
  ipcMain.handle('nexus:whiteboard-ops', async (_event, payload: any = {}) => {
    const op = payload.action || payload.op || 'export_png'
    const docsDir = join(app.getPath('documents'), 'Nexus AI Whiteboards')
    fs.mkdirSync(docsDir, { recursive: true })

    if (op === 'export_png') {
      try {
        const rawUrl = String(payload.imageDataUrl || payload.dataUrl || '')
        if (!rawUrl) {
          return { success: false, error: 'No image data provided for PNG export' }
        }
        const base64Data = rawUrl.replace(/^data:image\/\w+;base64,/, '')
        const buffer = Buffer.from(base64Data, 'base64')
        const safeTitle = String(payload.title || 'Nexus Whiteboard')
          .replace(/[<>:"/\\|?*]+/g, '-')
          .slice(0, 70)
        const filename = `${safeTitle}-${new Date().toISOString().replace(/[:.]/g, '-')}.png`
        const filePath = join(docsDir, filename)
        fs.writeFileSync(filePath, buffer)

        const latestPath = join(docsDir, 'latest_whiteboard.png')
        fs.writeFileSync(latestPath, buffer)

        return {
          success: true,
          op: 'export_png',
          path: filePath,
          latestPath,
          filename
        }
      } catch (err: any) {
        return { success: false, error: err?.message || 'Failed to export PNG' }
      }
    }

    if (op === 'save_snapshot') {
      try {
        const snapshot = payload.snapshot
        const title = String(payload.title || 'board_snapshot').replace(/[<>:"/\\|?*]+/g, '-')
        const filePath = join(docsDir, `${title}.tldr`)
        fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf-8')
        return { success: true, op: 'save_snapshot', path: filePath }
      } catch (err: any) {
        return { success: false, error: err?.message || 'Failed to save snapshot' }
      }
    }

    if (op === 'list_boards') {
      try {
        const files = fs.readdirSync(docsDir).filter((f) => f.endsWith('.png') || f.endsWith('.tldr') || f.endsWith('.md'))
        return { success: true, op: 'list_boards', files, folder: docsDir }
      } catch (err: any) {
        return { success: false, error: err?.message || 'Failed listing boards' }
      }
    }

    if (['node', 'arrow', 'text', 'equation', 'clear', 'box', 'rectangle'].includes(op.toLowerCase())) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('nexus:whiteboard-ops', payload)
      }
      return { success: true, op, message: `Dispatched ${op} operation to canvas` }
    }

    return { success: true, op, message: 'Operation completed' }
  })

  ipcMain.handle('get-screen-source', async () => {
    const sources = await desktopCapturer.getSources({ types: ['screen'] })
    return sources[0]?.id
  })

  ipcMain.handle('get-desktop-sources', async (_event, options?: { types?: ('screen' | 'window')[] }) => {
    try {
      const types = options?.types || ['screen', 'window']
      const sources = await desktopCapturer.getSources({
        types,
        thumbnailSize: { width: 480, height: 270 },
        fetchWindowIcons: true
      })
      return sources.map((source) => ({
        id: source.id,
        name: source.name,
        display_id: source.display_id,
        type: source.id.startsWith('screen:') ? 'screen' : 'window',
        thumbnail: source.thumbnail ? source.thumbnail.toDataURL() : '',
        appIcon: source.appIcon ? source.appIcon.toDataURL() : null
      }))
    } catch (err: any) {
      console.error('[get-desktop-sources] Error fetching desktop sources:', err)
      return []
    }
  })

  ipcMain.handle('get-app-version', () => app.getVersion())

  ipcMain.handle('check-for-updates', async (_event, forceCheck = false) => {
    try {
      const result = await nexusUpdater.checkForUpdates(Boolean(forceCheck))
      return { success: true, ...result }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Check failed.' }
    }
  })

  ipcMain.handle('download-update', async () => {
    try {
      return await nexusUpdater.downloadUpdate()
    } catch (err: any) {
      return { success: false, error: err?.message || 'Download failed.' }
    }
  })

  ipcMain.handle('install-update', () => {
    try {
      return nexusUpdater.installUpdate()
    } catch (err: any) {
      return { success: false, error: err?.message || 'Install failed.' }
    }
  })

  ipcMain.handle('defer-update', () => {
    try {
      return nexusUpdater.deferUpdate()
    } catch (err: any) {
      return { success: false, error: err?.message || 'Defer failed.' }
    }
  })

  ipcMain.handle('get-update-status', () => {
    return nexusUpdater.getStatus()
  })

  ipcMain.handle('open-updates-folder', () => {
    nexusUpdater.openUpdatesFolder()
    return { success: true }
  })

  if (!is.dev || !process.env['ELECTRON_RENDERER_URL']) {
    await startLocalRendererServer()
  }

  createWindow()
  showDesktopApp()
  // Single Unified System: PySide6 Dynamic Notch HUD owns the top dock; no duplicate Electron dock!
  createTray()
  const _telemetryBridge = new TelemetryBridge(() => [mainWindow, dockWindow])

  const appMenu = Menu.buildFromTemplate([
    {
      label: 'Nexus AI',
      submenu: [
        { label: 'About Nexus AI', role: 'about' },
        { type: 'separator' },
        { label: 'Quit App', accelerator: 'CommandOrControl+Q', click: () => requestAppQuit() }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CommandOrControl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'CommandOrControl+Y', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CommandOrControl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CommandOrControl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CommandOrControl+V', role: 'paste' },
        { label: 'Select All', accelerator: 'CommandOrControl+A', role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Reload Interface',
          accelerator: 'CommandOrControl+R',
          click: () => mainWindow?.webContents.reload()
        },
        {
          label: 'Refresh All Systems & Agents',
          accelerator: 'CommandOrControl+Shift+R',
          click: () => {
            mainWindow?.webContents.send('nexus-trigger-refresh-all')
          }
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'CommandOrControl+Shift+I',
          click: () => mainWindow?.webContents.toggleDevTools()
        },
        { type: 'separator' },
        {
          label: 'Zoom In',
          accelerator: 'CommandOrControl+=',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              const current = mainWindow.webContents.getZoomFactor()
              const next = Math.min(2.0, Math.round((current + 0.1) * 10) / 10)
              mainWindow.webContents.setZoomFactor(next)
              mainWindow.webContents.send('zoom-changed', next)
            }
          }
        },
        {
          label: 'Zoom Out',
          accelerator: 'CommandOrControl+-',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              const current = mainWindow.webContents.getZoomFactor()
              const next = Math.max(0.5, Math.round((current - 0.1) * 10) / 10)
              mainWindow.webContents.setZoomFactor(next)
              mainWindow.webContents.send('zoom-changed', next)
            }
          }
        },
        {
          label: 'Reset Zoom',
          accelerator: 'CommandOrControl+0',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.setZoomFactor(1.0)
              mainWindow.webContents.send('zoom-changed', 1.0)
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Toggle Full Screen',
          accelerator: 'F11',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.setFullScreen(!mainWindow.isFullScreen())
            }
          }
        }
      ]
    }
  ])
  Menu.setApplicationMenu(appMenu)

  ipcMain.handle('window-set-zoom', (event, factor: number) => {
    const clamped = Math.max(0.5, Math.min(2.0, Number(factor) || 1.0))
    event.sender.setZoomFactor(clamped)
    return event.sender.getZoomFactor()
  })

  ipcMain.handle('window-get-zoom', (event) => {
    return event.sender.getZoomFactor()
  })

  ipcMain.handle('window-reload', (event) => {
    event.sender.reload()
    return true
  })

  ipcMain.handle('window-toggle-devtools', (event) => {
    event.sender.toggleDevTools()
    return true
  })

  ipcMain.handle('window-toggle-fullscreen', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      const isFull = !win.isFullScreen()
      win.setFullScreen(isFull)
      return isFull
    }
    return false
  })

  if (mainWindow) {
    nexusUpdater.init(mainWindow)
  }

  setTimeout(() => {
    void nexusUpdater.checkForUpdates().catch((err) => {
      console.warn('[NexusUpdater] Automatic startup check warning:', err)
    })
  }, 3500)

  ipcMain.on('window-min', () => mainWindow?.minimize())
  ipcMain.on('window-close', () => hideDesktopApp())
  ipcMain.on('window-max', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
  })

  globalShortcut.register('CommandOrControl+Shift+I', () => toggleOverlayMode())
  ipcMain.on('toggle-overlay', () => toggleOverlayMode())
  ipcMain.on('dock-expand', () => setDockExpanded(true))
  ipcMain.on('dock-collapse', () => setDockExpanded(false))
  ipcMain.on('dock-command', (_event, command, payload) => {
    if (command === 'open-dock') createDockWindow()
    else if (command === 'close-dock') dockWindow?.hide()
    else if (command === 'open-desktop') showDesktopApp()
    else if (command === 'quit-app') requestAppQuit()
    else if (command === 'set-dock-config') {
      dockManager.saveConfig(payload)
    } else if (command === 'reposition-dock') {
      dockManager.applyCurrentBounds()
    } else sendDockCommand(command, payload)
  })

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  isQuitting = true
  globalShortcut.unregisterAll()
  if (localRendererServer) {
    try {
      localRendererServer.close()
    } catch {}
  }
})

app.on('window-all-closed', () => {
  if (isQuitting && process.platform !== 'darwin') {
    app.quit()
  }
})
