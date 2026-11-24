import React, { useRef, useState, useEffect } from "react"
import { Edit3, Square, Circle, ArrowRight, Trash2, Save, Download } from "lucide-react"

export const WhiteboardView: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [color, setColor] = useState("#10b981")
  const [lineWidth, setLineWidth] = useState(3)
  const [lastPos, setLastPos] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = canvas.parentElement?.clientWidth || 800
    canvas.height = canvas.parentElement?.clientHeight || 600

    const ctx = canvas.getContext("2d")
    if (ctx) {
      ctx.fillStyle = "#09090b"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      // Draw grid lines
      ctx.strokeStyle = "rgba(255, 255, 255, 0.04)"
      ctx.lineWidth = 1
      for (let x = 0; x < canvas.width; x += 30) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, canvas.height)
        ctx.stroke()
      }
      for (let y = 0; y < canvas.height; y += 30) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(canvas.width, y)
        ctx.stroke()
      }
    }
  }, [])

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true)
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    setLastPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !lastPos) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    const rect = canvas?.getBoundingClientRect()
    if (!ctx || !rect) return

    const currentX = e.clientX - rect.left
    const currentY = e.clientY - rect.top

    ctx.beginPath()
    ctx.moveTo(lastPos.x, lastPos.y)
    ctx.lineTo(currentX, currentY)
    ctx.strokeStyle = color
    ctx.lineWidth = lineWidth
    ctx.lineCap = "round"
    ctx.stroke()

    setLastPos({ x: currentX, y: currentY })
  }

  const stopDrawing = () => {
    setIsDrawing(false)
    setLastPos(null)
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (canvas && ctx) {
      ctx.fillStyle = "#09090b"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
  }

  const saveCanvas = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dataUrl = canvas.toDataURL("image/png")

    try {
      await fetch("/api/whiteboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Canvas Diagram ${new Date().toLocaleDateString()}`,
          thumbnail: dataUrl
        })
      })
      alert("Canvas saved to local SQLite store.")
    } catch {}
  }

  return (
    <div className="glass-panel" style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 20px",
          borderBottom: "1px solid var(--border-subtle)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "700", fontSize: "14px" }}>
            <Edit3 size={18} color="#10b981" />
            <span>NEXUS WHITEBOARD STUDIO</span>
          </div>

          {/* Color Palette */}
          <div style={{ display: "flex", gap: "6px" }}>
            {["#10b981", "#06b6d4", "#a855f7", "#f59e0b", "#ef4444", "#ffffff"].map((c) => (
              <div
                key={c}
                onClick={() => setColor(c)}
                style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  background: c,
                  cursor: "pointer",
                  border: color === c ? "2px solid #fff" : "1px solid rgba(0,0,0,0.5)",
                  transform: color === c ? "scale(1.2)" : "scale(1)"
                }}
              />
            ))}
          </div>

          {/* Line Width */}
          <input
            type="range"
            min="1"
            max="12"
            value={lineWidth}
            onChange={(e) => setLineWidth(Number(e.target.value))}
            style={{ width: "80px", accentColor: "#10b981" }}
          />
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={saveCanvas} className="cyber-btn cyber-btn-primary">
            <Save size={14} />
            <span>Save to SQLite</span>
          </button>
          <button onClick={clearCanvas} className="cyber-btn">
            <Trash2 size={14} />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Canvas Area */}
      <div style={{ flex: 1, position: "relative", cursor: "crosshair" }}>
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          style={{ width: "100%", height: "100%", display: "block" }}
        />
      </div>
    </div>
  )
}
