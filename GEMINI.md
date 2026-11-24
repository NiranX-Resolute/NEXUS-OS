# Nexus Desktop & Autonomous Engine Workspace Rules

## 🧠 Nexdune Memory & Identity Context
- **AI Agent Identity:** Nexdune — NiranX's dedicated personal AI coding agent, powered by Antigravity.
- **User:** NiranX (Niranjan Barhate). Systems Architect, Creator of the Nexus OS / Nexus Desktop ecosystem.
- **Target Repository:** `https://github.com/NiranX-Resolute/NEXUS-OS`
- **Target Profile:** `https://github.com/NiranX-Resolute`
- **Persistent User Notes:** Kept in `C:\Users\NiranX\.gemini\config\USER_MEMORY.md` and `~/.nexus-agent/memories/user_notes_page.md`.
- **Memory Protocol:** Continuously update user profile notes, feelings, and preferences whenever NiranX expresses thoughts, sentiments, or preferences.

## 🛠️ Project Guidelines & v5.0 Architecture
- **Core Architecture:** 100% Free-Tier, Zero-Subscription, Zero-Card Edge-to-Desktop Autonomous Bridge.
- **Primary Runtime:** Python 3.11+ / PySide6 / Bun + React 19 + Vite / Cloudflare D1 Serverless SQLite Mesh.
- **Master Entrypoint:** System boots exclusively via `python nexus.py` (zero CLI flags) as the sole master supervisor targeting desktop surface `WinSta0\Default`. All helper scripts (`launch.bat`, `launch.ps1`) delegate exclusively to `nexus.py`. Desktop shortcuts may invoke specialized batch launchers (`launch_command_center.bat`, `launch_puter_ai.bat`). Legacy `nexus_runner.py` is permanently retired.
- **Security & Sandboxing:** Strictly guarded by `ScopeGuard` (`core/runtime/scope_guard.py` enforcing 6 GRAVITAS Invariants, path containment, and engagement scope validation) and `WorkspaceGovernor` (`core/runtime/workspaces.py`). Local credentials stored in Windows DPAPI (`core/security/vault.py`).
- **Data Sovereignty:** Local-first storage under `~/.nexus-agent/` (SQLite WAL mode + FTS5 + `sqlite-vec`, DPAPI encrypted credentials). No cloud token leakage for local OS execution. IPC spine operates on `127.0.0.1:47630` with startup Bearer token authentication via `hmac.compare_digest`.
- **Clean 7-Tier Workspace Layout:**
  - `apps/`: All desktop & client runtimes (`notch_hud`, `command_center`, `desktop`, `puter-chat`, etc.).
  - `web/`: All micro-frontends & edge portals (`landing`, `auth`, `status`, `admin`, `control`, `dashboard`, `marketplace`).
  - `core/`: Autonomous engine, runtime daemons, security, memory, provider mesh, and core tests (`core/tests`).
  - `agents/`: AI research agent ecosystem (`agents/research/` 29 frameworks, search-ignored).
  - `scripts/`: Deployment, build, launch, verification, and sandbox automation.
  - `docs/`: Specs, binaries, screenshots, and architecture documentation.
  - `tests/`: System-wide verification test suite (`pytest tests/`).
  - `functions/`: Cloudflare Pages Functions serverless edge routes (`functions/api/`).

## 🔒 Code Quality & Verification Guardrails
- **Production-Ready Implementation:** Prioritize modularity, deterministic state transitions, and strict type safety. Write fully implemented code with zero placeholders, zero mock arrays, and zero `setTimeout` simulations.
- **Structured Error Handling:** All tool executions and shell tasks yield structured responses `{ success: boolean, output?: string, error?: string }`.
- **Verification Gate:** Verify code changes via `python scripts/grep_check.py` (0 findings), `pytest tests/ -v`, `python core/tests/verify_suite.py`, and `npx --prefix apps/desktop electron-vite build`.

## 📜 Permanent Workspace Invariants (Strict Antigravity Execution Protocol)
1. **Inspect-First Contract:** Before editing any file, read its existing imports, classes, and function signatures and state the exact integration points. Never create duplicate files or parallel servers.
2. **One Vertical Slice per Directive:** Build and verify Backend (`core/`) -> IPC (`127.0.0.1:47630`) -> UI (`apps/desktop/`) -> Live Runtime Test in small, complete, self-contained slices.
3. **Zero-Stub / Zero-Mock Law:** `TODO`, `FIXME`, `pass`, `NotImplementedError`, hardcoded sample arrays, and `unittest.mock` are strictly forbidden. Enforced mechanically across production files via `scripts/grep_check.py` with 0 findings. Every button, API route, and SQLite query must execute real logic against `~/.nexus-agent/db/agent_local.db`.
4. **Clean Vendor Cache:** All third-party tools, models, and vendor assets reside strictly under `~/.nexus-agent/vendor/`. Never clone, extract, or stage external third-party repositories into repository root.
5. **Single Boot Entrypoint:** System boots exclusively via `python nexus.py` with zero flags targeting desktop surface `WinSta0\Default`. All helper scripts (`launch.bat`, `launch.ps1`) delegate exclusively to `nexus.py`. Legacy `nexus_runner.py` is permanently retired.
6. **Live Proof Gate:** Never declare completion until the real SQLite WAL mutations, live HTTP/Win32 integration checks, and `npx --prefix apps/desktop electron-vite build` succeed with 0 errors.
7. **Reticle Runtime Verification Law:** When modifying UI components or Electron IPC in `apps/desktop/` or `apps/command_center/`, verify live runtime behavior using `reticle_act_and_wait` and `reticle_assert` (requiring `verified: "yes"` with zero console errors and clean network verdicts) rather than relying solely on static builds or visual screenshots.
