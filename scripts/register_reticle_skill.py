"""Register reticle-verify-ui skill in agent_local.db and write SKILL.md."""
import datetime
import json
import os
from pathlib import Path
import sqlite3

home_dir = Path.home()
db_dir = home_dir / ".nexus-agent" / "db"
db_dir.mkdir(parents=True, exist_ok=True)
db_path = db_dir / "agent_local.db"

skills_dir = home_dir / ".nexus-agent" / "skills" / "reticle-verify-ui"
skills_dir.mkdir(parents=True, exist_ok=True)

skill_md = skills_dir / "SKILL.md"
skill_md.write_text(
    """---
name: reticle-verify-ui
title: Reticle Runtime UI & IPC Verifier
category: verification
orbiter_group: DEV-01
---

# Reticle Runtime UI & IPC Verification Protocol

Provides deterministic machine-native runtime verification for NEXUS OS v5.0 desktop and web micro-frontends using Reticle Model Context Protocol (MCP) tools.

## Protocol Workflow
1. Initialize or connect to session:
   `reticle_session({ action: "connect", app: "nexus-desktop" })`
2. Inspect target element:
   `reticle_look({ target: { testid: "<target-id>" } })`
3. Execute action and await deterministic consequence:
   `reticle_act_and_wait({ target: { testid: "<target-id>" }, action: "click", expect: { net: { status: 200 }, state: { store: "agentStore" } } })`
4. Assert strict verdict:
   `reticle_assert({ expect: { verified: "yes", console_errors: 0 } })`

Only verdicts returning `verified: "yes"` satisfy the NEXUS OS v5.0 verification gate.
""",
    encoding="utf-8",
)

conn = sqlite3.connect(str(db_path), timeout=5.0)
cursor = conn.cursor()

cursor.execute(
    """
    CREATE TABLE IF NOT EXISTS ecc_skills (
        slug TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        author TEXT,
        category TEXT,
        description TEXT,
        tools_json TEXT,
        package_url TEXT,
        sha256 TEXT,
        risk_score INTEGER DEFAULT 0,
        verified INTEGER DEFAULT 1,
        indexed_at TEXT
    );
    """
)

try:
    cursor.execute("ALTER TABLE ecc_skills ADD COLUMN orbiter_group TEXT DEFAULT 'DEV-01';")
except Exception:
    pass

cursor.execute(
    """
    CREATE TABLE IF NOT EXISTS installed_skills (
        slug TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        version TEXT DEFAULT '1.0.0',
        description TEXT,
        category TEXT DEFAULT 'general',
        path TEXT NOT NULL,
        permissions_json TEXT,
        sha256 TEXT,
        installed_at TEXT
    );
    """
)

now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
tools_json = json.dumps(["reticle_session", "reticle_look", "reticle_act", "reticle_act_and_wait", "reticle_assert"])
perms_json = json.dumps(["loopback_network", "dom_inspect", "ipc_trace"])

cursor.execute(
    """
    INSERT INTO ecc_skills (
        slug, title, author, category, orbiter_group, description, tools_json, package_url, sha256, risk_score, verified, indexed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
        title = excluded.title,
        author = excluded.author,
        category = excluded.category,
        orbiter_group = excluded.orbiter_group,
        description = excluded.description,
        tools_json = excluded.tools_json,
        verified = excluded.verified,
        indexed_at = excluded.indexed_at;
    """,
    (
        "reticle-verify-ui",
        "Reticle Runtime UI & IPC Verifier",
        "Nexdune / Reticle",
        "verification",
        "DEV-01",
        "Deterministic runtime DOM, UI state, and Electron IPC verification using Reticle MCP tools (reticle_session -> reticle_act_and_wait / reticle_assert requiring verified: yes).",
        tools_json,
        "local://nexus-agent/skills/reticle-verify-ui",
        "reticle-v3.10.7-verified",
        0,
        1,
        now_iso,
    ),
)

cursor.execute(
    """
    INSERT INTO installed_skills (
        slug, title, version, description, category, path, permissions_json, sha256, installed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
        title = excluded.title,
        version = excluded.version,
        description = excluded.description,
        category = excluded.category,
        path = excluded.path,
        permissions_json = excluded.permissions_json,
        installed_at = excluded.installed_at;
    """,
    (
        "reticle-verify-ui",
        "Reticle Runtime UI & IPC Verifier",
        "1.0.0",
        "Deterministic runtime DOM, UI state, and Electron IPC verification using Reticle MCP tools.",
        "verification",
        str(skills_dir),
        perms_json,
        "reticle-v3.10.7-verified",
        now_iso,
    ),
)

conn.commit()
conn.close()
print("SUCCESS: Registered reticle-verify-ui in agent_local.db and created SKILL.md")
