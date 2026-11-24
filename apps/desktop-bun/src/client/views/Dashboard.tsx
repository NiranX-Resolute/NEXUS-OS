import React, { useState, useEffect } from "react"
import {
  Cpu,
  HardDrive,
  Activity,
  Battery,
  Wifi,
  Sparkles,
  Terminal,
  MessageSquare,
  FileText,
  ShieldCheck,
  Zap,
  Clock
} from "lucide-react"

interface DashboardProps {
  onNavigate: (tab: string) => void
  telemetry: any
}

export const DashboardView: React.FC<DashboardProps> = ({ onNavigate, telemetry }) => {
  const [tasks, setTasks] = useState<any[]>([])

  useEffect(() => {
    fetch("/api/agentic/tasks")
      .then((r) => r.json())
      .then((d) => {
        if (d.success && Array.isArray(d.tasks)) setTasks(d.tasks)
      })
      .catch(() => {})
  }, [])

  const cpuLoad = telemetry?.cpu?.loadAvg?.[0] ? Math.round(telemetry.cpu.loadAvg[0] * 10) : 18
  const memoryPercent = telemetry?.memory?.usedPercent ?? 42
  const uptimeHours = telemetry?.uptimeSeconds ? (telemetry.uptimeSeconds / 3600).toFixed(1) : "12.4"
  const batteryPct = telemetry?.battery?.percent ?? 100

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", height: "100%", overflowY: "auto", paddingRight: "8px" }}>
      {/* Top Banner / System Vitals Header */}
      <div className="glass-panel" style={{ padding: "24px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "-40px", right: "-40px", width: "160px", height: "160px", background: "radial-gradient(circle, rgba(16,185,129,0.15) 0%, transparent 70%)", pointerEvents: "none" }} />
        
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#10b981" }} className="pulse-green" />
            <span style={{ fontSize: "18px", fontWeight: "700", letterSpacing: "0.5px" }}>NEXUS SOVEREIGN AGENT</span>
            <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "12px", background: "rgba(16,185,129,0.15)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)" }}>
              BUN.JS RUNTIME v1.4+
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", fontSize: "12px", color: "var(--text-muted)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Clock size={14} color="#06b6d4" />
              <span>Host Uptime: {uptimeHours}h</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <ShieldCheck size={14} color="#10b981" />
              <span>Zero Subscription / Sovereign Edge</span>
            </div>
          </div>
        </div>

        {/* Hardware Telemetry Metric Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
          {/* CPU Load */}
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-subtle)", borderRadius: "8px", padding: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted)", fontSize: "12px", marginBottom: "8px" }}>
              <span>CPU COMPUTE</span>
              <Cpu size={16} color="#10b981" />
            </div>
            <div style={{ fontSize: "24px", fontWeight: "700", color: "#10b981" }}>{cpuLoad}%</div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
              {telemetry?.cpu?.cores || 8} Cores • {telemetry?.cpu?.model ? telemetry.cpu.model.slice(0, 22) : "Native Core"}
            </div>
          </div>

          {/* Memory RAM */}
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-subtle)", borderRadius: "8px", padding: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted)", fontSize: "12px", marginBottom: "8px" }}>
              <span>RAM ALLOCATION</span>
              <Activity size={16} color="#06b6d4" />
            </div>
            <div style={{ fontSize: "24px", fontWeight: "700", color: "#06b6d4" }}>{memoryPercent}%</div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
              {telemetry?.memory?.usedBytes ? Math.round(telemetry.memory.usedBytes / (1024 * 1024 * 1024)) : 6} GB / {telemetry?.memory?.totalBytes ? Math.round(telemetry.memory.totalBytes / (1024 * 1024 * 1024)) : 16} GB
            </div>
          </div>

          {/* Local SQLite */}
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-subtle)", borderRadius: "8px", padding: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted)", fontSize: "12px", marginBottom: "8px" }}>
              <span>SQLITE POOL</span>
              <HardDrive size={16} color="#a855f7" />
            </div>
            <div style={{ fontSize: "24px", fontWeight: "700", color: "#a855f7" }}>WAL Mode</div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
              bun:sqlite • Zero-Latency Local Cache
            </div>
          </div>

          {/* Battery / Power */}
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-subtle)", borderRadius: "8px", padding: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted)", fontSize: "12px", marginBottom: "8px" }}>
              <span>POWER STATUS</span>
              <Battery size={16} color="#f59e0b" />
            </div>
            <div style={{ fontSize: "24px", fontWeight: "700", color: "#f59e0b" }}>{batteryPct}%</div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
              {telemetry?.battery?.isCharging ? "Charging / AC Power" : "Discharging Battery"}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Sovereign Launch Hub */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
        <button
          onClick={() => onNavigate("AI CHAT")}
          className="cyber-btn glass-panel"
          style={{ padding: "18px", justifyContent: "flex-start", gap: "16px", height: "auto" }}
        >
          <div style={{ padding: "10px", background: "rgba(16,185,129,0.15)", borderRadius: "8px" }}>
            <MessageSquare size={22} color="#10b981" />
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontWeight: "700", fontSize: "14px" }}>Sovereign AI Chat</div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>Gemini • Puter • Ollama with KaTeX math</div>
          </div>
        </button>

        <button
          onClick={() => onNavigate("TERMINAL")}
          className="cyber-btn glass-panel"
          style={{ padding: "18px", justifyContent: "flex-start", gap: "16px", height: "auto" }}
        >
          <div style={{ padding: "10px", background: "rgba(6,182,212,0.15)", borderRadius: "8px" }}>
            <Terminal size={22} color="#06b6d4" />
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontWeight: "700", fontSize: "14px" }}>Bun Terminal</div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>Native Bun.spawn shell executor</div>
          </div>
        </button>

        <button
          onClick={() => onNavigate("AGENTIC")}
          className="cyber-btn glass-panel"
          style={{ padding: "18px", justifyContent: "flex-start", gap: "16px", height: "auto" }}
        >
          <div style={{ padding: "10px", background: "rgba(168,85,247,0.15)", borderRadius: "8px" }}>
            <Zap size={22} color="#a855f7" />
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontWeight: "700", fontSize: "14px" }}>Agentic Swarm</div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>Autonomous ReAct task execution loop</div>
          </div>
        </button>

        <button
          onClick={() => onNavigate("NOTES")}
          className="cyber-btn glass-panel"
          style={{ padding: "18px", justifyContent: "flex-start", gap: "16px", height: "auto" }}
        >
          <div style={{ padding: "10px", background: "rgba(245,158,11,0.15)", borderRadius: "8px" }}>
            <FileText size={22} color="#f59e0b" />
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontWeight: "700", fontSize: "14px" }}>Notes Vault</div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>Persistent Markdown notes in SQLite</div>
          </div>
        </button>
      </div>

      {/* Autonomous Task Stream & Live Telemetry Feed */}
      <div className="glass-panel" style={{ padding: "20px", flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "700", fontSize: "14px" }}>
            <Activity size={18} color="#10b981" />
            <span>RECENT AUTONOMOUS TASK STREAM</span>
          </div>
          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Live Sync from bun:sqlite</span>
        </div>

        {tasks.length === 0 ? (
          <div style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
            No autonomous background tasks yet. Launch an agentic task from the Agentic tab or prompt via AI Chat.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {tasks.slice(0, 5).map((t) => (
              <div
                key={t.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px",
                  borderRadius: "6px",
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid var(--border-subtle)"
                }}
              >
                <div>
                  <div style={{ fontWeight: "600", fontSize: "13px" }}>{t.title}</div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>{t.prompt}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span
                    style={{
                      fontSize: "10px",
                      padding: "2px 8px",
                      borderRadius: "10px",
                      background: t.status === "completed" ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)",
                      color: t.status === "completed" ? "#10b981" : "#f59e0b"
                    }}
                  >
                    {t.status.toUpperCase()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
