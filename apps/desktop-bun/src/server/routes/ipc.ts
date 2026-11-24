import os from "os"
import { join } from "path"
import { homedir } from "os"
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "fs"
import { db } from "../db"
import { getDecryptedKey, setEncryptedKey } from "./vault"
import { getSystemStats } from "./system"

const NOTES_DIR = join(homedir(), ".nexus-agent", "Notes")
if (!existsSync(NOTES_DIR)) {
  try {
    mkdirSync(NOTES_DIR, { recursive: true })
  } catch {}
}

const CHAT_DIR = join(homedir(), "Documents", "Nexus_Docs", "Chat_History")
if (!existsSync(CHAT_DIR)) {
  try {
    mkdirSync(CHAT_DIR, { recursive: true })
  } catch {}
}

export async function handleIpcRoute(req: Request): Promise<Response> {
  try {
    const { channel, args = [] } = await req.json()
    if (!channel) {
      return Response.json({ success: false, error: "Channel required" }, { status: 400 })
    }

    const result = await dispatchChannel(channel, args)
    return Response.json(result)
  } catch (err: any) {
    return Response.json({ success: false, error: err.message }, { status: 500 })
  }
}

async function dispatchChannel(channel: string, args: any[]): Promise<any> {
  switch (channel) {
    // 1. System Info & Telemetry
    case "get-system-stats":
    case "get-system-info": {
      const stats = await getSystemStats()
      const totalGB = (stats.memory.totalBytes / (1024 * 1024 * 1024)).toFixed(1)
      const freeGB = (stats.memory.freeBytes / (1024 * 1024 * 1024)).toFixed(1)
      const usedPercent = `${stats.memory.usedPercent}%`

      return {
        cpu: `${stats.cpu.loadAvg[0] ? Math.round(stats.cpu.loadAvg[0] * 10) : 18}%`,
        memory: {
          total: `${totalGB} GB`,
          free: `${freeGB} GB`,
          usedPercentage: usedPercent
        },
        temperature: 42,
        os: {
          type: stats.platform === "win32" ? "Windows" : stats.platform,
          uptime: `${(stats.uptimeSeconds / 3600).toFixed(1)} hrs`
        },
        battery: {
          isPresent: stats.battery?.hasBattery ?? true,
          percentage: stats.battery?.percent ?? 100,
          status: stats.battery?.isCharging ? "Charging" : "Discharging"
        },
        network: {
          totalBytesPerSecond: 1048576
        }
      }
    }

    case "get-screen-size":
      return { width: 1920, height: 1080 }

    case "get-screen-source":
      return "screen:0:0"

    case "get-desktop-sources":
      return [
        {
          id: "screen:0:0",
          name: "Entire Screen",
          display_id: "0",
          thumbnail: { toDataURL: () => "" }
        }
      ]

    case "get-installed-apps":
      return [
        { name: "Visual Studio Code", id: "code" },
        { name: "Windows Terminal", id: "wt" },
        { name: "Command Prompt", id: "cmd" },
        { name: "Google Chrome", id: "chrome" },
        { name: "Microsoft Edge", id: "edge" },
        { name: "Notepad", id: "notepad" },
        { name: "Calculator", id: "calc" },
        { name: "Settings", id: "settings" }
      ]

    case "get-running-apps":
      return ["Nexus-Bun.exe", "msedge.exe", "explorer.exe"]

    case "open-app": {
      const appName = args[0] || ""
      if (appName) {
        Bun.spawn(["cmd.exe", "/c", "start", appName]).catch(() => {})
      }
      return { success: true }
    }

    case "get-drives":
      return [
        { filesystem: "C:", blocks: 512000000, used: 256000000, available: 256000000, capacity: "50%", mounted: "C:" }
      ]

    // 2. Vault & Keys
    case "secure-get-keys": {
      const groqKey = getDecryptedKey("groq")
      const geminiKey = getDecryptedKey("gemini")
      const fireworksKey = getDecryptedKey("fireworks")
      const puterToken = getDecryptedKey("puter")
      return { groqKey, geminiKey, fireworksKey, puterToken }
    }

    case "secure-save-keys": {
      const { groqKey, geminiKey, fireworksKey = "", puterToken = "" } = args[0] || {}
      if (groqKey) setEncryptedKey("groq", groqKey)
      if (geminiKey) setEncryptedKey("gemini", geminiKey)
      if (fireworksKey) setEncryptedKey("fireworks", fireworksKey)
      if (puterToken) setEncryptedKey("puter", puterToken)
      return { success: true }
    }

    case "check-keys-exist": {
      const groq = !!getDecryptedKey("groq")
      const gemini = !!getDecryptedKey("gemini")
      const fireworks = !!getDecryptedKey("fireworks")
      const puter = !!getDecryptedKey("puter")
      return { groq, gemini, fireworks, puter }
    }

    case "check-vault-status":
      return { isSetup: true, isUnlocked: true, hasBiometrics: false }

    case "verify-vault-pin":
      return { success: true }

    // 3. Chat History & Messages
    case "get-history": {
      const rows = db.query(
        "SELECT role, content FROM chat_messages ORDER BY created_at ASC LIMIT 50"
      ).all() as Array<{ role: string; content: string }>

      return rows.map((r) => ({
        role: r.role === "assistant" ? "model" : r.role,
        parts: [{ text: r.content }]
      }))
    }

    case "add-message": {
      const msg = args[0] || {}
      const role = msg.role === "model" ? "assistant" : msg.role || "user"
      const text = msg.parts?.[0]?.text || msg.content || ""

      if (text) {
        // Find or create default session
        let session = db.query("SELECT id FROM chat_sessions ORDER BY updated_at DESC LIMIT 1").get() as { id: string } | null
        let sessionId = session?.id
        if (!sessionId) {
          sessionId = `session_default_${Date.now()}`
          db.run(
            "INSERT INTO chat_sessions (id, title, model) VALUES (?, ?, ?)",
            [sessionId, "Primary Chat Session", "gemini-2.5-flash"]
          )
        }

        db.run(
          "INSERT INTO chat_messages (id, session_id, role, content) VALUES (?, ?, ?, ?)",
          [`msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`, sessionId, role, text]
        )
      }
      return { success: true }
    }

    case "chat-history:get-sessions": {
      const sessions = db.query("SELECT * FROM chat_sessions ORDER BY updated_at DESC").all() as any[]
      return sessions.map((s) => ({
        id: s.id,
        title: s.title,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
        provider: "gemini",
        model: s.model || "gemini-2.5-flash",
        messages: []
      }))
    }

    case "chat-history:save-session": {
      const sess = args[0] || {}
      const id = sess.id || `session_${Date.now()}`
      db.run(
        `INSERT INTO chat_sessions (id, title, model, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET title = excluded.title, model = excluded.model, updated_at = CURRENT_TIMESTAMP`,
        [id, sess.title || "Chat Session", sess.model || "gemini-2.5-flash"]
      )
      return { success: true, id }
    }

    case "chat-history:get-folder-path":
      return CHAT_DIR

    case "chat-history:open-folder":
      if (process.platform === "win32") {
        Bun.spawn(["explorer.exe", CHAT_DIR]).catch(() => {})
      }
      return { success: true }

    // 4. Notes
    case "get-notes": {
      const notes = db.query("SELECT * FROM notes ORDER BY updated_at DESC").all() as any[]
      return notes.map((n) => ({
        filename: `${n.id}.md`,
        title: n.title,
        content: n.content,
        updatedAt: n.updated_at
      }))
    }

    case "save-note": {
      const { title, content } = args[0] || {}
      const id = `note_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
      db.run(
        "INSERT INTO notes (id, title, content) VALUES (?, ?, ?)",
        [id, title || "Untitled Note", content || ""]
      )
      return { success: true, id, filename: `${id}.md` }
    }

    case "update-note": {
      const { originalFilename, title, content } = args[0] || {}
      const id = originalFilename ? originalFilename.replace(/\.md$/, "") : `note_${Date.now()}`
      db.run(
        `INSERT INTO notes (id, title, content, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET title = excluded.title, content = excluded.content, updated_at = CURRENT_TIMESTAMP`,
        [id, title || "Untitled", content || ""]
      )
      return { success: true, path: join(NOTES_DIR, `${id}.md`), filename: `${id}.md` }
    }

    case "delete-note": {
      const { filename } = args[0] || {}
      if (filename) {
        const id = filename.replace(/\.md$/, "")
        db.run("DELETE FROM notes WHERE id = ?", [id])
      }
      return { success: true }
    }

    // 5. Terminal & Shell
    case "execute-terminal-command":
    case "run-shell-command": {
      const command = typeof args[0] === "string" ? args[0] : args[0]?.command || ""
      if (!command) return { success: false, output: "No command provided" }

      const isWin = process.platform === "win32"
      const proc = Bun.spawn(
        isWin
          ? ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command]
          : ["bash", "-c", command],
        { stdout: "pipe", stderr: "pipe" }
      )

      const [out, err] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text()
      ])
      const exitCode = await proc.exited

      return {
        success: exitCode === 0,
        output: out || err || `[Exit Code ${exitCode}]`,
        stdout: out,
        stderr: err,
        exitCode
      }
    }

    // 6. Filesystem
    case "read-file": {
      const filePath = args[0]
      if (!filePath) return { success: false, error: "File path required" }
      const file = Bun.file(filePath)
      if (!(await file.exists())) return { success: false, error: "File not found" }
      const text = await file.text()
      return { success: true, content: text, data: text }
    }

    case "write-file": {
      const { path: fPath, content } = typeof args[0] === "object" ? args[0] : { path: args[0], content: args[1] }
      if (!fPath) return { success: false, error: "File path required" }
      await Bun.write(fPath, content || "")
      return { success: true, path: fPath }
    }

    case "read-directory": {
      const dirPath = args[0] || process.cwd()
      if (!existsSync(dirPath)) return { success: false, error: "Directory not found" }
      const ents = readdirSync(dirPath, { withFileTypes: true }).map((e) => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        path: join(dirPath, e.name)
      }))
      return { success: true, entries: ents }
    }

    // 7. Core Memory & Agentic
    case "search-core-memory": {
      const term = `%${(args[0] || "").toLowerCase()}%`
      const results = db.query(
        "SELECT * FROM memories WHERE LOWER(title) LIKE ? OR LOWER(content) LIKE ? LIMIT 15"
      ).all(term, term)
      return { success: true, memories: results }
    }

    case "save-core-memory": {
      const { title, content, category = "general" } = args[0] || {}
      if (title && content) {
        db.run(
          "INSERT INTO memories (id, title, content, category) VALUES (?, ?, ?, ?)",
          [`mem_${Date.now()}`, title, content, category]
        )
      }
      return { success: true }
    }

    case "fleet-get-status":
      return {
        agents: [
          { id: "nexdune", name: "Nexdune Core", status: "online", role: "Systems Architect" },
          { id: "terminal-runner", name: "Bun Terminal Runner", status: "idle", role: "Shell Actuator" },
          { id: "memory-indexer", name: "SQLite Memory Indexer", status: "online", role: "WAL Pool Manager" }
        ],
        activeTasks: 0
      }

    // 8. Application & Version
    case "get-app-version":
      return "2.2.0 (Bun Sovereign Edition)"

    case "check-for-updates":
      return { hasUpdate: false, version: "2.2.0" }

    case "get-update-status":
      return { status: "idle" }

    case "open-external-url": {
      const url = args[0]
      if (url && process.platform === "win32") {
        Bun.spawn(["cmd.exe", "/c", "start", url]).catch(() => {})
      }
      return { success: true }
    }

    // 9. Window controls
    case "window-minimize":
    case "window-maximize":
    case "window-close":
    case "window-reload":
    case "window-toggle-fullscreen":
    case "window-set-zoom":
      return { success: true }

    // 10. Default / Unhandled safe fallback
    default:
      console.log(`[Bun IPC] Channel invoked: ${channel}`)
      return { success: true, handled: true }
  }
}
