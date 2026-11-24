# NEXUS OS v5.0 — Sovereign Edge-to-Desktop AI Runtime 🌐⚡

[![Release](https://img.shields.io/badge/Release-v5.0.0-00F5D4?style=for-the-badge&logo=github&logoColor=black)](https://github.com/NiranX-Resolute/NEXUS-OS/releases/latest)
[![Downloads](https://img.shields.io/badge/Downloads-Hub%20v5.0-10B981?style=for-the-badge&logo=windows&logoColor=white)](https://nexus-landing.pages.dev/download)
[![License](https://img.shields.io/badge/License-MIT-38BDF8?style=for-the-badge)](LICENSE)
[![Zero-Subscription](https://img.shields.io/badge/Cost-100%25%20Free--Tier%20(Zero--Card)-A855F7?style=for-the-badge)](https://nexus-landing.pages.dev)
[![Memory](https://img.shields.io/badge/Idle%20RAM-0.00%20MB%20(Stackless)-F59E0B?style=for-the-badge)](https://nexus-status.pages.dev)

> **Architectural Mission:** A 100% free-tier, zero-subscription, zero-card sovereign intelligence runtime. Built on **local SQLite WAL**, sub-100ms **Win32 actuation**, and **0 MB idle execution slices** across an edge-to-desktop computing mesh.

---

## 🚀 Live Ecosystem Portals

| Portal | URL | Purpose |
| :--- | :--- | :--- |
| **Official Landing Portal** | [nexus-landing.pages.dev](https://nexus-landing.pages.dev) | 3D Spatial Glass showcase, architectural manifesto & feature grid |
| **Dedicated Download Hub** | [nexus-landing.pages.dev/download](https://nexus-landing.pages.dev/download) | OS auto-detection, SHA-256 verification badges, 1-command installer scripts |
| **GitHub Flagship Repository**| [github.com/NiranX-Resolute/NEXUS-OS](https://github.com/NiranX-Resolute/NEXUS-OS) | Core 7-tier v5.0 codebase, GitHub Releases & issue tracker |
| **Skill & Agent Marketplace** | [nexus-skills.pages.dev](https://nexus-skills.pages.dev) | Discover, audit with AgentShield, and 1-click install `.nxskill` bundles |
| **System Diagnostics & Status**| [nexus-status.pages.dev](https://nexus-status.pages.dev) | 24-component live status matrix, latency telemetry & watchdog timeline |

---

## 📦 Cross-Platform Release Binaries

All binaries are cryptographically signed with SHA-256 digests published in [SHA256SUMS.txt](https://github.com/NiranX-Resolute/NEXUS-OS/releases/latest/download/SHA256SUMS.txt).

### 1. Windows (x64)
- **NSIS Setup Installer:** [`NEXUS-OS-v5.0-Setup.exe`](https://github.com/NiranX-Resolute/NEXUS-OS/releases/latest/download/NEXUS-OS-v5.0-Setup.exe) (185 MB)
- **Portable Binary:** [`NEXUS-OS-v5.0-Windows-Portable.exe`](https://github.com/NiranX-Resolute/NEXUS-OS/releases/latest/download/NEXUS-OS-v5.0-Windows-Portable.exe) (142 MB)
- **PowerShell 1-Liner:**
  ```powershell
  irm https://nexus-landing.pages.dev/install.ps1 | iex
  ```

### 2. Linux (x86_64)
- **Raw Disk Image (Bare Metal/VM):** [`NEXUS-OS-v5.0-Linux-x86_64.img`](https://github.com/NiranX-Resolute/NEXUS-OS/releases/latest/download/NEXUS-OS-v5.0-Linux-x86_64.img) (512 MB ext4)
- **ISO-9660 Boot Image:** [`NEXUS-OS-v5.0-Linux-x86_64.iso`](https://github.com/NiranX-Resolute/NEXUS-OS/releases/latest/download/NEXUS-OS-v5.0-Linux-x86_64.iso) (380 MB)
- **Standalone AppImage:** [`NEXUS-OS-v5.0-x86_64.AppImage`](https://github.com/NiranX-Resolute/NEXUS-OS/releases/latest/download/NEXUS-OS-v5.0-x86_64.AppImage) (160 MB)
- **Shell 1-Liner:**
  ```bash
  curl -fsSL https://nexus-landing.pages.dev/install.sh | bash
  ```

### 3. macOS (Universal: Apple Silicon & Intel)
- **Universal DMG Installer:** [`NEXUS-OS-v5.0-macOS-Universal.dmg`](https://github.com/NiranX-Resolute/NEXUS-OS/releases/latest/download/NEXUS-OS-v5.0-macOS-Universal.dmg) (195 MB)
- **Application Bundle Zip:** [`NEXUS-OS-v5.0-macOS.app.zip`](https://github.com/NiranX-Resolute/NEXUS-OS/releases/latest/download/NEXUS-OS-v5.0-macOS.app.zip) (190 MB)

---

## 🏛️ System Architecture

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 1. EDGE PORTAL MESH (Cloudflare Pages Anycast CDN • Zero Cloud Egress)                 │
│    - web/landing/      -> https://nexus-landing.pages.dev (/ & /download)              │
│    - web/marketplace/  -> https://nexus-skills.pages.dev  (314 .nxskill bundles)      │
│    - web/status/       -> https://nexus-status.pages.dev  (24 Subsystem Diagnostics)   │
│    - functions/api/    -> Cloudflare Pages Serverless Edge Functions (D1 + KV)         │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼ (WebSocket / Bearer IPC on 127.0.0.1:47630)
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 2. CORE RUNTIME SUPERVISOR (`nexus.py` Master Entrypoint on WinSta0\Default)           │
│    ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌───────────────────────┐  │
│    │    DEV-01     │  │    SYS-01     │  │   SCOUT-01    │  │    SEC-01 / OPS-01    │  │
│    │  Synthesizer  │  │  Win32 Hook   │  │  Vision UIA   │  │ DPAPI & Edge Router   │  │
│    └───────┬───────┘  └───────┬───────┘  └───────┬───────┘  └───────────┬───────────┘  │
│            └──────────────────┴───────────┬──────┴──────────────────────┘              │
│                                           ▼                                            │
│    - ScopeGuard (6 GRAVITAS Invariants, Engagement Boundaries, Path Containment)       │
│    - WorkspaceGovernor ([DEV], [STUDY], [STUDIO], [SILENT] Zero-Idle Air-Gap)         │
│    - Local DPAPI Credential Vault (`core/security/vault.py`)                           │
│    - Local SQLite WAL Database (`~/.nexus-agent/db/agent_local.db` + FTS5 + Vec)      │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 3. DESKTOP CLIENT SUITE (`apps/`)                                                      │
│    - apps/desktop/        -> Electron-Vite Glassmorphic Workstation                    │
│    - apps/command_center/ -> Fast React 19 / Bun Swarm Operations Bay                  │
│    - apps/notch_hud/      -> Native Win32 Dynamic Island Notch & Shelf (PySide6)       │
│    - apps/tauri/          -> Ultra-lightweight Rust Native Surface                     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ Quickstart

### Prerequisites
- Python 3.11+
- Node.js 20+ & Bun (optional)
- Windows 10/11, Linux (kernel 5.4+), or macOS 12+

### Single Command Boot
The system starts through a single master entrypoint with zero flags:

```bash
# Clone the repository
git clone https://github.com/NiranX-Resolute/NEXUS-OS.git
cd NEXUS-OS

# Install dependencies
pip install -e .

# Launch NEXUS OS Master Supervisor
python nexus.py
```

---

## 📂 7-Tier Monorepo Workspace Structure

```
.
├── apps/               # Desktop & Client Runtimes
│   ├── desktop/        # Electron-Vite 27-View Desktop Workstation
│   ├── command_center/ # Bun + React 19 Swarm Operations Bay
│   ├── notch_hud/      # PySide6 Win32 Dynamic Notch Island
│   └── tauri/          # Rust Tauri Native Surface
├── web/                # Cloudflare Edge Micro-Frontends
│   ├── landing/        # Spatial Glass Landing Portal & /download Hub
│   ├── marketplace/    # .nxskill Storefront & Package Creator
│   ├── status/         # 24-Component Real-Time System Matrix
│   ├── dashboard/      # Web Control & Orchestration Dashboard
│   ├── admin/          # Edge Admin Console
│   ├── auth/           # Sovereign Auth Flow
│   └── control/        # Remote Task Dispatch Portal
├── core/               # Autonomous Engine & System Daemons
│   ├── runtime/        # IPC Server (:47630), Hardware, LLM/Reflex Routers
│   ├── security/       # Windows DPAPI & AES-256-GCM Vault
│   ├── memory/         # Sovereign SQLite WAL, FTS5 & Vector Store
│   ├── bridge/         # Voice Guardian & Persona Engine
│   └── agents/         # Dynamic Swarm Mitosis & Orchestration
├── functions/          # Cloudflare Pages Serverless Edge Routes
│   └── api/            # Edge Status & Compute Proxy
├── scripts/            # Build, Release & Verification Automation
│   ├── build_all_releases.py  # Master Cross-Platform Release Orchestrator
│   └── builders/       # Windows, Linux (.img/.iso), macOS Builders
├── docs/               # Architecture Specs & Visuals
└── tests/              # End-to-End Verification Test Suite
```

---

## 🔒 Verification & Quality Guardrails

Every commit and release is mechanically verified against the following invariants:
1. **Zero-Stub Law:** `python scripts/grep_check.py` returns 0 findings (no `TODO`, `FIXME`, or `pass`).
2. **Deterministic Tests:** `pytest tests/ -v` passes 100%.
3. **TypeScript Build:** `npm --prefix web/landing run build` and `npm --prefix apps/desktop run typecheck:web` pass with 0 errors.
4. **Data Sovereignty:** All credentials encrypted in DPAPI under `~/.nexus-agent/db/vault.db`.

---

## 👤 Author & Architecture

**Architect:** Niranjan Barhate ([NiranX-Resolute](https://github.com/NiranX-Resolute))  
**Agent Engine:** Nexdune (powered by Antigravity)  
**Organization:** Nexus Technology  
**License:** MIT
