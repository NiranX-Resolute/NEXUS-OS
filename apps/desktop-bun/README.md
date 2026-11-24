# Nexus AI Sovereign Desktop Workstation (Bun Edition) ⚡🌐

> **Principal Architecture:** 100% Free-Tier, Zero-Subscription Sovereign Desktop Workstation re-engineered natively on **Bun.js (v1.4+)**, **bun:sqlite (WAL Mode)**, native WebSockets, and Edge-to-Desktop Autonomous Engine.

---

## 🏛️ System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│ 1. Frontend Client (React 19 + TypeScript + Tailwind CSS Cyber HUD)   │
│    - Sub-second build via Bun.build() into dist/                       │
│    - 10 Specialized Sovereign Views: Dashboard, AI Chat, Terminal,     │
│      Agentic Swarm, Interview Copilot, Whiteboard, Notes, Files, etc.  │
│    - Real-time WebSocket Telemetry & Universal IPC Bridge              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼ (HTTP / WebSockets)
┌────────────────────────────────────────────────────────────────────────┐
│ 2. Sovereign Bun Server Runtime (src/server/index.ts)                  │
│    - Bun.serve() native high-throughput HTTP & WebSocket engine        │
│    - bun:sqlite in-memory & WAL-mode pool (~/.nexus-agent/nexus_bun.db)│
│    - Bun.spawn() real-time shell executor                              │
│    - Bun.file() & Bun.write() zero-overhead filesystem I/O             │
│    - Multi-provider AI Gateway (Gemini 2.5/3.8, Puter AI, Groq, Ollama)│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 3. Standalone Native Executable & Desktop App Mode                     │
│    - Compiled Standalone Windows Binary: dist/Nexus-Bun.exe (115 MB)   │
│    - Automated Installer: install.ps1 -> %LOCALAPPDATA%\Programs\...   │
│    - Edge WebView2 borderless Desktop Application HUD                  │
│    - Desktop & Start Menu Shortcuts                                    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Launch & Execution

### 1. Run in Development Mode
```powershell
cd apps/desktop-bun
bun run dev
```

### 2. Build Frontend & Standalone Executable
```powershell
cd apps/desktop-bun
bun run build
bun build --compile --outfile=dist/Nexus-Bun.exe src/server/index.ts
```

### 3. Run Standalone Executable
Double-click `apps/desktop-bun/launch.bat` or run:
```powershell
.\launch.ps1
```

### 4. Install Standalone App System-Wide
```powershell
.\install.ps1 -LaunchAfterInstall
```
Installs directly to `%LOCALAPPDATA%\Programs\Nexus-Bun\` with Desktop and Start Menu shortcuts!

### 5. Run Verification Tests
```powershell
bun test
```
All 5 unit test suites verified passing with sub-millisecond execution times.
