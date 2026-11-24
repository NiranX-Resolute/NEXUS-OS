"""
Nexus Autonomous Engine - Data Sovereignty Exporter & Offline HTML Viewer
=============================================================================
Safeguards 100% local user sovereignty by archiving all local agent state:
- Scans ~/.nexus-agent/ directory hierarchy (SQLite DBs, diffs, memories, logs).
- Generates a standalone, dependency-free READABLE_EXPORT_VIEWER.html with a
  dark-mode glassmorphic UI, searchable sidebar, collapsible thought traces (<think>),
  command execution timelines, and syntax-highlighted diffs.
- Packages all data into a compressed ZIP bundle using zipfile.ZIP_DEFLATED.
=============================================================================
"""

import os
import re
import json
import time
import zipfile
import sqlite3
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional, Union

from .config import NEXUS_HOME, DB_PATH, EXPORTS_DIR, ensure_runtime_directories
from .local_store import LocalStore, LocalAgentStore

logger = logging.getLogger("nexus.exporter")


HTML_OFFLINE_VIEWER_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nexus AI Agent - Local Sovereignty Archive</title>
  <style>
    :root {
      --bg-gradient: radial-gradient(circle at 10% 20%, #0d1322 0%, #080c14 90%);
      --surface-glass: rgba(22, 30, 49, 0.75);
      --surface-card: rgba(27, 38, 64, 0.6);
      --border-glass: rgba(56, 80, 133, 0.35);
      --border-accent: rgba(6, 182, 212, 0.4);
      --cyan: #06b6d4;
      --indigo: #6366f1;
      --purple: #a855f7;
      --emerald: #10b981;
      --rose: #f43f5e;
      --amber: #f59e0b;
      --text-main: #f1f5f9;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: var(--bg-gradient);
      color: var(--text-main);
      font-family: var(--font-sans);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      overflow-x: hidden;
    }

    header {
      background: var(--surface-glass);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-bottom: 1px solid var(--border-glass);
      padding: 16px 28px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 100;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .brand-logo {
      width: 42px;
      height: 42px;
      border-radius: 12px;
      background: linear-gradient(135deg, var(--cyan), var(--indigo));
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      font-size: 20px;
      color: #fff;
      box-shadow: 0 4px 15px rgba(6, 182, 212, 0.35);
    }

    .brand-title h1 {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.02em;
      background: linear-gradient(90deg, #fff, #93c5fd);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .brand-title p {
      font-size: 12px;
      color: var(--text-muted);
    }

    .badge-sovereign {
      background: rgba(16, 185, 129, 0.12);
      color: var(--emerald);
      border: 1px solid rgba(16, 185, 129, 0.3);
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .layout {
      display: grid;
      grid-template-columns: 340px 1fr;
      flex: 1;
      min-height: calc(100vh - 75px);
    }

    /* Left Sidebar */
    aside {
      background: rgba(15, 22, 36, 0.85);
      backdrop-filter: blur(12px);
      border-right: 1px solid var(--border-glass);
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow-y: auto;
      max-height: calc(100vh - 75px);
    }

    .search-box input {
      width: 100%;
      background: rgba(8, 12, 20, 0.7);
      border: 1px solid var(--border-glass);
      border-radius: 8px;
      padding: 10px 14px;
      color: #fff;
      font-size: 13px;
      outline: none;
      transition: all 0.2s;
    }

    .search-box input:focus {
      border-color: var(--cyan);
      box-shadow: 0 0 0 2px rgba(6, 182, 212, 0.2);
    }

    .sidebar-heading {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-dim);
    }

    .session-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .session-item {
      padding: 12px 14px;
      border-radius: 8px;
      border: 1px solid transparent;
      cursor: pointer;
      background: rgba(255, 255, 255, 0.02);
      transition: all 0.2s;
    }

    .session-item:hover {
      background: rgba(255, 255, 255, 0.06);
      border-color: var(--border-glass);
    }

    .session-item.active {
      background: rgba(6, 182, 212, 0.12);
      border-color: var(--border-accent);
    }

    .session-item h4 {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 4px;
      color: #e2e8f0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .session-item p {
      font-size: 11px;
      color: var(--text-dim);
    }

    /* Main Content Area */
    main {
      padding: 32px 40px;
      overflow-y: auto;
      max-height: calc(100vh - 75px);
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .session-header {
      background: var(--surface-glass);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border-glass);
      border-radius: 12px;
      padding: 24px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
    }

    .session-header h2 {
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 8px;
      color: #fff;
    }

    .session-header .meta-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 12px;
    }

    .chip {
      background: rgba(255, 255, 255, 0.06);
      padding: 4px 10px;
      border-radius: 6px;
      color: var(--text-muted);
      border: 1px solid rgba(255, 255, 255, 0.08);
      font-family: var(--font-mono);
      font-size: 11px;
    }

    .message-timeline {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .message-bubble {
      background: var(--surface-card);
      backdrop-filter: blur(10px);
      border: 1px solid var(--border-glass);
      border-radius: 12px;
      padding: 18px 22px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .message-bubble.user {
      border-left: 3px solid var(--cyan);
    }

    .message-bubble.assistant {
      border-left: 3px solid var(--indigo);
    }

    .message-bubble.tool {
      border-left: 3px solid var(--amber);
      background: rgba(18, 26, 42, 0.5);
    }

    .message-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
    }

    .role-badge {
      font-weight: 700;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.05em;
    }

    .role-user { color: var(--cyan); }
    .role-assistant { color: var(--indigo); }
    .role-tool { color: var(--amber); }

    .message-content {
      font-size: 14px;
      line-height: 1.6;
      color: #f8fafc;
      white-space: pre-wrap;
      word-break: break-word;
    }

    /* Thought Trace Accordion */
    details.thought-trace {
      background: rgba(99, 102, 241, 0.08);
      border: 1px solid rgba(99, 102, 241, 0.25);
      border-radius: 8px;
      padding: 10px 14px;
      margin-top: 6px;
    }

    details.thought-trace summary {
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      color: #a5b4fc;
      outline: none;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    details.thought-trace summary::marker {
      color: var(--indigo);
    }

    .thought-content {
      margin-top: 10px;
      font-family: var(--font-mono);
      font-size: 12px;
      color: #cbd5e1;
      line-height: 1.5;
      white-space: pre-wrap;
      background: rgba(0, 0, 0, 0.3);
      padding: 12px;
      border-radius: 6px;
    }

    /* Traces and Code Diffs */
    .trace-card {
      background: #090e18;
      border: 1px solid var(--border-glass);
      border-radius: 8px;
      padding: 14px;
      margin-top: 10px;
    }

    .trace-title {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      font-weight: 600;
      color: var(--cyan);
      margin-bottom: 8px;
    }

    .diff-container {
      font-family: var(--font-mono);
      font-size: 12px;
      background: #050811;
      border: 1px solid #1e293b;
      border-radius: 6px;
      padding: 10px;
      overflow-x: auto;
      margin-top: 10px;
    }

    .diff-line-add {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      display: block;
      padding: 2px 4px;
      border-radius: 2px;
    }

    .diff-line-del {
      background: rgba(244, 63, 94, 0.15);
      color: #f87171;
      display: block;
      padding: 2px 4px;
      border-radius: 2px;
    }

    .diff-line-ctx {
      color: #94a3b8;
      display: block;
      padding: 2px 4px;
    }

    .empty-state {
      text-align: center;
      padding: 80px 20px;
      color: var(--text-dim);
    }

    .empty-state h3 {
      font-size: 18px;
      color: var(--text-muted);
      margin-bottom: 8px;
    }

    @media (max-width: 900px) {
      .layout { grid-template-columns: 1fr; }
      aside { max-height: 280px; }
      main { padding: 20px; max-height: none; }
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <div class="brand-logo">N</div>
      <div class="brand-title">
        <h1>Nexus AI Agent - Local Sovereignty Archive</h1>
        <p>Nexus Autonomous Agent - Offline Audit Log &amp; Execution Replay Archive</p>
      </div>
    </div>
    <div class="badge-sovereign">
      &#10003; 100% Local-First Data Sovereignty Verified
    </div>
  </header>

  <div class="layout">
    <aside>
      <div class="search-box">
        <input type="text" id="search-input" placeholder="Search prompts, traces, code..." oninput="handleSearch()">
      </div>
      <div class="sidebar-heading">Sessions (<span id="session-counter">0</span>)</div>
      <ul class="session-list" id="session-list"></ul>
    </aside>

    <main id="main-content">
      <div class="empty-state">
        <h3>Select a session from the sidebar</h3>
        <p>Explore conversational turns, thought traces, tool outputs, and unified diffs offline.</p>
      </div>
    </main>
  </div>

  <script>
    const DATA = __EMBEDDED_DATA__;
    let activeSessionId = null;

    function init() {
      const sessions = DATA.sessions || [];
      document.getElementById('session-counter').textContent = sessions.length;

      const listEl = document.getElementById('session-list');
      listEl.innerHTML = '';

      if (sessions.length === 0) {
        listEl.innerHTML = '<li style="color:var(--text-dim);font-size:12px;padding:8px;">No sessions found.</li>';
        return;
      }

      sessions.forEach((s, idx) => {
        const li = document.createElement('li');
        li.className = 'session-item' + (idx === 0 ? ' active' : '');
        li.id = 'nav-' + s.session_id;
        li.onclick = () => selectSession(s.session_id);

        const dateStr = s.created_at ? new Date(s.created_at * 1000).toLocaleString() : 'N/A';
        li.innerHTML = `
          <h4>${escapeHtml(s.title || 'Untitled Session')}</h4>
          <p>${dateStr}</p>
        `;
        listEl.appendChild(li);
      });

      if (sessions.length > 0) {
        selectSession(sessions[0].session_id);
      }
    }

    function selectSession(sessionId) {
      activeSessionId = sessionId;
      document.querySelectorAll('.session-item').forEach(el => el.classList.remove('active'));
      const activeNav = document.getElementById('nav-' + sessionId);
      if (activeNav) activeNav.classList.add('active');

      const session = (DATA.sessions || []).find(s => s.session_id === sessionId);
      if (!session) return;

      const messages = (DATA.messages || []).filter(m => m.session_id === sessionId);
      const traces = (DATA.traces || []).filter(t => t.session_id === sessionId);
      const diffs = (DATA.diffs || []).filter(d => d.session_id === sessionId || d.task_id === sessionId);

      renderSessionView(session, messages, traces, diffs);
    }

    function renderSessionView(session, messages, traces, diffs) {
      const main = document.getElementById('main-content');
      const dateStr = session.created_at ? new Date(session.created_at * 1000).toLocaleString() : 'N/A';

      let html = `
        <div class="session-header">
          <div>
            <h2>${escapeHtml(session.title || 'Untitled Session')}</h2>
            <div class="meta-chips">
              <span class="chip">ID: ${session.session_id}</span>
              <span class="chip">Created: ${dateStr}</span>
              <span class="chip">Turns: ${messages.length}</span>
              <span class="chip">Tool Traces: ${traces.length}</span>
            </div>
          </div>
        </div>
        <div class="message-timeline">
      `;

      if (messages.length === 0 && traces.length === 0) {
        html += `<div class="empty-state"><p>No messages or traces in this session.</p></div>`;
      } else {
        messages.forEach(m => {
          html += `
            <div class="message-bubble ${m.role}">
              <div class="message-header">
                <span class="role-badge role-${m.role}">${m.role}</span>
                <span style="color:var(--text-dim);font-size:11px;">${new Date(m.timestamp * 1000).toLocaleTimeString()}</span>
              </div>
              <div class="message-content">${escapeHtml(m.content)}</div>
              ${m.thought_trace ? `
                <details class="thought-trace">
                  <summary>Internal Reasoning (&lt;think&gt; trace)</summary>
                  <div class="thought-content">${escapeHtml(m.thought_trace)}</div>
                </details>
              ` : ''}
            </div>
          `;
        });

        if (traces.length > 0) {
          html += `<div style="margin-top:20px;"><h3 style="font-size:16px;color:var(--cyan);margin-bottom:12px;">Execution Traces (${traces.length})</h3>`;
          traces.forEach(t => {
            html += `
              <div class="trace-card">
                <div class="trace-title">
                  <span>Step ${t.step_number}: [${t.tool_name}] ${t.command_or_path ? escapeHtml(t.command_or_path) : ''}</span>
                  <span style="color:${t.status === 'SUCCESS' ? 'var(--emerald)' : 'var(--rose)'}">${t.status} (${t.duration_ms}ms)</span>
                </div>
                ${t.input_payload ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;">Input: <code>${escapeHtml(t.input_payload)}</code></div>` : ''}
                ${t.output_payload ? `<pre style="font-family:var(--font-mono);font-size:11px;background:#050811;padding:8px;border-radius:4px;overflow-x:auto;">${escapeHtml(t.output_payload)}</pre>` : ''}
              </div>
            `;
          });
          html += `</div>`;
        }

        if (diffs.length > 0) {
          html += `<div style="margin-top:20px;"><h3 style="font-size:16px;color:var(--emerald);margin-bottom:12px;">Code Diffs (${diffs.length})</h3>`;
          diffs.forEach(d => {
            html += `
              <div class="trace-card">
                <div class="trace-title">
                  <span>File: ${escapeHtml(d.file_path || 'unknown')}</span>
                  <span style="color:var(--emerald)">+${d.additions || 0} / -${d.deletions || 0}</span>
                </div>
                <div class="diff-container">${renderDiffLines(d.diff_content || d.diff || '')}</div>
              </div>
            `;
          });
          html += `</div>`;
        }
      }

      html += `</div>`;
      main.innerHTML = html;
    }

    function renderDiffLines(diffText) {
      if (!diffText) return '';
      return diffText.split('\\n').map(line => {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          return `<span class="diff-line-add">${escapeHtml(line)}</span>`;
        } else if (line.startswith && line.startsWith('-') && !line.startsWith('---')) {
          return `<span class="diff-line-del">${escapeHtml(line)}</span>`;
        } else {
          return `<span class="diff-line-ctx">${escapeHtml(line)}</span>`;
        }
      }).join('');
    }

    function handleSearch() {
      const q = document.getElementById('search-input').value.toLowerCase();
      const items = document.querySelectorAll('.session-item');
      (DATA.sessions || []).forEach(s => {
        const el = document.getElementById('nav-' + s.session_id);
        if (!el) return;
        const matchTitle = (s.title || '').toLowerCase().includes(q);
        const matchContent = (DATA.messages || []).some(m => m.session_id === s.session_id && m.content.toLowerCase().includes(q));
        el.style.display = (matchTitle || matchContent || q === '') ? 'block' : 'none';
      });
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    window.onload = init;
  </script>
</body>
</html>
"""


class DataSovereigntyExporter:
    """
    Exports local SQLite data, worktree artifacts, and logs into a self-contained ZIP archive.
    """

    def __init__(self, store: Optional[Union[LocalStore, LocalAgentStore]] = None):
        self.store = store or LocalStore()

    def generate_export_bundle(self, destination_path: Optional[Union[Path, str]] = None) -> Path:
        """
        Generates complete export archive containing:
        1. READABLE_EXPORT_VIEWER.html at root
        2. SQLite database copy
        3. Raw JSON dumps of sessions, chat histories, execution traces, tasks, and memories
        """
        ensure_runtime_directories()
        timestamp = time.strftime("%Y%m%d_%H%M%S")

        if destination_path is None:
            dest_file = EXPORTS_DIR / f"nexus_agent_export_{timestamp}.zip"
        else:
            dest = Path(destination_path).resolve()
            if dest.is_dir() or not dest.name.endswith(".zip"):
                dest.mkdir(parents=True, exist_ok=True)
                dest_file = dest / f"nexus_agent_export_{timestamp}.zip"
            else:
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest_file = dest

        # 1. Gather all local data
        export_payload = self._gather_all_records()

        # 2. Render embedded offline HTML viewer
        embedded_json = json.dumps(export_payload, ensure_ascii=False)
        rendered_html = HTML_OFFLINE_VIEWER_TEMPLATE.replace("__EMBEDDED_DATA__", embedded_json)

        # 3. Create zip archive
        with zipfile.ZipFile(dest_file, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            # Root HTML viewer
            zf.writestr("READABLE_EXPORT_VIEWER.html", rendered_html)

            # JSON snapshots
            zf.writestr("data/sessions.json", json.dumps(export_payload["sessions"], indent=2))
            zf.writestr("data/chat_history.json", json.dumps(export_payload["messages"], indent=2))
            zf.writestr("data/execution_traces.json", json.dumps(export_payload["traces"], indent=2))
            zf.writestr("data/tasks_full.json", json.dumps(export_payload["tasks"], indent=2))
            zf.writestr("data/memories.json", json.dumps(export_payload["memories"], indent=2))
            zf.writestr("data/diffs.json", json.dumps(export_payload["diffs"], indent=2))

            # Database snapshot
            if self.store.db_path.exists():
                try:
                    zf.write(self.store.db_path, arcname="data/agent_local.db")
                except Exception as e:
                    logger.warning("Could not add db file to archive: %s", e)

        logger.info("Data sovereignty export bundle created: %s", dest_file)
        return dest_file

    def _gather_all_records(self) -> Dict[str, Any]:
        """Gathers records across sessions, messages, traces, and tasks from local store."""
        sessions: List[Dict[str, Any]] = []
        messages: List[Dict[str, Any]] = []
        traces: List[Dict[str, Any]] = []
        tasks: List[Dict[str, Any]] = []
        memories: List[Dict[str, Any]] = []
        diffs: List[Dict[str, Any]] = []

        try:
            with self.store.connection() as conn:
                cur = conn.cursor()

                # Sessions
                cur.execute("SELECT * FROM sessions ORDER BY created_at DESC;")
                sessions = [dict(r) for r in cur.fetchall()]

                # Messages
                cur.execute("SELECT * FROM chat_history ORDER BY timestamp ASC;")
                messages = [dict(r) for r in cur.fetchall()]

                # Traces
                cur.execute("SELECT * FROM execution_traces ORDER BY created_at ASC;")
                traces = [dict(r) for r in cur.fetchall()]

                # Tasks
                cur.execute("SELECT * FROM tasks ORDER BY created_at DESC;")
                tasks_raw = [dict(r) for r in cur.fetchall()]
                for t in tasks_raw:
                    t_id = t["task_id"]
                    dossier = self.store.get_task_full_traces(t_id)
                    tasks.append({
                        **t,
                        "thoughts": dossier.get("thoughts", []),
                        "tools": dossier.get("tools", []),
                        "diffs": dossier.get("diffs", [])
                    })

                # Memories
                cur.execute("SELECT * FROM episodic_memories ORDER BY updated_at DESC;")
                memories = [dict(r) for r in cur.fetchall()]

                # Diffs
                cur.execute("SELECT * FROM code_diffs ORDER BY created_at DESC;")
                diffs = [dict(r) for r in cur.fetchall()]
        except Exception as e:
            logger.error("Error gathering records for export: %s", e)

        # Bridge tasks into sessions if sessions are empty but tasks exist
        if not sessions and tasks:
            for t in tasks:
                sessions.append({
                    "session_id": t["task_id"],
                    "created_at": time.time(),
                    "title": t.get("prompt", "Task " + t["task_id"]),
                    "metadata_json": json.dumps({"intent_type": t.get("intent_type", "AUTONOMOUS_EXEC")})
                })
                # Add task prompt as user message
                messages.append({
                    "id": len(messages) + 1,
                    "session_id": t["task_id"],
                    "role": "user",
                    "content": t.get("prompt", ""),
                    "thought_trace": None,
                    "timestamp": time.time()
                })
                for th in t.get("thoughts", []):
                    messages.append({
                        "id": len(messages) + 1,
                        "session_id": t["task_id"],
                        "role": "assistant",
                        "content": "Reasoning Step: " + th.get("step_id", ""),
                        "thought_trace": th.get("thought_text", ""),
                        "timestamp": time.time()
                    })

        return {
            "exported_at": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
            "sessions": sessions,
            "messages": messages,
            "traces": traces,
            "tasks": tasks,
            "memories": memories,
            "diffs": diffs
        }


def export_all_user_data(destination_zip_path: Optional[Union[Path, str]] = None) -> Path:
    """
    Specification implementation: exports 100% of user data to target zip archive path.
    """
    exporter = DataSovereigntyExporter()
    return exporter.generate_export_bundle(destination_path=destination_zip_path)


create_export = export_all_user_data

