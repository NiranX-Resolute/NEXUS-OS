import React, { useState, useEffect } from "react"
import { FileText, Plus, Trash2, Save, Tag, Folder, Eye, Edit } from "lucide-react"

interface Note {
  id: string
  title: string
  content: string
  tags: string | string[]
  folder: string
  updated_at: string
}

export const NotesView: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>([])
  const [activeNote, setActiveNote] = useState<Note | null>(null)
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [tags, setTags] = useState("")
  const [folder, setFolder] = useState("General")
  const [previewMode, setPreviewMode] = useState(false)
  const [search, setSearch] = useState("")

  const loadNotes = async () => {
    try {
      const res = await fetch("/api/notes")
      const data = await res.json()
      if (data.success && Array.isArray(data.notes)) {
        setNotes(data.notes)
        if (data.notes.length > 0 && !activeNote) {
          selectNote(data.notes[0])
        }
      }
    } catch {}
  }

  useEffect(() => {
    loadNotes()
  }, [])

  const selectNote = (n: Note) => {
    setActiveNote(n)
    setTitle(n.title)
    setContent(n.content)
    setFolder(n.folder || "General")
    try {
      const parsedTags = typeof n.tags === "string" ? JSON.parse(n.tags) : n.tags
      setTags(Array.isArray(parsedTags) ? parsedTags.join(", ") : "")
    } catch {
      setTags("")
    }
  }

  const createNewNote = () => {
    const fresh: Note = {
      id: "",
      title: "New Note",
      content: "",
      tags: [],
      folder: "General",
      updated_at: new Date().toISOString()
    }
    setActiveNote(fresh)
    setTitle(fresh.title)
    setContent("")
    setTags("")
    setFolder("General")
  }

  const saveNote = async () => {
    if (!title.trim()) return
    const tagArray = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)

    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeNote?.id || undefined,
          title: title.trim(),
          content,
          tags: tagArray,
          folder
        })
      })
      const data = await res.json()
      if (data.success) {
        await loadNotes()
        if (!activeNote?.id && data.id) {
          setActiveNote({
            id: data.id,
            title,
            content,
            tags: tagArray,
            folder,
            updated_at: new Date().toISOString()
          })
        }
      }
    } catch {}
  }

  const deleteNote = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await fetch(`/api/notes/${id}`, { method: "DELETE" })
      const remaining = notes.filter((n) => n.id !== id)
      setNotes(remaining)
      if (activeNote?.id === id) {
        if (remaining.length > 0) selectNote(remaining[0])
        else createNewNote()
      }
    } catch {}
  }

  const filteredNotes = notes.filter(
    (n) =>
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.content.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ display: "flex", gap: "16px", height: "100%", overflow: "hidden" }}>
      {/* Sidebar List */}
      <div
        className="glass-panel"
        style={{
          width: "280px",
          display: "flex",
          flexDirection: "column",
          padding: "16px",
          gap: "12px",
          flexShrink: 0
        }}
      >
        <button onClick={createNewNote} className="cyber-btn cyber-btn-primary" style={{ width: "100%" }}>
          <Plus size={16} />
          <span>New Note</span>
        </button>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search notes in SQLite..."
          style={{
            background: "rgba(0,0,0,0.5)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "6px",
            padding: "8px 12px",
            color: "#fff",
            fontSize: "12px",
            outline: "none"
          }}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: "6px", overflowY: "auto", flex: 1 }}>
          {filteredNotes.map((n) => (
            <div
              key={n.id}
              onClick={() => selectNote(n)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 12px",
                borderRadius: "8px",
                cursor: "pointer",
                background: n.id === activeNote?.id ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.02)",
                border: n.id === activeNote?.id ? "1px solid var(--accent-emerald)" : "1px solid var(--border-subtle)"
              }}
            >
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "180px" }}>
                <div style={{ fontSize: "13px", fontWeight: "600", color: "#fff" }}>{n.title}</div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                  {n.folder || "General"} • {new Date(n.updated_at).toLocaleDateString()}
                </div>
              </div>
              <button
                onClick={(e) => deleteNote(n.id, e)}
                style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "4px" }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Editor & Preview Panel */}
      <div className="glass-panel" style={{ flex: 1, display: "flex", flexDirection: "column", padding: "20px", gap: "14px", overflow: "hidden" }}>
        {/* Editor Controls */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Note Title"
            style={{
              background: "transparent",
              border: "none",
              color: "#fff",
              fontSize: "20px",
              fontWeight: "700",
              outline: "none",
              flex: 1
            }}
          />

          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => setPreviewMode(!previewMode)} className="cyber-btn">
              {previewMode ? <Edit size={14} /> : <Eye size={14} />}
              <span>{previewMode ? "Editor" : "Preview"}</span>
            </button>
            <button onClick={saveNote} className="cyber-btn cyber-btn-primary">
              <Save size={14} />
              <span>Save</span>
            </button>
          </div>
        </div>

        {/* Metadata inputs */}
        <div style={{ display: "flex", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1 }}>
            <Tag size={14} color="#10b981" />
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Tags (comma separated)..."
              style={{
                flex: 1,
                background: "rgba(0,0,0,0.4)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "6px",
                padding: "6px 10px",
                color: "#fff",
                fontSize: "12px",
                outline: "none"
              }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px", width: "200px" }}>
            <Folder size={14} color="#06b6d4" />
            <input
              type="text"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder="Folder Name"
              style={{
                flex: 1,
                background: "rgba(0,0,0,0.4)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "6px",
                padding: "6px 10px",
                color: "#fff",
                fontSize: "12px",
                outline: "none"
              }}
            />
          </div>
        </div>

        {/* Content Body */}
        {previewMode ? (
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px",
              background: "rgba(0,0,0,0.3)",
              borderRadius: "8px",
              fontSize: "14px",
              lineHeight: "1.7",
              color: "#e4e4e7",
              whiteSpace: "pre-wrap"
            }}
          >
            {content || <span style={{ color: "var(--text-muted)" }}>Nothing to preview</span>}
          </div>
        ) : (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write Markdown notes here..."
            className="font-mono"
            style={{
              flex: 1,
              background: "rgba(0,0,0,0.3)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "8px",
              padding: "16px",
              color: "#f4f4f5",
              fontSize: "13px",
              lineHeight: "1.6",
              outline: "none",
              resize: "none"
            }}
          />
        )}
      </div>
    </div>
  )
}
