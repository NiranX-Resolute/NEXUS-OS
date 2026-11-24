export async function handleTerminalRoutes(req: Request, url: URL): Promise<Response | null> {
  // POST /api/terminal/run
  if (url.pathname === "/api/terminal/run" && req.method === "POST") {
    try {
      const { command, cwd = process.cwd() } = await req.json()
      if (!command) {
        return Response.json({ success: false, error: "Command required" }, { status: 400 })
      }

      const isWin = process.platform === "win32"
      const shellCmd = isWin ? "powershell.exe" : "bash"
      const shellArgs = isWin
        ? ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command]
        : ["-c", command]

      const start = performance.now()
      const proc = Bun.spawn([shellCmd, ...shellArgs], {
        cwd,
        stdout: "pipe",
        stderr: "pipe"
      })

      const [stdoutText, stderrText] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text()
      ])

      const exitCode = await proc.exited
      const durationMs = Math.round(performance.now() - start)

      return Response.json({
        success: exitCode === 0,
        command,
        stdout: stdoutText,
        stderr: stderrText,
        exitCode,
        durationMs
      })
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500 })
    }
  }

  return null
}
