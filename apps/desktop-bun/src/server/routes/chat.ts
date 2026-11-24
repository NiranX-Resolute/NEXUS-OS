import { db } from "../db"
import { join } from "path"
import { homedir } from "os"
import { existsSync, mkdirSync, writeFileSync } from "fs"

const EXPORT_DIR = join(homedir(), "Documents", "Nexus_Docs", "Chat_History")
if (!existsSync(EXPORT_DIR)) {
  try {
    mkdirSync(EXPORT_DIR, { recursive: true })
  } catch {}
}

export async function handleChatRoutes(req: Request, url: URL): Promise<Response | null> {
  // GET /api/chat/sessions
  if (url.pathname === "/api/chat/sessions" && req.method === "GET") {
    const sessions = db.query(
      "SELECT * FROM chat_sessions ORDER BY updated_at DESC"
    ).all()
    return Response.json({ success: true, sessions })
  }

  // POST /api/chat/sessions
  if (url.pathname === "/api/chat/sessions" && req.method === "POST") {
    try {
      const { title = "New Chat", model = "gemini-2.5-flash", systemPrompt = "" } = await req.json()
      const id = `session_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
      db.run(
        `INSERT INTO chat_sessions (id, title, model, system_prompt, created_at, updated_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [id, title, model, systemPrompt]
      )
      return Response.json({ success: true, id, title })
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500 })
    }
  }

  // DELETE /api/chat/sessions/:id
  if (url.pathname.startsWith("/api/chat/sessions/") && req.method === "DELETE") {
    const id = url.pathname.replace("/api/chat/sessions/", "")
    db.run("DELETE FROM chat_messages WHERE session_id = ?", [id])
    db.run("DELETE FROM chat_sessions WHERE id = ?", [id])
    return Response.json({ success: true, message: "Session deleted" })
  }

  // GET /api/chat/messages?sessionId=...
  if (url.pathname === "/api/chat/messages" && req.method === "GET") {
    const sessionId = url.searchParams.get("sessionId")
    if (!sessionId) {
      return Response.json({ success: false, error: "sessionId required" }, { status: 400 })
    }
    const messages = db.query(
      "SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC"
    ).all(sessionId)
    return Response.json({ success: true, messages })
  }

  // POST /api/chat/messages
  if (url.pathname === "/api/chat/messages" && req.method === "POST") {
    try {
      const { sessionId, role, content } = await req.json()
      if (!sessionId || !role || !content) {
        return Response.json({ success: false, error: "Missing fields" }, { status: 400 })
      }
      const id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
      db.run(
        `INSERT INTO chat_messages (id, session_id, role, content, created_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [id, sessionId, role, content]
      )
      db.run(
        "UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [sessionId]
      )
      return Response.json({ success: true, id })
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500 })
    }
  }

  // POST /api/chat/export
  if (url.pathname === "/api/chat/export" && req.method === "POST") {
    try {
      const { sessionId } = await req.json()
      const session = db.query("SELECT * FROM chat_sessions WHERE id = ?").get(sessionId) as any
      if (!session) {
        return Response.json({ success: false, error: "Session not found" }, { status: 404 })
      }
      const messages = db.query("SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC").all(sessionId) as any[]

      let md = `# Nexus Chat History: ${session.title}\n`
      md += `*Exported on ${new Date().toLocaleString()}*\n\n---\n\n`

      for (const m of messages) {
        md += `### ${m.role === "user" ? "👤 User (NiranX)" : "🤖 Nexdune"}\n\n`
        md += `${m.content}\n\n---\n\n`
      }

      const filename = `Chat_${session.title.replace(/[^a-zA-Z0-9_-]/g, "_")}_${Date.now()}.md`
      const fullPath = join(EXPORT_DIR, filename)
      writeFileSync(fullPath, md, "utf8")

      return Response.json({
        success: true,
        path: fullPath,
        filename,
        message: `Saved to ${fullPath}`
      })
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500 })
    }
  }

  return null
}
