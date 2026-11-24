"""
Nexus Sovereign Website Generation & Publishing Engine
=============================================================================
Provides full-stack website generation, project scaffolding, and publishing:
1. Production Code Generation: Modern responsive HTML5, Tailwind, and JS
2. Scaffolding: Generates clean project directories (index.html, style.css, app.js, wrangler.toml)
3. One-Click Preview: Headless local HTTP server with automatic browser launch
4. Deployment Ready: Pre-configured for Cloudflare Pages (wrangler) & Puter.com
=============================================================================
"""

import os
import sys
import re
import json
import time
import zipfile
import threading
import webbrowser
import http.server
import socketserver
from typing import Dict, Any, List, Optional


class NexusSiteGenerator:
    """Generates complete responsive websites and scaffolding."""

    DEFAULT_OUTPUT_BASE = os.path.join(os.path.expanduser("~"), ".nexus-agent", "websites")

    @classmethod
    def generate_website(
        cls,
        prompt: str,
        title: Optional[str] = None,
        style: str = "futuristic",
        output_dir: Optional[str] = None
    ) -> Dict[str, Any]:
        """Generates a complete, modern responsive website project structure."""
        clean_title = title or re.sub(r"[^\w\s]", "", prompt.split(".")[0]).strip()[:36] or "Nexus Generated Site"
        slug = re.sub(r"[^\w\-]", "_", clean_title.lower()).strip("_")
        project_dir = output_dir or os.path.join(cls.DEFAULT_OUTPUT_BASE, f"{slug}_{int(time.time())}")
        os.makedirs(project_dir, exist_ok=True)

        # Style palette definitions
        is_cyberpunk = style.lower() == "cyberpunk"
        theme_bg = "#090d16" if not is_cyberpunk else "#050508"
        accent_color = "#38bdf8" if not is_cyberpunk else "#00ffcc"
        accent_glow = "rgba(56, 189, 248, 0.4)" if not is_cyberpunk else "rgba(0, 255, 204, 0.5)"

        # 1. Generate index.html
        html_content = f"""<!DOCTYPE html>
<html lang="en" class="dark scroll-smooth">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{clean_title} | Created with Nexus OS</title>
  <meta name="description" content="{prompt[:150]}">
  <!-- Tailwind CSS CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {{
      darkMode: 'class',
      theme: {{
        extend: {{
          colors: {{
            nexus: {{
              bg: '{theme_bg}',
              accent: '{accent_color}',
              card: 'rgba(255, 255, 255, 0.03)'
            }}
          }}
        }}
      }}
    }}
  </script>
  <!-- Lucide Icons -->
  <script src="https://unpkg.com/lucide@latest"></script>
  <link rel="stylesheet" href="style.css">
</head>
<body class="bg-nexus-bg text-slate-100 min-h-screen flex flex-col font-sans selection:bg-cyan-500 selection:text-black">

  <!-- Navigation -->
  <header class="border-b border-white/10 sticky top-0 bg-nexus-bg/80 backdrop-blur-md z-50">
    <div class="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-cyan-500/20">
          N
        </div>
        <span class="font-bold tracking-tight text-lg text-white">{clean_title}</span>
      </div>
      <nav class="hidden md:flex items-center gap-6 text-sm text-slate-400">
        <a href="#features" class="hover:text-cyan-400 transition">Features</a>
        <a href="#about" class="hover:text-cyan-400 transition">About</a>
        <a href="#contact" class="hover:text-cyan-400 transition">Contact</a>
      </nav>
      <button onclick="triggerDemo()" class="px-4 py-2 text-xs font-semibold rounded-full bg-cyan-500 hover:bg-cyan-400 text-black transition shadow-md shadow-cyan-500/20">
        Get Started
      </button>
    </div>
  </header>

  <!-- Hero Section -->
  <main class="flex-1">
    <section class="max-w-6xl mx-auto px-6 pt-24 pb-16 text-center">
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 text-xs font-medium mb-6 animate-pulse">
        <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
        <span>Autonomous Edge-to-Desktop Engine</span>
      </div>
      <h1 class="text-4xl md:text-6xl font-extrabold tracking-tight text-white mb-6 leading-tight max-w-4xl mx-auto">
        Next-Generation Web Experience for <span class="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-300 to-indigo-400">{clean_title}</span>
      </h1>
      <p class="text-base md:text-lg text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
        {prompt}
      </p>
      <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
        <button onclick="triggerAction('launch')" class="w-full sm:w-auto px-8 py-3.5 rounded-xl font-semibold bg-cyan-500 hover:bg-cyan-400 text-black transition flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/25">
          <span>Explore Now</span>
          <i data-lucide="arrow-right" class="w-4 h-4"></i>
        </button>
        <button onclick="triggerAction('docs')" class="w-full sm:w-auto px-8 py-3.5 rounded-xl font-semibold border border-white/10 hover:bg-white/5 text-slate-300 transition flex items-center justify-center gap-2">
          <i data-lucide="book-open" class="w-4 h-4"></i>
          <span>Read Documentation</span>
        </button>
      </div>
    </section>

    <!-- Features Grid -->
    <section id="features" class="max-w-6xl mx-auto px-6 py-20 border-t border-white/5">
      <div class="text-center mb-16">
        <h2 class="text-3xl font-bold text-white mb-3">Architected for Speed & Sovereignty</h2>
        <p class="text-slate-400 text-sm max-w-xl mx-auto">Engineered with modern frontend components, dynamic UI reactivity, and clean zero-dependency design.</p>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="p-6 rounded-2xl bg-white/[0.02] border border-white/10 hover:border-cyan-500/50 transition duration-300 group">
          <div class="w-12 h-12 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center mb-4 group-hover:scale-110 transition">
            <i data-lucide="zap" class="w-6 h-6"></i>
          </div>
          <h3 class="text-lg font-semibold text-white mb-2">Instant Response</h3>
          <p class="text-sm text-slate-400 leading-relaxed">Optimized for sub-millisecond interactivity with minimal DOM thrashing and zero cloud bundle bloat.</p>
        </div>
        <div class="p-6 rounded-2xl bg-white/[0.02] border border-white/10 hover:border-cyan-500/50 transition duration-300 group">
          <div class="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-4 group-hover:scale-110 transition">
            <i data-lucide="shield-check" class="w-6 h-6"></i>
          </div>
          <h3 class="text-lg font-semibold text-white mb-2">100% Data Sovereignty</h3>
          <p class="text-sm text-slate-400 leading-relaxed">Runs locally or edge-deployed with zero tracking, zero telemetry leakage, and strict user privacy.</p>
        </div>
        <div class="p-6 rounded-2xl bg-white/[0.02] border border-white/10 hover:border-cyan-500/50 transition duration-300 group">
          <div class="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-4 group-hover:scale-110 transition">
            <i data-lucide="cpu" class="w-6 h-6"></i>
          </div>
          <h3 class="text-lg font-semibold text-white mb-2">Edge & Cloud Ready</h3>
          <p class="text-sm text-slate-400 leading-relaxed">Deploy in seconds to Cloudflare Pages or Puter.com with included zero-config manifests.</p>
        </div>
      </div>
    </section>

    <!-- Interactive Interactive Console / Demo -->
    <section class="max-w-4xl mx-auto px-6 py-16">
      <div class="p-8 rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent shadow-2xl">
        <div class="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 rounded-full bg-rose-500"></div>
            <div class="w-3 h-3 rounded-full bg-amber-500"></div>
            <div class="w-3 h-3 rounded-full bg-emerald-500"></div>
            <span class="text-xs text-slate-500 ml-2 font-mono">nexus-preview-console</span>
          </div>
          <span id="status-badge" class="px-2.5 py-0.5 rounded-full text-xs font-mono bg-emerald-500/10 text-emerald-400">READY</span>
        </div>
        <div id="output-box" class="font-mono text-sm text-slate-300 space-y-2 h-36 overflow-y-auto bg-black/40 p-4 rounded-xl border border-white/5">
          <p class="text-cyan-400">&gt; Initializing {clean_title} engine...</p>
          <p class="text-slate-400">&gt; UI loaded successfully with Tailwind &amp; Lucide Icons.</p>
          <p class="text-slate-500">&gt; Ready for user commands.</p>
        </div>
        <div class="mt-4 flex gap-3">
          <input type="text" id="cmd-input" placeholder="Enter command or task..." class="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 font-mono">
          <button onclick="handleCmd()" class="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold rounded-xl text-sm transition">Run</button>
        </div>
      </div>
    </section>
  </main>

  <!-- Footer -->
  <footer class="border-t border-white/10 py-10 bg-black/40 text-center text-xs text-slate-500">
    <p>Generated autonomously by <strong>Nexus OS &amp; Nexdune</strong>. Sovereign Free-Tier Edge Architecture.</p>
  </footer>

  <script src="app.js"></script>
  <script>lucide.createIcons();</script>
</body>
</html>
"""
        with open(os.path.join(project_dir, "index.html"), "w", encoding="utf-8") as f:
            f.write(html_content)

        # 2. Generate style.css
        css_content = f"""/* Custom Glassmorphism and Neon Accents */
:root {{
  --accent-glow: {accent_glow};
}}

body {{
  background-color: {theme_bg};
}}

::-webkit-scrollbar {{
  width: 6px;
}}
::-webkit-scrollbar-track {{
  background: rgba(0, 0, 0, 0.2);
}}
::-webkit-scrollbar-thumb {{
  background: rgba(255, 255, 255, 0.15);
  border-radius: 9999px;
}}
::-webkit-scrollbar-thumb:hover {{
  background: rgba(56, 189, 248, 0.5);
}}
"""
        with open(os.path.join(project_dir, "style.css"), "w", encoding="utf-8") as f:
            f.write(css_content)

        # 3. Generate app.js
        js_content = """// Interactive Client Controls
function triggerDemo() {
  const box = document.getElementById('output-box');
  const line = document.createElement('p');
  line.className = 'text-cyan-400';
  line.textContent = `> [ACTION] Get Started triggered. Initializing runtime module...`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

function triggerAction(actionName) {
  const box = document.getElementById('output-box');
  const line = document.createElement('p');
  line.className = 'text-emerald-400';
  line.textContent = `> Action triggered: ${actionName.toUpperCase()}`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

function handleCmd() {
  const input = document.getElementById('cmd-input');
  const text = input.value.trim();
  if (!text) return;

  const box = document.getElementById('output-box');
  const userLine = document.createElement('p');
  userLine.className = 'text-white font-bold';
  userLine.textContent = `user@nexus:~$ ${text}`;
  box.appendChild(userLine);

  const respLine = document.createElement('p');
  respLine.className = 'text-cyan-300';
  respLine.textContent = `> Executing "${text}" [Success: 200 OK]`;
  box.appendChild(respLine);

  input.value = '';
  box.scrollTop = box.scrollHeight;
}

document.getElementById('cmd-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleCmd();
});
"""
        with open(os.path.join(project_dir, "app.js"), "w", encoding="utf-8") as f:
            f.write(js_content)

        # 4. Generate wrangler.toml (Cloudflare Pages deployment)
        wrangler_content = f"""name = "{slug}"
compatibility_date = "2026-10-01"
pages_build_output_dir = "."
"""
        with open(os.path.join(project_dir, "wrangler.toml"), "w", encoding="utf-8") as f:
            f.write(wrangler_content)

        # 5. Generate package.json
        pkg_content = {
            "name": slug,
            "version": "1.0.0",
            "description": f"Generated website for {clean_title}",
            "scripts": {
                "start": "npx serve .",
                "deploy": "npx wrangler pages deploy ."
            }
        }
        with open(os.path.join(project_dir, "package.json"), "w", encoding="utf-8") as f:
            json.dump(pkg_content, f, indent=2)

        return {
            "success": True,
            "title": clean_title,
            "project_directory": project_dir,
            "entrypoint": os.path.join(project_dir, "index.html"),
            "files": ["index.html", "style.css", "app.js", "wrangler.toml", "package.json"],
            "message": f"Website project successfully generated at: {project_dir}"
        }

    @classmethod
    def preview_website(cls, project_dir: str, port: int = 8780) -> Dict[str, Any]:
        """Runs a lightweight local HTTP server and opens site in default browser."""
        abs_dir = os.path.abspath(os.path.expanduser(project_dir))
        if not os.path.exists(os.path.join(abs_dir, "index.html")):
            return {"success": False, "error": f"index.html not found in {project_dir}"}

        def _serve():
            class Handler(http.server.SimpleHTTPRequestHandler):
                def __init__(self, *args, **kwargs):
                    super().__init__(*args, directory=abs_dir, **kwargs)

                def log_message(self, format, *args):
                    pass  # Silent

            # Find open port
            p = port
            for attempt in range(10):
                try:
                    with socketserver.TCPServer(("", p), Handler) as httpd:
                        httpd.serve_forever()
                    break
                except OSError:
                    p += 1

        t = threading.Thread(target=_serve, daemon=True)
        t.start()
        time.sleep(0.4)

        url = f"http://localhost:{port}/index.html"
        webbrowser.open(url)

        return {
            "success": True,
            "url": url,
            "project_directory": abs_dir,
            "message": f"Website live preview opened at {url}"
        }

    @classmethod
    def export_archive(cls, project_dir: str) -> Dict[str, Any]:
        """Zips website project for one-click deployment or upload."""
        abs_dir = os.path.abspath(os.path.expanduser(project_dir))
        if not os.path.exists(abs_dir):
            return {"success": False, "error": f"Directory not found: {project_dir}"}

        zip_path = f"{abs_dir}.zip"
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
            for root, _, files in os.walk(abs_dir):
                for f in files:
                    file_path = os.path.join(root, f)
                    arcname = os.path.relpath(file_path, abs_dir)
                    zipf.write(file_path, arcname)

        return {
            "success": True,
            "zip_path": zip_path,
            "size_bytes": os.path.getsize(zip_path),
            "message": f"Exported website archive: {zip_path}"
        }
