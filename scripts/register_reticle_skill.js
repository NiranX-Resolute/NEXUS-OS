const fs = require('fs');
const path = require('path');
const os = require('os');
const { DatabaseSync } = require('node:sqlite');

const homeDir = os.homedir();
const dbDir = path.join(homeDir, '.nexus-agent', 'db');
const dbPath = path.join(dbDir, 'agent_local.db');
const skillsDir = path.join(homeDir, '.nexus-agent', 'skills', 'reticle-verify-ui');

fs.mkdirSync(dbDir, { recursive: true });
fs.mkdirSync(skillsDir, { recursive: true });

const skillMdContent = `---
name: reticle-verify-ui
title: Reticle Runtime UI & IPC Verifier
category: verification
orbiter_group: DEV-01
---

# Reticle Runtime UI & IPC Verification Protocol

Provides deterministic machine-native runtime verification for NEXUS OS v5.0 desktop and web micro-frontends using Reticle Model Context Protocol (MCP) tools.

## Protocol Workflow
1. Initialize or connect to session:
   \`reticle_session({ action: "connect", app: "nexus-desktop" })\`
2. Inspect target element:
   \`reticle_look({ target: { testid: "<target-id>" } })\`
3. Execute action and await deterministic consequence:
   \`reticle_act_and_wait({ target: { testid: "<target-id>" }, action: "click", expect: { net: { status: 200 }, state: { store: "agentStore" } } })\`
4. Assert strict verdict:
   \`reticle_assert({ expect: { verified: "yes", console_errors: 0 } })\`

Only verdicts returning \`verified: "yes"\` satisfy the NEXUS OS v5.0 verification gate.
`;

fs.writeFileSync(path.join(skillsDir, 'SKILL.md'), skillMdContent, 'utf8');
console.log('Wrote SKILL.md to:', path.join(skillsDir, 'SKILL.md'));

const db = new DatabaseSync(dbPath);

// Ensure tables
db.exec(`
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
`);

try {
  db.exec("ALTER TABLE ecc_skills ADD COLUMN orbiter_group TEXT DEFAULT 'DEV-01';");
} catch {
  // Column may already exist
}

db.exec(`
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
`);

const nowIso = new Date().toISOString();
const toolsJson = JSON.stringify(['reticle_session', 'reticle_look', 'reticle_act', 'reticle_act_and_wait', 'reticle_assert']);
const permsJson = JSON.stringify(['loopback_network', 'dom_inspect', 'ipc_trace']);

const stmtEcc = db.prepare(`
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
`);

stmtEcc.run(
  'reticle-verify-ui',
  'Reticle Runtime UI & IPC Verifier',
  'Nexdune / Reticle',
  'verification',
  'DEV-01',
  'Deterministic runtime DOM, UI state, and Electron IPC verification using Reticle MCP tools (reticle_session -> reticle_act_and_wait / reticle_assert requiring verified: yes).',
  toolsJson,
  'local://nexus-agent/skills/reticle-verify-ui',
  'reticle-v3.10.7-verified',
  0,
  1,
  nowIso
);

const stmtInst = db.prepare(`
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
`);

stmtInst.run(
  'reticle-verify-ui',
  'Reticle Runtime UI & IPC Verifier',
  '1.0.0',
  'Deterministic runtime DOM, UI state, and Electron IPC verification using Reticle MCP tools.',
  'verification',
  skillsDir,
  permsJson,
  'reticle-v3.10.7-verified',
  nowIso
);

console.log('Successfully registered reticle-verify-ui skill in agent_local.db');
