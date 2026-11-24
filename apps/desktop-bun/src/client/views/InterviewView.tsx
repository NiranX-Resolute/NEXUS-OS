import React, { useState } from "react"
import { UserCheck, Mic, Sparkles, Copy, Check, EyeOff } from "lucide-react"

export const InterviewView: React.FC = () => {
  const [question, setQuestion] = useState("")
  const [answer, setAnswer] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [isCopied, setIsCopied] = useState(false)

  const sampleQuestions = [
    "Design a 100% free-tier distributed AI agent bridge connecting desktop to edge.",
    "Explain how you would handle race conditions in high-throughput SQLite WAL mode.",
    "Tell me about a time you had to optimize system memory and sub-second IPC latency."
  ]

  const generateAnswer = async (qText?: string) => {
    const q = qText || question
    if (!q.trim() || isGenerating) return
    setIsGenerating(true)
    setAnswer("")

    const prompt = `You are the Nexus Interview Copilot. Deliver an ultra-crisp, high-impact answer for this technical interview question. Structure with:
1. Direct Core Thesis (1-2 sentences)
2. STAR Structure / Technical Architecture
3. Key Metrics, Invariants & Trade-offs

Question: "${q}"`

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          model: "gemini-2.5-flash",
          stream: true
        })
      })

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let accumulated = ""

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split("\n")

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const dataStr = line.slice(6).trim()
              if (dataStr === "[DONE]") continue
              try {
                const parsed = JSON.parse(dataStr)
                if (parsed.text) {
                  accumulated += parsed.text
                  setAnswer(accumulated)
                }
              } catch {}
            }
          }
        }
      }
    } catch (err: any) {
      setAnswer(`[Copilot Error: ${err.message}]`)
    } finally {
      setIsGenerating(false)
    }
  }

  const copyAnswer = () => {
    navigator.clipboard.writeText(answer)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", height: "100%", overflowY: "auto", paddingRight: "8px" }}>
      {/* Header Banner */}
      <div className="glass-panel" style={{ padding: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <UserCheck size={20} color="#06b6d4" />
          <span style={{ fontWeight: "700", fontSize: "16px" }}>NEXUS INTERVIEW COPILOT</span>
          <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "10px", background: "rgba(6,182,212,0.15)", color: "#06b6d4", border: "1px solid rgba(6,182,212,0.3)" }}>
            Stealth Sub-Second Engine
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <EyeOff size={16} color="var(--text-muted)" />
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Overlay Mode Ready</span>
        </div>
      </div>

      {/* Quick Prompts */}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        {sampleQuestions.map((sq, idx) => (
          <button
            key={idx}
            onClick={() => {
              setQuestion(sq)
              generateAnswer(sq)
            }}
            className="cyber-btn"
            style={{ fontSize: "12px", textAlign: "left", padding: "6px 12px" }}
          >
            <Sparkles size={13} color="#10b981" />
            <span>{sq.slice(0, 48)}...</span>
          </button>
        ))}
      </div>

      {/* Question Input */}
      <div className="glass-panel" style={{ padding: "16px", display: "flex", gap: "12px" }}>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") generateAnswer()
          }}
          placeholder="Type or paste incoming interview question..."
          style={{
            flex: 1,
            background: "rgba(0,0,0,0.5)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "8px",
            padding: "12px 16px",
            color: "#fff",
            fontSize: "13px",
            outline: "none"
          }}
        />
        <button
          onClick={() => generateAnswer()}
          disabled={isGenerating || !question.trim()}
          className="cyber-btn cyber-btn-primary"
        >
          <Sparkles size={16} />
          <span>Generate STAR Answer</span>
        </button>
      </div>

      {/* Answer Output */}
      <div className="glass-panel" style={{ flex: 1, padding: "24px", display: "flex", flexDirection: "column", gap: "14px", position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: "700", fontSize: "13px", color: "var(--text-muted)" }}>
            STREAMING COPILOT SYNTHESIS
          </span>
          {answer && (
            <button onClick={copyAnswer} className="cyber-btn">
              {isCopied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
              <span>{isCopied ? "Copied" : "Copy"}</span>
            </button>
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto", fontSize: "14px", lineHeight: "1.7", color: "#f4f4f5", whiteSpace: "pre-wrap" }}>
          {answer || (
            <span style={{ color: "var(--text-muted)" }}>
              Ask a question or select a template above to see instantaneous streaming responses formatted for high-stakes technical interviews.
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
