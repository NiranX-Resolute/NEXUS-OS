import { join } from "path"
import { cpSync, mkdirSync, existsSync, writeFileSync } from "fs"

const distDir = join(import.meta.dir, "../dist")
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true })
}

console.log("⚡ Building Nexus Frontend with Bun.build()...")
const result = await Bun.build({
  entrypoints: [join(import.meta.dir, "client/main.tsx")],
  outdir: distDir,
  target: "browser",
  minify: true,
  naming: "[name].[ext]"
})

if (!result.success) {
  console.error("Build failed:", result.logs)
  process.exit(1)
}

// Copy styles
const stylesSrc = join(import.meta.dir, "client/styles/index.css")
const stylesDest = join(distDir, "index.css")
cpSync(stylesSrc, stylesDest)

// Generate distribution HTML
const htmlContent = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Nexus AI — Sovereign Bun Desktop Workstation</title>
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2310b981'><circle cx='12' cy='12' r='10'/></svg>" />
    <link rel="stylesheet" href="./index.css" />
    <link rel="stylesheet" href="./main.css" />
  </head>
  <body style="background-color: #09090b; margin: 0; padding: 0; overflow: hidden;">
    <div id="root"></div>
    <script type="module" src="./main.js"></script>
  </body>
</html>`

writeFileSync(join(distDir, "index.html"), htmlContent, "utf8")
console.log(`✅ Bun Frontend successfully built into ${distDir}`)
