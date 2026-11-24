import { db } from "../db"

export async function handleNotesRoutes(req: Request, url: URL): Promise<Response | null> {
  // GET /api/notes
  if (url.pathname === "/api/notes" && req.method === "GET") {
    const notes = db.query("SELECT * FROM notes ORDER BY updated_at DESC").all()
    return Response.json({ success: true, notes })
  }

  // POST /api/notes
  if (url.pathname === "/api/notes" && req.method === "POST") {
    try {
      const { id, title = "Untitled Note", content = "", tags = [], folder = "General" } = await req.json()
      const noteId = id || `note_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`

      db.run(
        `INSERT INTO notes (id, title, content, tags, folder, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           content = excluded.content,
           tags = excluded.tags,
           folder = excluded.folder,
           updated_at = CURRENT_TIMESTAMP`,
        [noteId, title, content, JSON.stringify(tags), folder]
      )

      return Response.json({ success: true, id: noteId, message: "Note saved" })
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500 })
    }
  }

  // DELETE /api/notes/:id
  if (url.pathname.startsWith("/api/notes/") && req.method === "DELETE") {
    const id = url.pathname.replace("/api/notes/", "")
    db.run("DELETE FROM notes WHERE id = ?", [id])
    return Response.json({ success: true, message: "Note deleted" })
  }

  return null
}
