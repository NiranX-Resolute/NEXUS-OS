import { db } from "../db"
import { join } from "path"
import { homedir } from "os"
import { existsSync, appendFileSync, readFileSync } from "fs"

const USER_MEMORY_GLOBAL = "C:\\Users\\NiranX\\.gemini\\config\\USER_MEMORY.md"

export async function handleMemoryRoutes(req: Request, url: URL): Promise<Response | null> {
  // GET /api/memory
  if (url.pathname === "/api/memory" && req.method === "GET") {
    const memories = db.query("SELECT * FROM memories ORDER BY updated_at DESC").all()
    let globalMemoryContent = ""
    if (existsSync(USER_MEMORY_GLOBAL)) {
      try {
        globalMemoryContent = readFileSync(USER_MEMORY_GLOBAL, "utf8")
      } catch {}
    }
    return Response.json({
      success: true,
      memories,
      globalMemoryContent
    })
  }

  // POST /api/memory
  if (url.pathname === "/api/memory" && req.method === "POST") {
    try {
      const body = await req.json()
      const { title, content, category = "general", tags = [] } = body

      if (!title || !content) {
        return Response.json({ success: false, error: "Title and content required" }, { status: 400 })
      }

      const id = `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
      db.run(
        `INSERT INTO memories (id, title, content, category, tags, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [id, title, content, category, JSON.stringify(tags)]
      )

      // Auto-capture to USER_MEMORY.md if relevant
      if (existsSync(USER_MEMORY_GLOBAL) && (category === "profile" || category === "preference")) {
        const entry = `\n- **[${new Date().toISOString().split("T")[0]}]** ${title}: ${content}\n`
        appendFileSync(USER_MEMORY_GLOBAL, entry, "utf8")
      }

      return Response.json({ success: true, id, message: "Memory committed to sovereign store" })
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500 })
    }
  }

  // DELETE /api/memory/:id
  if (url.pathname.startsWith("/api/memory/") && req.method === "DELETE") {
    const id = url.pathname.replace("/api/memory/", "")
    db.run("DELETE FROM memories WHERE id = ?", [id])
    return Response.json({ success: true, message: "Memory forgotten" })
  }

  // POST /api/memory/search
  if (url.pathname === "/api/memory/search" && req.method === "POST") {
    try {
      const { query } = await req.json()
      if (!query) return Response.json({ success: true, results: [] })

      const term = `%${query.toLowerCase()}%`
      const results = db.query(
        `SELECT * FROM memories 
         WHERE LOWER(title) LIKE ? OR LOWER(content) LIKE ? OR LOWER(tags) LIKE ?
         ORDER BY updated_at DESC LIMIT 20`
      ).all(term, term, term)

      return Response.json({ success: true, results })
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500 })
    }
  }

  return null
}
