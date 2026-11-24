import React, { useState, useEffect } from "react"
import { Settings as SettingsIcon, Key, Server, Shield, Check, Save } from "lucide-react"

export const SettingsView: React.FC = () => {
  const [vaultStatus, setVaultStatus] = useState<Record<string, any>>({})
  const [geminiKey, setGeminiKey] = useState("")
  const [groqKey, setGroqKey] = useState("")
  const [openaiKey, setOpenaiKey] = useState("")
  const [ollamaHost, setOllamaHost] = useState("http://localhost:11434")
  const [isSaving, setIsSaving] = useState(false)
  const [savedSuccess, setSavedSuccess] = useState(false)

  const loadVault = async () => {
    try {
      const res = await fetch("/api/vault")
      const data = await res.json()
      if (data.success) {
        setVaultStatus(data.keys || {})
      }
    } catch {}
  }

  useEffect(() => {
    loadVault()
  }, [])

  const saveKeys = async () => {
    setIsSaving(true)
    const payload: Record<string, string> = {}
    if (geminiKey.trim()) payload.gemini = geminiKey.trim()
    if (groqKey.trim()) payload.groq = groqKey.trim()
    if (openaiKey.trim()) payload.openai = openaiKey.trim()
    if (ollamaHost.trim()) payload.ollama_host = ollamaHost.trim()

    try {
      const res = await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (data.success) {
        setSavedSuccess(true)
        setGeminiKey("")
        setGroqKey("")
        setOpenaiKey("")
        loadVault()
        setTimeout(() => setSavedSuccess(false), 2500)
      }
    } catch {}
    finally {
      setIsSaving(false)
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", height: "100%", overflowY: "auto", paddingRight: "8px" }}>
      {/* Settings Header */}
      <div className="glass-panel" style={{ padding: "20px", display: "flex", alignItems: "center", gap: "12px" }}>
        <SettingsIcon size={22} color="#10b981" />
        <div>
          <h2 style={{ fontSize: "16px", fontWeight: "700", color: "#fff" }}>SYSTEM SETTINGS & VAULT</h2>
          <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Local-first credential encryption and sovereign runtime configuration
          </p>
        </div>
      </div>

      {/* API Key Vault Panel */}
      <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "700", fontSize: "14px" }}>
            <Key size={18} color="#f59e0b" />
            <span>SOVEREIGN API CREDENTIAL VAULT</span>
          </div>
          <span style={{ fontSize: "11px", color: "#10b981", display: "flex", alignItems: "center", gap: "4px" }}>
            <Shield size={14} /> Base64 Encrypted SQLite & .nexus-agent/
          </span>
        </div>

        {/* Gemini Key */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
            <label style={{ color: "#fff", fontWeight: "600" }}>Google Gemini API Key</label>
            <span style={{ color: vaultStatus.gemini?.configured ? "#10b981" : "var(--text-muted)" }}>
              {vaultStatus.gemini?.configured ? `Configured (${vaultStatus.gemini.preview})` : "Not Configured"}
            </span>
          </div>
          <input
            type="password"
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
            placeholder="AIzaSy... (leave blank to keep current)"
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
        </div>

        {/* Groq Key */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
            <label style={{ color: "#fff", fontWeight: "600" }}>Groq Cloud API Key</label>
            <span style={{ color: vaultStatus.groq?.configured ? "#10b981" : "var(--text-muted)" }}>
              {vaultStatus.groq?.configured ? `Configured (${vaultStatus.groq.preview})` : "Not Configured"}
            </span>
          </div>
          <input
            type="password"
            value={groqKey}
            onChange={(e) => setGroqKey(e.target.value)}
            placeholder="gsk_... (leave blank to keep current)"
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
        </div>

        {/* OpenAI Key */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
            <label style={{ color: "#fff", fontWeight: "600" }}>OpenAI / OpenRouter API Key</label>
            <span style={{ color: vaultStatus.openai?.configured ? "#10b981" : "var(--text-muted)" }}>
              {vaultStatus.openai?.configured ? `Configured (${vaultStatus.openai.preview})` : "Not Configured"}
            </span>
          </div>
          <input
            type="password"
            value={openaiKey}
            onChange={(e) => setOpenaiKey(e.target.value)}
            placeholder="sk-... (leave blank to keep current)"
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
        </div>

        {/* Ollama Host */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label style={{ color: "#fff", fontWeight: "600", fontSize: "12px" }}>Local Ollama Endpoint</label>
          <input
            type="text"
            value={ollamaHost}
            onChange={(e) => setOllamaHost(e.target.value)}
            placeholder="http://localhost:11434"
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
        </div>

        <button
          onClick={saveKeys}
          disabled={isSaving}
          className="cyber-btn cyber-btn-primary"
          style={{ alignSelf: "flex-end" }}
        >
          {savedSuccess ? <Check size={16} /> : <Save size={16} />}
          <span>{savedSuccess ? "Saved to Vault!" : isSaving ? "Saving..." : "Save Credentials"}</span>
        </button>
      </div>

      {/* Runtime & Server Info */}
      <div className="glass-panel" style={{ padding: "20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>SERVER ENGINE</span>
          <span style={{ fontSize: "14px", fontWeight: "600", color: "#10b981" }}>Bun.js v1.4.4 Native HTTP/WS</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>DATABASE RUNTIME</span>
          <span style={{ fontSize: "14px", fontWeight: "600", color: "#06b6d4" }}>bun:sqlite (WAL Mode)</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>FRONTEND COMPILATION</span>
          <span style={{ fontSize: "14px", fontWeight: "600", color: "#a855f7" }}>Bun.build (Sub-50ms Bundler)</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>PORT & NETWORKING</span>
          <span style={{ fontSize: "14px", fontWeight: "600", color: "#f59e0b" }}>localhost:3000 / Edge App Window</span>
        </div>
      </div>
    </div>
  )
}
