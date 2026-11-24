import React, { useState, useEffect } from "react"
import { User, Brain, Shield, Plus, Trash2, CheckCircle2, Bookmark } from "lucide-react"

interface Memory {
  id: string
  title: string
  content: string
  category: string
  tags: string
  updated_at: string
}

export const ProfileView: React.FC = () => {
  const [memories, setMemories] = useState<Memory[]>([])
  const [globalContent, setGlobalContent] = useState("")
  const [newTitle, setNewTitle] = useState("")
  const [newContent, setNewContent] = useState("")
  const [newCategory, setNewCategory] = useState("preference")
  const [isSaving, setIsSaving] = useState(false)

  const loadMemories = async () => {
    try {
      const res = await fetch("/api/memory")
      const data = await res.json()
      if (data.success) {
        setMemories(data.memories || [])
        setGlobalContent(data.globalMemoryContent || "")
      }
    } catch {}
  }

  useEffect(() => {
    loadMemories()
  }, [])

  const addMemory = async () => {
    if (!newTitle.trim() || !newContent.trim()) return
    setIsSaving(true)
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          content: newContent.trim(),
          category: newCategory,
          tags: [newCategory, "bun-workstation"]
        })
      })
      const data = await res.json()
      if (data.success) {
        setNewTitle("")
        setNewContent("")
        loadMemories()
      }
    } catch {}
    finally {
      setIsSaving(false)
    }
  }

  const deleteMemory = async (id: string) => {
    try {
      await fetch(`/api/memory/${id}`, { method: "DELETE" })
      setMemories((prev) => prev.filter((m) => m.id !== id))
    } catch {}
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", height: "100%", overflowY: "auto", paddingRight: "8px" }}>
      {/* Identity Card */}
      <div className="glass-panel" style={{ padding: "24px", display: "flex", alignItems: "center", gap: "20px" }}>
        <div
          style={{
            width: "64px",
            height: "64px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, rgba(16,185,129,0.3) 0%, rgba(6,182,212,0.3) 100%)",
            border: "2px solid #10b981",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0
          }}
        >
          <User size={32} color="#10b981" />
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: "700", color: "#fff" }}>NiranX (Niranjan Barhate)</h2>
            <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "10px", background: "rgba(16,185,129,0.15)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)" }}>
              Systems Architect
            </span>
          </div>
          <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
            Creator of the Sovereign Nexus OS & Nexus Desktop Ecosystem • 100% Free-Tier Zero-Subscription Architect
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#10b981" }}>
            <Shield size={14} />
            <span>DPAPI & SQLite Vault Enforced</span>
          </div>
          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            Bun Memory Pool: {memories.length} Active Records
          </span>
        </div>
      </div>

      {/* Memory Form & Logs Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        {/* Memory Injection Form */}
        <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "700", fontSize: "14px" }}>
            <Brain size={18} color="#a855f7" />
            <span>COMMIT NEW MEMORY TO SOVEREIGN POOL</span>
          </div>

          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Memory Title / Concept (e.g. Dark Mode HUD Preference)..."
            style={{
              background: "rgba(0,0,0,0.5)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "6px",
              padding: "10px 14px",
              color: "#fff",
              fontSize: "13px",
              outline: "none"
            }}
          />

          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            style={{
              background: "rgba(0,0,0,0.5)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "6px",
              padding: "8px 12px",
              color: "#10b981",
              fontSize: "12px",
              outline: "none"
            }}
          >
            <option value="preference">User Preference</option>
            <option value="profile">Profile & Identity</option>
            <option value="architecture">System Architecture</option>
            <option value="sentiment">Feeling / Sentiment</option>
            <option value="general">General Memory</option>
          </select>

          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Memory details to remember permanently across sessions..."
            rows={4}
            style={{
              background: "rgba(0,0,0,0.5)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "6px",
              padding: "12px",
              color: "#fff",
              fontSize: "13px",
              outline: "none",
              resize: "none"
            }}
          />

          <button
            onClick={addMemory}
            disabled={isSaving || !newTitle.trim() || !newContent.trim()}
            className="cyber-btn cyber-btn-primary"
            style={{ alignSelf: "flex-end" }}
          >
            <Plus size={16} />
            <span>Store Memory</span>
          </button>
        </div>

        {/* Persistent Memory Pool in bun:sqlite */}
        <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: "700", fontSize: "14px" }}>ACTIVE NEXDUNE MEMORIES</span>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>bun:sqlite store</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto", maxHeight: "320px" }}>
            {memories.map((m) => (
              <div
                key={m.id}
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "8px",
                  padding: "12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: "600", fontSize: "13px", color: "#10b981" }}>{m.title}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "6px", background: "rgba(255,255,255,0.06)", color: "var(--text-muted)" }}>
                      {m.category}
                    </span>
                    <button
                      onClick={() => deleteMemory(m.id)}
                      style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: "12px", color: "#d4d4d8", lineHeight: "1.5" }}>{m.content}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
