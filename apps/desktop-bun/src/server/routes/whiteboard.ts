import { db } from "../db"

export async function handleWhiteboardRoutes(req: Request, url: URL): Promise<Response | null> {
  // GET /api/whiteboard
  if (url.pathname === "/api/whiteboard" && req.method === "GET") {
    const docs = db.query("SELECT * FROM whiteboard_docs ORDER BY updated_at DESC").all()
    return Response.json({ success: true, docs })
  }

  // POST /api/whiteboard
  if (url.pathname === "/api/whiteboard" && req.method === "POST") {
    try {
      const { id, title = "Untitled Canvas", canvasJson = "{}", thumbnail = "" } = await req.json()
      const docId = id || `board_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`

      db.run(
        `INSERT INTO whiteboard_docs (id, title, canvas_json, thumbnail, updated_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           canvas_json = excluded.canvas_json,
           thumbnail = excluded.thumbnail,
           updated_at = CURRENT_TIMESTAMP`,
        [docId, title, typeof canvasJson === "string" ? canvasJson : JSON.stringify(canvasJson), thumbnail]
      )

      return Response.json({ success: true, id: docId })
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500 })
    }
  }

  // DELETE /api/whiteboard/:id
  if (url.pathname.startsWith("/api/whiteboard/") && req.method === "DELETE") {
    const id = url.pathname.replace("/api/whiteboard/", "")
    db.run("DELETE FROM whiteboard_docs WHERE id = ?", [id])
    return Response.json({ success: true, message: "Canvas deleted" })
  }

  return null
}
