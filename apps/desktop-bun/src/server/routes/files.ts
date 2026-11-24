import { existsSync, readdirSync, statSync, mkdirSync } from "fs"
import { join, resolve, dirname } from "path"

export async function handleFileRoutes(req: Request, url: URL): Promise<Response | null> {
  // GET /api/files/list?path=...
  if (url.pathname === "/api/files/list" && req.method === "GET") {
    try {
      const targetPath = url.searchParams.get("path") || process.cwd()
      const resolved = resolve(targetPath)

      if (!existsSync(resolved)) {
        return Response.json({ success: false, error: "Path does not exist" }, { status: 404 })
      }

      const entries = readdirSync(resolved, { withFileTypes: true }).map((ent) => {
        const full = join(resolved, ent.name)
        let size = 0
        let mtime = 0
        try {
          const st = statSync(full)
          size = st.size
          mtime = st.mtimeMs
        } catch {}

        return {
          name: ent.name,
          path: full,
          isDirectory: ent.isDirectory(),
          size,
          mtime
        }
      })

      return Response.json({
        success: true,
        currentPath: resolved,
        parentPath: dirname(resolved),
        entries
      })
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500 })
    }
  }

  // GET /api/files/read?path=...
  if (url.pathname === "/api/files/read" && req.method === "GET") {
    try {
      const filePath = url.searchParams.get("path")
      if (!filePath) {
        return Response.json({ success: false, error: "path required" }, { status: 400 })
      }

      const file = Bun.file(filePath)
      const exists = await file.exists()
      if (!exists) {
        return Response.json({ success: false, error: "File not found" }, { status: 404 })
      }

      const text = await file.text()
      return Response.json({
        success: true,
        path: filePath,
        content: text,
        size: file.size,
        type: file.type
      })
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500 })
    }
  }

  // POST /api/files/write
  if (url.pathname === "/api/files/write" && req.method === "POST") {
    try {
      const { path: filePath, content } = await req.json()
      if (!filePath || content === undefined) {
        return Response.json({ success: false, error: "path and content required" }, { status: 400 })
      }

      const dir = dirname(filePath)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }

      // High-speed atomic write via Bun.write
      const bytesWritten = await Bun.write(filePath, content)

      return Response.json({
        success: true,
        path: filePath,
        bytesWritten,
        message: "File written successfully"
      })
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500 })
    }
  }

  return null
}
