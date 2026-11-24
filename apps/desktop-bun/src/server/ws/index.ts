import type { ServerWebSocket } from "bun"
import { getSystemStats } from "../routes/system"

const clients = new Set<ServerWebSocket<any>>()

export const websocketHandler = {
  open(ws: ServerWebSocket<any>) {
    clients.add(ws)
    ws.send(JSON.stringify({ type: "connection", status: "connected", runtime: "bun-1.4+" }))
  },

  message(ws: ServerWebSocket<any>, message: string | Buffer) {
    try {
      const parsed = JSON.parse(typeof message === "string" ? message : message.toString())
      if (parsed.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }))
      } else if (parsed.type === "ipc:send") {
        // Handle IPC emulator command
        handleIpcMessage(ws, parsed.channel, parsed.data)
      }
    } catch {}
  },

  close(ws: ServerWebSocket<any>) {
    clients.delete(ws)
  }
}

async function handleIpcMessage(ws: ServerWebSocket<any>, channel: string, data: any) {
  if (channel === "get-system-info") {
    const stats = await getSystemStats()
    ws.send(JSON.stringify({ type: "ipc:reply", channel, data: stats }))
  } else {
    ws.send(JSON.stringify({ type: "ipc:reply", channel, data: { success: true } }))
  }
}

// Broadcast system vitals to all connected clients every 2 seconds
setInterval(async () => {
  if (clients.size === 0) return
  try {
    const stats = await getSystemStats()
    const msg = JSON.stringify({ type: "telemetry:stream", data: stats })
    for (const ws of clients) {
      ws.send(msg)
    }
  } catch {}
}, 2000)

export function broadcastEvent(event: string, payload: any) {
  const msg = JSON.stringify({ type: "event", event, payload })
  for (const ws of clients) {
    ws.send(msg)
  }
}
