import React, { useState, useRef, useEffect } from "react"
import { Terminal as TerminalIcon, Play, Trash2, CheckCircle2, AlertCircle } from "lucide-react"

interface TerminalHistoryEntry {
  command: string
  stdout: string
  stderr: string
  exitCode: number
  durationMs: number
  timestamp: string
}

export const TerminalView: React.FC = () => {
  const [command, setCommand] = useState("")
  const [history, setHistory] = useState<TerminalHistoryEntry[]>([
    {
      command: "bun --version",
      stdout: "1.4.4 (native Windows x64 build)\nNexus Bun Workstation Initialized.",
      stderr: "",
      exitCode: 0,
      durationMs: 4,
      timestamp: new Date().toLocaleTimeString()
    }
  ])
  const [isRunning, setIsRunning] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const executeCommand = async () => {
    if (!command.trim() || isRunning) return
    const cmd = command.trim()
    setCommand("")
    setIsRunning(true)

    try {
      const res = await fetch("/api/terminal/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd })
      })
      const data = await res.json()

      setHistory((prev) => [
        ...prev,
        {
          command: cmd,
          stdout: data.stdout || "",
          stderr: data.stderr || (data.success ? "" : data.error || "Execution error"),
          exitCode: data.exitCode ?? (data.success ? 0 : 1),
          durationMs: data.durationMs || 0,
          timestamp: new Date().toLocaleTimeString()
        }
      ])
    } catch (err: any) {
      setHistory((prev) => [
        ...prev,
        {
          command: cmd,
          stdout: "",
          stderr: err.message,
          exitCode: 1,
          durationMs: 0,
          timestamp: new Date().toLocaleTimeString()
        }
      ])
    } finally {
      setIsRunning(false)
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [history])

  return (
    <div className="glass-panel" style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Topbar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 20px",
          borderBottom: "1px solid var(--border-subtle)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <TerminalIcon size={18} color="#06b6d4" />
          <span style={{ fontWeight: "700", fontSize: "14px" }}>BUN SOVEREIGN TERMINAL</span>
          <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "10px", background: "rgba(6,182,212,0.15)", color: "#06b6d4", border: "1px solid rgba(6,182,212,0.3)" }}>
            Bun.spawn Subprocess Pipeline
          </span>
        </div>

        <button onClick={() => setHistory([])} className="cyber-btn" title="Clear Terminal Logs">
          <Trash2 size={14} />
          <span>Clear</span>
        </button>
      </div>

      {/* Terminal Output Area */}
      <div
        className="font-mono"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          background: "rgba(0,0,0,0.6)",
          fontSize: "12px"
        }}
      >
        {history.map((h, idx) => (
          <div key={idx} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-muted)" }}>
              <span style={{ color: "#10b981" }}>PS NEXUS&gt;</span>
              <span style={{ color: "#fff", fontWeight: "600" }}>{h.command}</span>
              <span style={{ fontSize: "10px", marginLeft: "auto", color: "rgba(255,255,255,0.4)" }}>
                {h.durationMs}ms • {h.timestamp}
              </span>
              {h.exitCode === 0 ? (
                <CheckCircle2 size={13} color="#10b981" />
              ) : (
                <AlertCircle size={13} color="#ef4444" />
              )}
            </div>

            {h.stdout && (
              <pre
                style={{
                  color: "#a1a1aa",
                  whiteSpace: "pre-wrap",
                  lineHeight: "1.5",
                  paddingLeft: "16px",
                  borderLeft: "2px solid rgba(16,185,129,0.3)"
                }}
              >
                {h.stdout}
              </pre>
            )}

            {h.stderr && (
              <pre
                style={{
                  color: "#f87171",
                  whiteSpace: "pre-wrap",
                  lineHeight: "1.5",
                  paddingLeft: "16px",
                  borderLeft: "2px solid rgba(239,68,68,0.4)"
                }}
              >
                {h.stderr}
              </pre>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input Line */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "16px 20px",
          borderTop: "1px solid var(--border-subtle)",
          background: "rgba(0,0,0,0.4)"
        }}
      >
        <span className="font-mono" style={{ color: "#10b981", fontWeight: "700", fontSize: "13px" }}>
          PS&gt;
        </span>
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") executeCommand()
          }}
          disabled={isRunning}
          placeholder="Execute shell or Bun command (e.g. dir, git status, bun test)..."
          className="font-mono"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            color: "#fff",
            fontSize: "13px",
            outline: "none"
          }}
        />
        <button
          onClick={executeCommand}
          disabled={isRunning || !command.trim()}
          className="cyber-btn cyber-btn-primary"
        >
          <Play size={14} />
          <span>Execute</span>
        </button>
      </div>
    </div>
  )
}
