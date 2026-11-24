import React, { useState, useEffect } from "react"
import { Zap, Play, CheckCircle2, Loader2, ArrowRight } from "lucide-react"

export const AgenticView: React.FC = () => {
  const [prompt, setPrompt] = useState("")
  const [tasks, setTasks] = useState<any[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [activeSteps, setActiveSteps] = useState<any[]>([])

  const loadTasks = () => {
    fetch("/api/agentic/tasks")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setTasks(d.tasks)
      })
      .catch(() => {})
  }

  useEffect(() => {
    loadTasks()
  }, [])

  const runAutonomousTask = async () => {
    if (!prompt.trim() || isRunning) return
    const userTask = prompt.trim()
    setIsRunning(true)
    setActiveSteps([])

    try {
      const res = await fetch("/api/agentic/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userTask })
      })
      const data = await res.json()
      if (data.success) {
        setActiveSteps(data.steps || [])
        loadTasks()
      }
    } catch {}
    finally {
      setIsRunning(false)
    }
  }

  return (
    <div style={{ display: "flex", gap: "20px", height: "100%", overflow: "hidden" }}>
      {/* Left Input & Execution Panel */}
      <div className="glass-panel" style={{ flex: 1, display: "flex", flexDirection: "column", padding: "20px", gap: "16px", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Zap size={20} color="#a855f7" />
          <span style={{ fontWeight: "700", fontSize: "16px" }}>AUTONOMOUS AGENTIC SWARM</span>
          <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "10px", background: "rgba(168,85,247,0.15)", color: "#a855f7", border: "1px solid rgba(168,85,247,0.3)" }}>
            ReAct Reasoning Loop
          </span>
        </div>

        <div style={{ color: "var(--text-muted)", fontSize: "13px" }}>
          Empower Nexdune to autonomously plan, execute multi-step tool routines, inspect system states, and synthesize results without manual intervention.
        </div>

        {/* Task Input Area */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe an autonomous task for Nexdune (e.g. Inspect system performance, audit Bun SQLite cache, or analyze repository dependencies)..."
            rows={3}
            style={{
              background: "rgba(0,0,0,0.5)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "8px",
              padding: "14px",
              color: "#fff",
              fontSize: "13px",
              outline: "none",
              resize: "none"
            }}
          />
          <button
            onClick={runAutonomousTask}
            disabled={isRunning || !prompt.trim()}
            className="cyber-btn cyber-btn-primary"
            style={{ alignSelf: "flex-end" }}
          >
            {isRunning ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            <span>{isRunning ? "Executing Autonomous Swarm..." : "Dispatch Agent Task"}</span>
          </button>
        </div>

        {/* Active Step Visualizer */}
        <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ fontWeight: "700", fontSize: "13px", color: "var(--text-muted)" }}>
            REASONING & TOOL TRACE
          </div>

          {activeSteps.length === 0 && !isRunning && (
            <div style={{ padding: "24px", textAlign: "center", color: "var(--text-muted)", background: "rgba(255,255,255,0.02)", borderRadius: "8px" }}>
              Ready for autonomous mission dispatch. Enter a prompt above.
            </div>
          )}

          {activeSteps.map((step, idx) => (
            <div
              key={idx}
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "8px",
                padding: "14px",
                display: "flex",
                flexDirection: "column",
                gap: "8px"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <CheckCircle2 size={15} color="#10b981" />
                <span style={{ fontWeight: "600", fontSize: "13px", color: "#10b981" }}>
                  Step {idx + 1}: {step.action}
                </span>
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-main)", paddingLeft: "24px" }}>
                <strong>Thought:</strong> {step.thought}
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", paddingLeft: "24px" }}>
                <strong>Observation:</strong> {step.observation}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Task Archive Drawer */}
      <div className="glass-panel" style={{ width: "320px", display: "flex", flexDirection: "column", padding: "16px", gap: "12px", flexShrink: 0 }}>
        <div style={{ fontWeight: "700", fontSize: "13px", color: "var(--text-muted)" }}>
          HISTORICAL AGENT MISSIONS
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto", flex: 1 }}>
          {tasks.map((t) => (
            <div
              key={t.id}
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "8px",
                padding: "12px",
                display: "flex",
                flexDirection: "column",
                gap: "6px"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: "600", fontSize: "12px", color: "#fff" }}>{t.title}</span>
                <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "8px", background: "rgba(16,185,129,0.15)", color: "#10b981" }}>
                  {t.status}
                </span>
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", lineClamp: 2 }}>{t.prompt}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
