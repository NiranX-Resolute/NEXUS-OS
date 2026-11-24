import { Database } from "bun:sqlite"
import { join } from "path"
import { homedir } from "os"
import { existsSync, mkdirSync } from "fs"

// Local-first sovereign database path
const NEXUS_DIR = join(homedir(), ".nexus-agent")
if (!existsSync(NEXUS_DIR)) {
  mkdirSync(NEXUS_DIR, { recursive: true })
}

const DB_PATH = join(NEXUS_DIR, "nexus_bun.sqlite")
export const db = new Database(DB_PATH)

// Enforce WAL mode for multi-threaded performance and zero latency
db.run("PRAGMA journal_mode = WAL;")
db.run("PRAGMA synchronous = NORMAL;")
db.run("PRAGMA foreign_keys = ON;")

// Initialize Schema
export function initDatabase() {
  db.run(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      tags TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      model TEXT DEFAULT 'gemini-2.5-flash',
      system_prompt TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tokens INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
    );
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT DEFAULT '[]',
      folder TEXT DEFAULT 'General',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS vault_secrets (
      key TEXT PRIMARY KEY,
      encrypted_value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS whiteboard_docs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      canvas_json TEXT NOT NULL,
      thumbnail TEXT DEFAULT '',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS telemetry_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      cpu_percent REAL,
      memory_used_mb REAL,
      memory_total_mb REAL,
      battery_percent REAL
    );
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS agent_tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      prompt TEXT NOT NULL,
      result TEXT DEFAULT '',
      steps_json TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    );
  `)

  // Seed core memory profile for NiranX if empty
  const countRow = db.query("SELECT COUNT(*) as count FROM memories").get() as { count: number }
  if (countRow.count === 0) {
    seedDefaultMemories()
  }
}

function seedDefaultMemories() {
  const seeds = [
    {
      id: "mem_profile_niranx",
      title: "NiranX Core Profile & Architecture",
      content: "NiranX (Niranjan Barhate). Systems Architect and Creator of the sovereign Nexus OS / Nexus Desktop ecosystem. 100% free-tier, zero-subscription, sovereign edge-to-desktop computing. Values AI continuity, dark cyber HUD aesthetics, production-ready code with no placeholders.",
      category: "profile",
      tags: JSON.stringify(["niranx", "identity", "systems-architect", "nexus-os"])
    },
    {
      id: "mem_identity_nexdune",
      title: "Nexdune Agent Identity",
      content: "Nexdune: NiranX's dedicated personal AI agent, powered by Antigravity. Proactive, sharp, empathetic, direct partner in systems architecture and engineering.",
      category: "agent",
      tags: JSON.stringify(["nexdune", "partner", "agent-core"])
    },
    {
      id: "mem_bun_architecture",
      title: "Nexus Bun Sovereign Architecture",
      content: "High-performance Bun.js runtime utilizing native Bun.serve() HTTP & WebSockets, bun:sqlite in-memory WAL pool, zero-friction IPC bridge, and standalone desktop app mode.",
      category: "architecture",
      tags: JSON.stringify(["bun", "bun-sqlite", "performance", "desktop-workstation"])
    }
  ]

  const insert = db.prepare(`
    INSERT INTO memories (id, title, content, category, tags, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `)

  for (const s of seeds) {
    insert.run(s.id, s.title, s.content, s.category, s.tags)
  }
}

// Initialize on module load
initDatabase()
