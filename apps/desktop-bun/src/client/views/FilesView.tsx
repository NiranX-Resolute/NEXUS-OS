import React, { useState, useEffect } from "react"
import { Folder, File, ArrowLeft, Save, RefreshCw, Code, Check } from "lucide-react"

export const FilesView: React.FC = () => {
  const [currentPath, setCurrentPath] = useState("")
  const [parentPath, setParentPath] = useState("")
  const [entries, setEntries] = useState<any[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [savedSuccess, setSavedSuccess] = useState(false)

  const loadDirectory = async (path?: string) => {
    try {
      const url = path ? `/api/files/list?path=${encodeURIComponent(path)}` : "/api/files/list"
      const res = await fetch(url)
      const data = await res.json()
      if (data.success) {
        setCurrentPath(data.currentPath)
        setParentPath(data.parentPath)
        setEntries(data.entries)
      }
    } catch {}
  }

  useEffect(() => {
    loadDirectory()
  }, [])

  const openEntry = (ent: any) => {
    if (ent.isDirectory) {
      loadDirectory(ent.path)
    } else {
      readFile(ent.path)
    }
  }

  const readFile = async (path: string) => {
    setSelectedFile(path)
    try {
      const res = await fetch(`/api/files/read?path=${encodeURIComponent(path)}`)
      const data = await res.json()
      if (data.success) {
        setFileContent(data.content || "")
      }
    } catch {}
  }

  const saveFile = async () => {
    if (!selectedFile) return
    setIsSaving(true)
    try {
      const res = await fetch("/api/files/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selectedFile, content: fileContent })
      })
      const data = await res.json()
      if (data.success) {
        setSavedSuccess(true)
        setTimeout(() => setSavedSuccess(false), 2000)
      }
    } catch {}
    finally {
      setIsSaving(false)
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div style={{ display: "flex", gap: "16px", height: "100%", overflow: "hidden" }}>
      {/* Directory Browser */}
      <div
        className="glass-panel"
        style={{
          width: "360px",
          display: "flex",
          flexDirection: "column",
          padding: "16px",
          gap: "12px",
          flexShrink: 0
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {parentPath && (
            <button onClick={() => loadDirectory(parentPath)} className="cyber-btn" style={{ padding: "6px" }}>
              <ArrowLeft size={14} />
            </button>
          )}
          <div style={{ fontSize: "11px", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {currentPath}
          </div>
          <button onClick={() => loadDirectory(currentPath)} className="cyber-btn" style={{ padding: "6px" }}>
            <RefreshCw size={13} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "4px", overflowY: "auto", flex: 1 }}>
          {entries.map((ent, idx) => (
            <div
              key={idx}
              onClick={() => openEntry(ent)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "8px 10px",
                borderRadius: "6px",
                cursor: "pointer",
                background: selectedFile === ent.path ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.02)",
                border: selectedFile === ent.path ? "1px solid var(--accent-emerald)" : "1px solid transparent",
                fontSize: "12px"
              }}
            >
              {ent.isDirectory ? (
                <Folder size={15} color="#06b6d4" style={{ flexShrink: 0 }} />
              ) : (
                <File size={15} color="#10b981" style={{ flexShrink: 0 }} />
              )}
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {ent.name}
              </span>
              {!ent.isDirectory && (
                <span style={{ fontSize: "10px", color: "var(--text-muted)", flexShrink: 0 }}>
                  {formatSize(ent.size)}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* File Inspector / Editor */}
      <div className="glass-panel" style={{ flex: 1, display: "flex", flexDirection: "column", padding: "20px", gap: "12px", overflow: "hidden" }}>
        {selectedFile ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Code size={16} color="#10b981" />
                <span style={{ fontWeight: "700", fontSize: "14px" }}>
                  {selectedFile.split("\\").pop() || selectedFile}
                </span>
              </div>

              <button onClick={saveFile} disabled={isSaving} className="cyber-btn cyber-btn-primary">
                {savedSuccess ? <Check size={14} color="#10b981" /> : <Save size={14} />}
                <span>{savedSuccess ? "Saved!" : isSaving ? "Saving..." : "Save (Bun.write)"}</span>
              </button>
            </div>

            <textarea
              value={fileContent}
              onChange={(e) => setFileContent(e.target.value)}
              className="font-mono"
              style={{
                flex: 1,
                background: "rgba(0,0,0,0.5)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "8px",
                padding: "16px",
                color: "#e4e4e7",
                fontSize: "12px",
                lineHeight: "1.6",
                outline: "none",
                resize: "none"
              }}
            />
          </>
        ) : (
          <div style={{ margin: "auto", textAlign: "center", color: "var(--text-muted)" }}>
            <File size={42} color="var(--border-subtle)" style={{ marginBottom: "16px" }} />
            <div>Select a file from the browser to inspect or edit with native Bun.file() speed.</div>
          </div>
        )}
      </div>
    </div>
  )
}
