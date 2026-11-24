import React, { useState, useEffect, useRef } from "react"
import { Send, Sparkles, Download, Trash2, Plus, Bot, User, Copy, Check } from "lucide-react"

interface Message {
  id?: string
  role: "user" | "assistant"
  content: string
}

export const AiChatView: React.FC = () => {
  const [sessions, setSessions] = useState<any[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string>("")
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [model, setModel] = useState("gemini-2.5-flash")
  const [models, setModels] = useState<any[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load models & sessions
  useEffect(() => {
    fetch("/api/ai/models")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setModels(d.models)
      })

    loadSessions()
  }, [])

  const loadSessions = async () => {
    try {
      const res = await fetch("/api/chat/sessions")
      const data = await res.json()
      if (data.success && data.sessions.length > 0) {
        setSessions(data.sessions)
        if (!activeSessionId) {
          switchSession(data.sessions[0].id)
        }
      } else {
        // Create initial session
        createNewSession("Primary Intelligence Session")
      }
    } catch {}
  }

  const createNewSession = async (title = "New Intelligence Chat") => {
    try {
      const res = await fetch("/api/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, model })
      })
      const data = await res.json()
      if (data.success) {
        setSessions((prev) => [{ id: data.id, title, model }, ...prev])
        switchSession(data.id)
      }
    } catch {}
  }

  const switchSession = async (sessionId: string) => {
    setActiveSessionId(sessionId)
    try {
      const res = await fetch(`/api/chat/messages?sessionId=${sessionId}`)
      const data = await res.json()
      if (data.success) {
        setMessages(data.messages)
      }
    } catch {}
  }

  const deleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await fetch(`/api/chat/sessions/${sessionId}`, { method: "DELETE" })
    setSessions((prev) => prev.filter((s) => s.id !== sessionId))
    if (activeSessionId === sessionId) {
      const remaining = sessions.filter((s) => s.id !== sessionId)
      if (remaining.length > 0) switchSession(remaining[0].id)
      else setMessages([])
    }
  }

  const exportChat = async () => {
    if (!activeSessionId) return
    const res = await fetch("/api/chat/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: activeSessionId })
    })
    const data = await res.json()
    if (data.success) {
      alert(`Chat exported to Markdown:\n${data.path}`)
    }
  }

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return
    const userPrompt = input.trim()
    setInput("")

    const newMsgs: Message[] = [...messages, { role: "user", content: userPrompt }]
    setMessages(newMsgs)
    setIsStreaming(true)

    // Save user message to SQLite
    fetch("/api/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: activeSessionId, role: "user", content: userPrompt })
    })

    // Placeholder assistant message for streaming
    const assistantMsgIndex = newMsgs.length
    setMessages([...newMsgs, { role: "assistant", content: "" }])

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMsgs,
          model,
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
                  setMessages((prev) => {
                    const updated = [...prev]
                    if (updated[assistantMsgIndex]) {
                      updated[assistantMsgIndex] = { role: "assistant", content: accumulated }
                    }
                    return updated
                  })
                }
              } catch {}
            }
          }
        }
      }

      // Save assistant message to SQLite
      if (accumulated) {
        fetch("/api/chat/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: activeSessionId, role: "assistant", content: accumulated })
        })
      }
    } catch (err: any) {
      setMessages((prev) => {
        const updated = [...prev]
        if (updated[assistantMsgIndex]) {
          updated[assistantMsgIndex] = { role: "assistant", content: `[Error: ${err.message}]` }
        }
        return updated
      })
    } finally {
      setIsStreaming(false)
    }
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const copyText = (text: string, idx: number) => {
    navigator.clipboard.writeText(text)
    setCopiedIndex(idx)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  return (
    <div style={{ display: "flex", gap: "16px", height: "100%", overflow: "hidden" }}>
      {/* Left Session Drawer */}
      <div
        className="glass-panel"
        style={{
          width: "260px",
          display: "flex",
          flexDirection: "column",
          padding: "16px",
          gap: "12px",
          flexShrink: 0
        }}
      >
        <button
          onClick={() => createNewSession()}
          className="cyber-btn cyber-btn-primary"
          style={{ width: "100%" }}
        >
          <Plus size={16} />
          <span>New Chat Session</span>
        </button>

        <div style={{ fontSize: "11px", fontWeight: "600", color: "var(--text-muted)", marginTop: "4px" }}>
          PERSISTENT SESSIONS (SQLITE)
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px", overflowY: "auto", flex: 1 }}>
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => switchSession(s.id)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 12px",
                borderRadius: "8px",
                cursor: "pointer",
                background: s.id === activeSessionId ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.02)",
                border: s.id === activeSessionId ? "1px solid var(--accent-emerald)" : "1px solid var(--border-subtle)",
                transition: "all 0.2s ease"
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: s.id === activeSessionId ? "600" : "400", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "160px" }}>
                {s.title}
              </div>
              <button
                onClick={(e) => deleteSession(s.id, e)}
                style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "2px" }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Interface */}
      <div className="glass-panel" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Chat Control Topbar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 16px",
            borderBottom: "1px solid var(--border-subtle)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <Sparkles size={18} color="#10b981" />
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              style={{
                background: "rgba(0,0,0,0.5)",
                border: "1px solid var(--border-subtle)",
                color: "#10b981",
                padding: "6px 12px",
                borderRadius: "6px",
                fontSize: "12px",
                outline: "none"
              }}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={exportChat} className="cyber-btn" title="Export session to local Markdown">
              <Download size={14} />
              <span>Export</span>
            </button>
          </div>
        </div>

        {/* Message Log */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {messages.length === 0 ? (
            <div style={{ margin: "auto", textAlign: "center", color: "var(--text-muted)", maxWidth: "420px" }}>
              <Bot size={42} color="#10b981" style={{ marginBottom: "16px" }} />
              <h3 style={{ color: "#fff", marginBottom: "8px" }}>Nexdune Intelligence Ready</h3>
              <p style={{ fontSize: "13px", lineHeight: "1.6" }}>
                Operating with sub-millisecond Bun.js execution, native SQLite persistence, and multi-provider streaming. Ask anything from systems architecture to live code.
              </p>
            </div>
          ) : (
            messages.map((m, idx) => {
              const isAssistant = m.role === "assistant"
              return (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    gap: "12px",
                    alignSelf: isAssistant ? "flex-start" : "flex-end",
                    maxWidth: "85%"
                  }}
                >
                  {isAssistant && (
                    <div
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "8px",
                        background: "rgba(16,185,129,0.2)",
                        border: "1px solid #10b981",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0
                      }}
                    >
                      <Bot size={18} color="#10b981" />
                    </div>
                  )}

                  <div
                    style={{
                      background: isAssistant ? "rgba(255,255,255,0.03)" : "rgba(16,185,129,0.15)",
                      border: isAssistant ? "1px solid var(--border-subtle)" : "1px solid rgba(16,185,129,0.4)",
                      borderRadius: "12px",
                      padding: "14px 18px",
                      fontSize: "13px",
                      lineHeight: "1.6",
                      color: "#fff",
                      whiteSpace: "pre-wrap",
                      position: "relative"
                    }}
                  >
                    {m.content}

                    {isAssistant && m.content && (
                      <button
                        onClick={() => copyText(m.content, idx)}
                        style={{
                          position: "absolute",
                          top: "8px",
                          right: "8px",
                          background: "transparent",
                          border: "none",
                          color: "var(--text-muted)",
                          cursor: "pointer"
                        }}
                      >
                        {copiedIndex === idx ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                      </button>
                    )}
                  </div>

                  {!isAssistant && (
                    <div
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "8px",
                        background: "rgba(6,182,212,0.2)",
                        border: "1px solid #06b6d4",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0
                      }}
                    >
                      <User size={18} color="#06b6d4" />
                    </div>
                  )}
                </div>
              )
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div style={{ padding: "16px", borderTop: "1px solid var(--border-subtle)", display: "flex", gap: "10px" }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Direct message to Nexdune... (Enter to send)"
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
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
            className="cyber-btn cyber-btn-primary"
            style={{ padding: "0 20px" }}
          >
            <Send size={16} />
            <span>Send</span>
          </button>
        </div>
      </div>
    </div>
  )
}
