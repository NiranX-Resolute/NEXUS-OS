// Universal IPC & WebSocket Bridge for Nexus Bun Workstation

class NexusBridge {
  private ws: WebSocket | null = null
  private listeners: Map<string, Set<(data: any) => void>> = new Map()

  constructor() {
    this.initWebSocket()
  }

  private initWebSocket() {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:"
    const wsUrl = `${proto}//${window.location.host}/ws`

    try {
      this.ws = new WebSocket(wsUrl)
      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data)
          if (payload.type === "telemetry:stream") {
            this.emit("telemetry:stream", payload.data)
          } else if (payload.type === "ipc:reply") {
            this.emit(`ipc:reply:${payload.channel}`, payload.data)
          } else if (payload.type === "event") {
            this.emit(payload.event, payload.payload)
          }
        } catch {}
      }

      this.ws.onclose = () => {
        setTimeout(() => this.initWebSocket(), 3000)
      }
    } catch {}
  }

  public on(channel: string, callback: (data: any) => void) {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set())
    }
    this.listeners.get(channel)!.add(callback)
    return () => this.off(channel, callback)
  }

  public off(channel: string, callback: (data: any) => void) {
    this.listeners.get(channel)?.delete(callback)
  }

  public emit(channel: string, data: any) {
    this.listeners.get(channel)?.forEach((cb) => {
      try {
        cb(data)
      } catch (err) {
        console.error("Bridge listener error:", err)
      }
    })
  }

  public async invoke(channel: string, ...args: any[]): Promise<any> {
    // Map common Electron IPC channels to Bun REST endpoints
    if (channel === "get-system-info") {
      const res = await fetch("/api/system/info")
      return res.json()
    }

    if (channel === "read-file") {
      const res = await fetch(`/api/files/read?path=${encodeURIComponent(args[0])}`)
      return res.json()
    }

    if (channel === "write-file") {
      const res = await fetch("/api/files/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: args[0], content: args[1] })
      })
      return res.json()
    }

    if (channel === "list-files") {
      const res = await fetch(`/api/files/list?path=${encodeURIComponent(args[0] || "")}`)
      return res.json()
    }

    if (channel === "run-terminal") {
      const res = await fetch("/api/terminal/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: args[0], cwd: args[1] })
      })
      return res.json()
    }

    // Default fallback
    return { success: true }
  }

  public send(channel: string, data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "ipc:send", channel, data }))
    }
  }
}

export const bridge = new NexusBridge()

// Polyfill window.electron for seamless backward compatibility
if (typeof window !== "undefined") {
  ;(window as any).electron = {
    ipcRenderer: {
      invoke: (channel: string, ...args: any[]) => bridge.invoke(channel, ...args),
      on: (channel: string, callback: any) => bridge.on(channel, callback),
      send: (channel: string, data: any) => bridge.send(channel, data)
    }
  }
}
