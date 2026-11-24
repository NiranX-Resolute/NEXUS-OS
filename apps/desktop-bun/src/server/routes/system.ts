import os from "os"
import { db } from "../db"

export interface SystemStats {
  platform: string
  arch: string
  hostname: string
  uptimeSeconds: number
  cpu: {
    model: string
    cores: number
    speed: number
    loadAvg: number[]
  }
  memory: {
    totalBytes: number
    freeBytes: number
    usedBytes: number
    usedPercent: number
  }
  battery?: {
    hasBattery: boolean
    percent: number
    isCharging: boolean
  }
  network: {
    interfaces: Record<string, any>
  }
  timestamp: string
}

export async function getSystemStats(): Promise<SystemStats> {
  const cpus = os.cpus()
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const usedMem = totalMem - freeMem
  const usedPercent = Math.round((usedMem / totalMem) * 100)

  // Query native Windows battery & disk if on win32 via Bun.spawn
  let batteryInfo = {
    hasBattery: false,
    percent: 100,
    isCharging: true
  }

  if (process.platform === "win32") {
    try {
      const proc = Bun.spawn([
        "powershell.exe",
        "-NoProfile",
        "-Command",
        "Get-CimInstance -ClassName Win32_Battery | Select-Object -Property EstimatedChargeRemaining, BatteryStatus | ConvertTo-Json"
      ], { stdout: "pipe", stderr: "ignore" })

      const text = await new Response(proc.stdout).text()
      if (text.trim()) {
        const parsed = JSON.parse(text)
        batteryInfo = {
          hasBattery: true,
          percent: parsed.EstimatedChargeRemaining ?? 100,
          isCharging: parsed.BatteryStatus === 2 || parsed.BatteryStatus === 6
        }
      }
    } catch {
      // Non-laptop or desktop machine
    }
  }

  const stats: SystemStats = {
    platform: os.platform(),
    arch: os.arch(),
    hostname: os.hostname(),
    uptimeSeconds: Math.floor(os.uptime()),
    cpu: {
      model: cpus[0]?.model || "Generic CPU",
      cores: cpus.length,
      speed: cpus[0]?.speed || 0,
      loadAvg: os.loadavg()
    },
    memory: {
      totalBytes: totalMem,
      freeBytes: freeMem,
      usedBytes: usedMem,
      usedPercent
    },
    battery: batteryInfo,
    network: {
      interfaces: os.networkInterfaces()
    },
    timestamp: new Date().toISOString()
  }

  // Record periodic telemetry to SQLite
  try {
    db.run(
      "INSERT INTO telemetry_history (cpu_percent, memory_used_mb, memory_total_mb, battery_percent) VALUES (?, ?, ?, ?)",
      [
        stats.memory.usedPercent, // proxy or load
        Math.round(usedMem / (1024 * 1024)),
        Math.round(totalMem / (1024 * 1024)),
        batteryInfo.percent
      ]
    )
  } catch {}

  return stats
}

export function handleSystemRoutes(req: Request, url: URL): Response | Promise<Response> | null {
  if (url.pathname === "/api/system/info" && req.method === "GET") {
    return getSystemStats().then((data) => Response.json(data))
  }

  if (url.pathname === "/api/system/history" && req.method === "GET") {
    const history = db.query(
      "SELECT * FROM telemetry_history ORDER BY id DESC LIMIT 50"
    ).all()
    return Response.json({ success: true, history })
  }

  return null
}
