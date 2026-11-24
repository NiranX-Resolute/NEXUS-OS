import { IpcMain, app, desktopCapturer } from 'electron'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import http from 'http'

function getCandidateCopilotDirs(): string[] {
  const dirs: string[] = []

  // 1. Environment variable override
  if (process.env.NEXUS_COPILOT_DIR) {
    dirs.push(process.env.NEXUS_COPILOT_DIR)
  }

  // 2. Relative to process.cwd()
  dirs.push(path.resolve(process.cwd(), 'Nexus Interview copilot'))
  dirs.push(path.resolve(process.cwd(), '..', 'Nexus Interview copilot'))
  dirs.push(path.resolve(process.cwd(), '../..', 'Nexus Interview copilot'))

  // 3. Relative to app.getAppPath()
  try {
    const appPath = app.getAppPath()
    dirs.push(path.resolve(appPath, '..', 'Nexus Interview copilot'))
    dirs.push(path.resolve(appPath, '../..', 'Nexus Interview copilot'))
    dirs.push(path.resolve(appPath, '../../..', 'Nexus Interview copilot'))
    dirs.push(path.resolve(appPath, '../../../..', 'Nexus Interview copilot'))
  } catch {}

  // 4. Relative to __dirname
  dirs.push(path.resolve(__dirname, '../../../Nexus Interview copilot'))
  dirs.push(path.resolve(__dirname, '../../../../Nexus Interview copilot'))
  dirs.push(path.resolve(__dirname, '../../../../../Nexus Interview copilot'))

  // 5. Installed app resources directory
  try {
    const exeDir = path.dirname(process.execPath)
    dirs.push(path.resolve(exeDir, 'Nexus Interview copilot'))
    dirs.push(path.resolve(exeDir, 'resources', 'Nexus Interview copilot'))
    dirs.push(path.resolve(exeDir, 'resources', 'copilot'))
    if (process.resourcesPath) {
      dirs.push(path.resolve(process.resourcesPath, 'Nexus Interview copilot'))
      dirs.push(path.resolve(process.resourcesPath, 'copilot'))
    }
  } catch {}

  // 6. User profile / Documents workspace locations
  try {
    const userDocs = app.getPath('documents')
    dirs.push(path.resolve(userDocs, 'antigravity', 'Nexus Desktop', 'Nexus Interview copilot'))
  } catch {}

  if (process.env.USERPROFILE) {
    dirs.push(
      path.resolve(
        process.env.USERPROFILE,
        'Documents',
        'antigravity',
        'Nexus Desktop',
        'Nexus Interview copilot'
      )
    )
  }

  return Array.from(new Set(dirs))
}

function resolveCopilotLaunchTarget(): {
  executablePath: string | null
  devDirPath: string | null
  unpackedPath: string | null
  portablePath: string | null
} {
  const candidateDirs = getCandidateCopilotDirs()

  let firstFoundDir: string | null = null
  let foundUnpacked: string | null = null
  let foundPortable: string | null = null

  for (const dir of candidateDirs) {
    if (!fs.existsSync(dir)) continue

    if (!firstFoundDir) {
      firstFoundDir = dir
    }

    const unpacked = path.resolve(dir, 'release/win-unpacked/nexus-interview-copilot.exe')
    if (fs.existsSync(unpacked) && !foundUnpacked) {
      foundUnpacked = unpacked
    }

    const portable = path.resolve(dir, 'release/nexus-interview-copilot-1.0.0-portable.exe')
    if (fs.existsSync(portable) && !foundPortable) {
      foundPortable = portable
    }

    const directExe = path.resolve(dir, 'nexus-interview-copilot.exe')
    if (fs.existsSync(directExe) && !foundUnpacked) {
      foundUnpacked = directExe
    }
  }

  // Prioritize unpacked (instant sub-300ms launch) over portable (takes seconds to unpack)
  const executablePath = foundUnpacked || foundPortable || null

  return {
    executablePath,
    devDirPath: firstFoundDir,
    unpackedPath: foundUnpacked,
    portablePath: foundPortable
  }
}

function getCandidateNexusDirs(): string[] {
  const dirs: string[] = []
  if (process.env.NEXUS_CORE_DIR) dirs.push(process.env.NEXUS_CORE_DIR)
  dirs.push(path.resolve(process.cwd(), 'nexus'))
  dirs.push(path.resolve(process.cwd(), '..', 'nexus'))
  dirs.push(path.resolve(process.cwd(), '../..', 'nexus'))
  try {
    const appPath = app.getAppPath()
    dirs.push(path.resolve(appPath, '..', 'nexus'))
    dirs.push(path.resolve(appPath, '../..', 'nexus'))
    dirs.push(path.resolve(appPath, '../../../..', 'nexus'))
  } catch {}
  if (process.env.USERPROFILE) {
    dirs.push(
      path.resolve(
        process.env.USERPROFILE,
        'Documents',
        'antigravity',
        'Nexus Desktop',
        'nexus'
      )
    )
  }
  return Array.from(new Set(dirs))
}

export function registerInterviewLauncher(ipcMain: IpcMain): void {
  // 1. Launch Standalone HUD Executable or Dev Process
  ipcMain.handle('interview:launch-hud', async () => {
    try {
      const target = resolveCopilotLaunchTarget()

      // Primary: launch pre-built binary
      if (target.executablePath) {
        console.log('[InterviewLauncher] Spawning standalone copilot executable:', target.executablePath)
        const child = spawn(target.executablePath, [], {
          detached: true,
          stdio: 'ignore',
          windowsHide: false
        })
        child.unref()
        return { success: true, mode: 'executable', path: target.executablePath }
      }

      // Secondary: launch in dev process if source folder exists
      if (target.devDirPath && fs.existsSync(path.join(target.devDirPath, 'package.json'))) {
        console.log('[InterviewLauncher] Launching via npm run dev in:', target.devDirPath)
        const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
        const child = spawn(npmCmd, ['run', 'dev'], {
          cwd: target.devDirPath,
          detached: true,
          stdio: 'ignore',
          shell: true
        })
        child.unref()
        return { success: true, mode: 'dev-process', path: target.devDirPath }
      }

      return { success: false, error: 'Nexus Interview copilot directory not found' }
    } catch (err: any) {
      console.error('[InterviewLauncher] Failed to launch copilot:', err)
      return { success: false, error: err?.message || String(err) }
    }
  })

  // 2. Check Copilot Status
  ipcMain.handle('interview:check-status', async () => {
    const target = resolveCopilotLaunchTarget()

    return {
      available: Boolean(target.executablePath || target.devDirPath),
      hasPortable: Boolean(target.portablePath),
      hasUnpacked: Boolean(target.unpackedPath),
      portablePath: target.portablePath,
      unpackedPath: target.unpackedPath,
      directory: target.devDirPath
    }
  })

  // 3. Desktop Screen & Window Sources for Video/Screen-Share
  ipcMain.handle('interview:get-screen-sources', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: true
      })
      return {
        success: true,
        sources: sources.map((s) => ({
          id: s.id,
          name: s.name,
          thumbnail: s.thumbnail.toDataURL()
        }))
      }
    } catch (err: any) {
      console.error('[InterviewLauncher] Failed to get screen sources:', err)
      return { success: false, sources: [], error: err?.message || String(err) }
    }
  })

  // 4. Check if local interview daemon (port 8090) is running
  ipcMain.handle('interview:ensure-daemon', async () => {
    try {
      const isAlive = await new Promise<boolean>((resolve) => {
        const req = http.get('http://127.0.0.1:8090/health', (res) => {
          resolve(res.statusCode === 200)
        })
        req.on('error', () => resolve(false))
        req.setTimeout(800, () => {
          req.destroy()
          resolve(false)
        })
      })

      if (isAlive) {
        return { success: true, running: true, url: 'http://127.0.0.1:8090' }
      }

      // Check if a local server script genuinely exists before attempting to start
      const nexusDirs = getCandidateNexusDirs()
      const validServerDir = nexusDirs.find((d) => fs.existsSync(path.join(d, 'dist/server.js')))

      if (validServerDir) {
        const child = spawn(
          'node',
          ['-e', "import('./dist/server.js').then(m => m.startOrchestratorServer({ port: 8090 }))"],
          {
            cwd: validServerDir,
            detached: true,
            stdio: 'ignore',
            shell: true
          }
        )
        child.unref()
        await new Promise((r) => setTimeout(r, 1200))
        return { success: true, running: true, spawned: true, url: 'http://127.0.0.1:8090' }
      }

      return { success: true, running: false, url: 'http://127.0.0.1:8090' }
    } catch (err: any) {
      return { success: false, running: false, error: err?.message || String(err) }
    }
  })

  // 5. Fastest Solve through Daemon Route with graceful offline reporting
  ipcMain.handle(
    'interview:solve-daemon',
    async (_event, payload: { question: string; mode?: string; screenContext?: string }) => {
      const startTime = Date.now()
      try {
        const response = await fetch('http://127.0.0.1:8090/api/interview/solve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(6000)
        })

        if (!response.ok) {
          const errText = await response.text()
          return { success: false, error: `Daemon error (${response.status}): ${errText}`, isOffline: false }
        }

        const data = (await response.json()) as any
        return {
          success: true,
          answer: data.answer,
          latencyMs: data.latencyMs || Date.now() - startTime,
          mode: data.mode
        }
      } catch (err: any) {
        return {
          success: false,
          isOffline: true,
          error: err?.message || String(err),
          latencyMs: Date.now() - startTime
        }
      }
    }
  )
}

export default registerInterviewLauncher
