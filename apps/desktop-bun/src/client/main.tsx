import React, { useState, useEffect } from "react"
import { createRoot } from "react-dom/client"
import {
  LayoutDashboard,
  MessageSquare,
  Terminal,
  Zap,
  UserCheck,
  Edit3,
  FileText,
  FolderOpen,
  User,
  Settings as SettingsIcon,
  Activity,
  Mic,
  MicOff,
  Volume2
} from "lucide-react"

import { bridge } from "./bridge"
import { DashboardView } from "./views/Dashboard"
import { AiChatView } from "./views/AiChat"
import { TerminalView } from "./views/TerminalView"
import { AgenticView } from "./views/AgenticView"
import { InterviewView } from "./views/InterviewView"
import { WhiteboardView } from "./views/Whiteboard"
import { NotesView } from "./views/NotesView"
import { FilesView } from "./views/FilesView"
import { ProfileView } from "./views/ProfileView"
import { SettingsView } from "./views/SettingsView"

import "./styles/index.css"

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState("DASHBOARD")
  const [telemetry, setTelemetry] = useState<any>(null)
  const [isMicActive, setIsMicActive] = useState(false)

  useEffect(() => {
    // Initial fetch
    fetch("/api/system/info")
      .then((r) => r.json())
      .then((d) => setTelemetry(d))
      .catch(() => {})

    // Real-time telemetry via Bun WebSocket
    const unsub = bridge.on("telemetry:stream", (data) => {
      setTelemetry(data)
    })

    return () => unsub()
  }, [])

  const navItems = [
    { id: "DASHBOARD", label: "Agent HUD", icon: <LayoutDashboard size={18} /> },
    { id: "AI CHAT", label: "AI Chat", icon: <MessageSquare size={18} /> },
    { id: "TERMINAL", label: "Terminal", icon: <Terminal size={18} /> },
    { id: "AGENTIC", label: "Agentic Swarm", icon: <Zap size={18} /> },
    { id: "INTERVIEW", label: "Interview Copilot", icon: <UserCheck size={18} /> },
    { id: "WHITEBOARD", label: "Whiteboard", icon: <Edit3 size={18} /> },
    { id: "NOTES", label: "Notes Vault", icon: <FileText size={18} /> },
    { id: "FILES", label: "File Explorer", icon: <FolderOpen size={18} /> },
    { id: "PROFILE", label: "NiranX Profile", icon: <User size={18} /> },
    { id: "SETTINGS", label: "Settings", icon: <SettingsIcon size={18} /> }
  ]

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", background: "var(--bg-primary)" }}>
      {/* Sidebar Navigation */}
      <div
        className="glass-panel"
        style={{
          width: "240px",
          display: "flex",
          flexDirection: "column",
          padding: "20px 14px",
          gap: "18px",
          borderRight: "1px solid var(--border-subtle)",
          borderRadius: "0",
          flexShrink: 0
        }}
      >
        {/* App Title */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingLeft: "8px" }}>
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "8px",
              background: "linear-gradient(135deg, #10b981 0%, #06b6d4 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 12px rgba(16,185,129,0.4)"
            }}
          >
            <Activity size={16} color="#09090b" />
          </div>
          <div>
            <div style={{ fontWeight: "800", fontSize: "14px", letterSpacing: "1px" }}>NEXUS AI</div>
            <div style={{ fontSize: "10px", color: "var(--accent-emerald)", fontWeight: "600" }}>BUN SOVEREIGN</div>
          </div>
        </div>

        {/* Nav Links */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1, overflowY: "auto" }}>
          {navItems.map((item) => {
            const isActive = activeTab === item.id
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: isActive ? "600" : "500",
                  color: isActive ? "#fff" : "var(--text-muted)",
                  background: isActive ? "rgba(16,185,129,0.15)" : "transparent",
                  borderLeft: isActive ? "3px solid var(--accent-emerald)" : "3px solid transparent",
                  transition: "all 0.15s ease",
                  textAlign: "left"
                }}
              >
                <span style={{ color: isActive ? "var(--accent-emerald)" : "inherit" }}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>

        {/* Bottom Audio / Status Widget */}
        <div
          style={{
            padding: "12px",
            background: "rgba(255,255,255,0.02)",
            borderRadius: "8px",
            border: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={() => setIsMicActive(!isMicActive)}
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                background: isMicActive ? "rgba(16,185,129,0.2)" : "rgba(255,255,255,0.05)",
                border: isMicActive ? "1px solid #10b981" : "1px solid var(--border-subtle)",
                color: isMicActive ? "#10b981" : "var(--text-muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer"
              }}
            >
              {isMicActive ? <Mic size={14} /> : <MicOff size={14} />}
            </button>
            <div style={{ fontSize: "11px" }}>
              <div style={{ color: "#fff", fontWeight: "600" }}>Voice HUD</div>
              <div style={{ color: isMicActive ? "#10b981" : "var(--text-muted)", fontSize: "10px" }}>
                {isMicActive ? "Listening" : "Muted"}
              </div>
            </div>
          </div>

          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981" }} className="pulse-green" />
        </div>
      </div>

      {/* Main Workspace View */}
      <div style={{ flex: 1, padding: "20px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {activeTab === "DASHBOARD" && <DashboardView onNavigate={(t) => setActiveTab(t)} telemetry={telemetry} />}
        {activeTab === "AI CHAT" && <AiChatView />}
        {activeTab === "TERMINAL" && <TerminalView />}
        {activeTab === "AGENTIC" && <AgenticView />}
        {activeTab === "INTERVIEW" && <InterviewView />}
        {activeTab === "WHITEBOARD" && <WhiteboardView />}
        {activeTab === "NOTES" && <NotesView />}
        {activeTab === "FILES" && <FilesView />}
        {activeTab === "PROFILE" && <ProfileView />}
        {activeTab === "SETTINGS" && <SettingsView />}
      </div>
    </div>
  )
}

const rootEl = document.getElementById("root")
if (rootEl) {
  createRoot(rootEl).render(<App />)
}
