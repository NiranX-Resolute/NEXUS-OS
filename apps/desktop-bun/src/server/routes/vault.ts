import { db } from "../db"
import { join } from "path"
import { homedir } from "os"
import { existsSync, readFileSync, writeFileSync } from "fs"

const VAULT_FILE = join(homedir(), ".nexus-agent", "nexus_secure_vault.json")

export function getDecryptedKey(keyName: string): string {
  // Check env first
  if (process.env[keyName]) return process.env[keyName]!
  if (process.env[keyName.toUpperCase()]) return process.env[keyName.toUpperCase()]!

  // Check vault file
  if (existsSync(VAULT_FILE)) {
    try {
      const data = JSON.parse(readFileSync(VAULT_FILE, "utf8"))
      if (data[keyName]) {
        // Base64 decode
        try {
          return Buffer.from(data[keyName], "base64").toString("utf8")
        } catch {
          return data[keyName]
        }
      }
    } catch {}
  }

  // Check SQLite
  const row = db.query("SELECT encrypted_value FROM vault_secrets WHERE key = ?").get(keyName) as { encrypted_value: string } | null
  if (row?.encrypted_value) {
    try {
      return Buffer.from(row.encrypted_value, "base64").toString("utf8")
    } catch {
      return row.encrypted_value
    }
  }

  return ""
}

export function setEncryptedKey(keyName: string, value: string) {
  const enc = Buffer.from(value, "utf8").toString("base64")

  // Update SQLite
  db.run(
    "INSERT INTO vault_secrets (key, encrypted_value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET encrypted_value = excluded.encrypted_value, updated_at = CURRENT_TIMESTAMP",
    [keyName, enc]
  )

  // Update vault file
  let existing: Record<string, string> = {}
  if (existsSync(VAULT_FILE)) {
    try {
      existing = JSON.parse(readFileSync(VAULT_FILE, "utf8"))
    } catch {}
  }
  existing[keyName] = enc
  writeFileSync(VAULT_FILE, JSON.stringify(existing, null, 2), "utf8")
}

export async function handleVaultRoutes(req: Request, url: URL): Promise<Response | null> {
  // GET /api/vault
  if (url.pathname === "/api/vault" && req.method === "GET") {
    const keys = ["gemini", "groq", "openai", "puter", "anthropic", "deepseek", "ollama_host"]
    const status: Record<string, { configured: boolean; preview: string }> = {}

    for (const k of keys) {
      const val = getDecryptedKey(k)
      status[k] = {
        configured: !!val,
        preview: val ? `${val.slice(0, 4)}...${val.slice(-4)}` : ""
      }
    }

    return Response.json({ success: true, keys: status })
  }

  // POST /api/vault
  if (url.pathname === "/api/vault" && req.method === "POST") {
    try {
      const body = await req.json()
      for (const [k, v] of Object.entries(body)) {
        if (typeof v === "string" && v.trim()) {
          setEncryptedKey(k, v.trim())
        }
      }
      return Response.json({ success: true, message: "Vault keys securely stored" })
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500 })
    }
  }

  return null
}
