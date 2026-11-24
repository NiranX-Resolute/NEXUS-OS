import { handleSystemRoutes } from "./routes/system"
import { handleMemoryRoutes } from "./routes/memory"
import { handleVaultRoutes } from "./routes/vault"
import { handleAiRoutes } from "./routes/ai"
import { handleChatRoutes } from "./routes/chat"
import { handleFileRoutes } from "./routes/files"
import { handleTerminalRoutes } from "./routes/terminal"
import { handleNotesRoutes } from "./routes/notes"
import { handleWhiteboardRoutes } from "./routes/whiteboard"
import { handleAgenticRoutes } from "./routes/agentic"
import { handleIpcRoute } from "./routes/ipc"
import { websocketHandler } from "./ws/index"
import { launchDesktopWindow } from "./desktop"
import { join, dirname } from "path"
import { existsSync } from "fs"

const PORT = parseInt(process.env.PORT || "3000", 10)

function findDistDir(): string {
  const candidates = [
    join(dirname(process.execPath), "dist"),
    dirname(process.execPath),
    join(import.meta.dir, "../../dist"),
    join(process.cwd(), "dist"),
    join(process.cwd(), "apps/desktop-bun/dist")
  ]
  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) return c
  }
  return join(import.meta.dir, "../../dist")
}

const DIST_DIR = findDistDir()
const isDesktopMode = process.argv.includes("--desktop") || !process.argv.includes("--headless")

const server = Bun.serve({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url)

    // WebSocket Upgrade
    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req)
      if (upgraded) return undefined
      return new Response("WebSocket upgrade failed", { status: 400 })
    }

    // CORS Preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        }
      })
    }

    // API Routes Routing Table
    let res: Response | null = null

    if (url.pathname.startsWith("/api/system")) {
      res = await handleSystemRoutes(req, url)
    } else if (url.pathname.startsWith("/api/memory")) {
      res = await handleMemoryRoutes(req, url)
    } else if (url.pathname.startsWith("/api/vault")) {
      res = await handleVaultRoutes(req, url)
    } else if (url.pathname.startsWith("/api/ai")) {
      res = await handleAiRoutes(req, url)
    } else if (url.pathname.startsWith("/api/chat")) {
      res = await handleChatRoutes(req, url)
    } else if (url.pathname.startsWith("/api/files")) {
      res = await handleFileRoutes(req, url)
    } else if (url.pathname.startsWith("/api/terminal")) {
      res = await handleTerminalRoutes(req, url)
    } else if (url.pathname.startsWith("/api/notes")) {
      res = await handleNotesRoutes(req, url)
    } else if (url.pathname.startsWith("/api/whiteboard")) {
      res = await handleWhiteboardRoutes(req, url)
    } else if (url.pathname.startsWith("/api/agentic")) {
      res = await handleAgenticRoutes(req, url)
    } else if (url.pathname === "/api/ipc" && req.method === "POST") {
      res = await handleIpcRoute(req)
    }

    if (res) {
      // Add CORS headers
      res.headers.set("Access-Control-Allow-Origin", "*")
      return res
    }

    // Static Asset Serving via Bun.file()
    let filePath = join(DIST_DIR, url.pathname === "/" ? "index.html" : url.pathname)
    let file = Bun.file(filePath)

    if (!(await file.exists())) {
      // SPA fallback to index.html
      filePath = join(DIST_DIR, "index.html")
      file = Bun.file(filePath)
    }

    if (await file.exists()) {
      return new Response(file)
    }

    return new Response("Nexus Bun Server Online. Run 'bun run build' to generate frontend assets.", {
      headers: { "Content-Type": "text/plain" }
    })
  },
  websocket: websocketHandler
})

const serverUrl = `http://localhost:${server.port}`
console.log(`\n⚡ Nexus Bun Sovereign Workstation running at: ${serverUrl}`)
console.log(`🧠 SQLite Database: ~/.nexus-agent/nexus_bun.sqlite`)
console.log(`🚀 Mode: ${isDesktopMode ? "Desktop Native HUD" : "Headless / Web Host"}\n`)

if (isDesktopMode) {
  setTimeout(() => launchDesktopWindow(serverUrl), 600)
}
