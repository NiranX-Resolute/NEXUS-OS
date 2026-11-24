import { describe, expect, it } from "bun:test"
import { db } from "../src/server/db"
import { getSystemStats } from "../src/server/routes/system"
import { handleIpcRoute } from "../src/server/routes/ipc"

describe("Nexus Bun Server & Database Verification", () => {
  it("initializes bun:sqlite with WAL mode", () => {
    const walRow = db.query("PRAGMA journal_mode;").get() as { journal_mode: string }
    expect(walRow.journal_mode.toLowerCase()).toBe("wal")
  })

  it("verifies persistent memories table has NiranX seed", () => {
    const mem = db.query("SELECT * FROM memories WHERE id = 'mem_profile_niranx'").get() as any
    expect(mem).toBeDefined()
    expect(mem.title).toContain("NiranX")
  })

  it("adds and reads chat sessions and messages", () => {
    const sessionId = `test_session_${Date.now()}`
    db.run(
      "INSERT INTO chat_sessions (id, title, model) VALUES (?, ?, ?)",
      [sessionId, "Test Verification Session", "gemini-2.5-flash"]
    )

    db.run(
      "INSERT INTO chat_messages (id, session_id, role, content) VALUES (?, ?, ?, ?)",
      [`msg_${Date.now()}`, sessionId, "user", "Hello Nexdune Bun"]
    )

    const session = db.query("SELECT * FROM chat_sessions WHERE id = ?").get(sessionId) as any
    expect(session.title).toBe("Test Verification Session")

    const messages = db.query("SELECT * FROM chat_messages WHERE session_id = ?").all(sessionId) as any[]
    expect(messages.length).toBe(1)
    expect(messages[0].content).toBe("Hello Nexdune Bun")
  })

  it("adds and reads notes in bun:sqlite", () => {
    const noteId = `note_test_${Date.now()}`
    db.run(
      "INSERT INTO notes (id, title, content, folder) VALUES (?, ?, ?, ?)",
      [noteId, "Bun Notes Test", "Testing local-first note persistence", "Testing"]
    )

    const note = db.query("SELECT * FROM notes WHERE id = ?").get(noteId) as any
    expect(note).toBeDefined()
    expect(note.title).toBe("Bun Notes Test")
  })

  it("collects hardware system telemetry", async () => {
    const stats = await getSystemStats()
    expect(stats.platform).toBeDefined()
    expect(stats.cpu.cores).toBeGreaterThan(0)
    expect(stats.memory.totalBytes).toBeGreaterThan(0)
    expect(stats.memory.usedPercent).toBeGreaterThanOrEqual(0)
  })

  it("handles IPC calls for exact UI compatibility", async () => {
    // 1. get-system-stats
    const sysReq = new Request("http://localhost/api/ipc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "get-system-stats" })
    })
    const sysRes = await handleIpcRoute(sysReq)
    const sysData = await sysRes.json()
    expect(sysData.memory).toBeDefined()
    expect(sysData.os).toBeDefined()

    // 2. get-app-version
    const verReq = new Request("http://localhost/api/ipc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "get-app-version" })
    })
    const verRes = await handleIpcRoute(verReq)
    const verData = await verRes.json()
    expect(verData).toContain("Bun")

    // 3. check-keys-exist
    const keyReq = new Request("http://localhost/api/ipc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "check-keys-exist" })
    })
    const keyRes = await handleIpcRoute(keyReq)
    const keyData = await keyRes.json()
    expect(keyData).toHaveProperty("gemini")
  })
})
