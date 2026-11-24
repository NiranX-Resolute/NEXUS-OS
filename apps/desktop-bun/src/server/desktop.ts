import { join } from "path"
import { homedir } from "os"
import { existsSync } from "fs"

export function launchDesktopWindow(url: string) {
  if (process.platform !== "win32") {
    // Linux/macOS fallback
    Bun.spawn(["open", url]).catch(() => {})
    return
  }

  // Windows Edge WebView2 / Edge App Mode
  const edgePaths = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Users\\" + process.env.USERNAME + "\\AppData\\Local\\Microsoft\\Edge\\Application\\msedge.exe"
  ]

  let edgeExe = ""
  for (const p of edgePaths) {
    if (existsSync(p)) {
      edgeExe = p
      break
    }
  }

  if (!edgeExe) {
    // Fallback to start
    Bun.spawn(["cmd.exe", "/c", "start", url])
    return
  }

  const userDataDir = join(homedir(), ".nexus-agent", "edge_desktop_profile")

  console.log(`[Nexus Desktop Launcher] Spawning sovereign Edge App Mode -> ${url}`)
  Bun.spawn([
    edgeExe,
    `--app=${url}`,
    `--window-size=1440,900`,
    `--user-data-dir=${userDataDir}`,
    `--disable-features=TranslateUI`,
    `--app-id=nexus-ai-bun`
  ], {
    detached: true,
    stdio: ["ignore", "ignore", "ignore"]
  })
}
