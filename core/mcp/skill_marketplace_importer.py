"""Nexus OS v5.0 - Portable .nxskill Marketplace Importer & Exporter.

Handles packaging, SHA-256 integrity signing, AgentShield safety auditing,
elevation gating, WorkspaceGovernor network checks, and bidirectional importing
of .nxskill bundles into SQLite WAL (~/.nexus-agent/db/agent_local.db).

Zero-mock, production-grade implementation.
"""

from __future__ import annotations

import datetime
import hashlib
import json
import logging
import os
from pathlib import Path
import re
import shutil
import sqlite3
import time
from typing import Any, Dict, List, Optional, Tuple, Union
import urllib.error
import urllib.request
import zipfile

from core.mcp.agent_shield import AgentShieldAuditor
from core.runtime.workspaces import WorkspaceGovernor
from core.runtime.slice_engine import InfinitySliceEngine
from core.security.vault import CredentialVault

logger = logging.getLogger("nexus.mcp.skill_importer")

DEFAULT_SKILLS_DIR = Path.home() / ".nexus-agent" / "skills"
DEFAULT_PACKAGES_DIR = Path("web/marketplace/public/packages")


def re_slug(name: str) -> str:
    """Sanitizes text to kebab-case slug."""
    clean = re.sub(r"[^a-zA-Z0-9-]", "-", name.lower().replace("_", "-")).strip("-")
    clean = re.sub(r"-+", "-", clean)
    return clean or "custom-skill"


def compute_bundle_hash(bundle: Dict[str, Any]) -> str:
    """Computes SHA-256 over normalized canonical fields of the .nxskill bundle."""
    canonical_payload = {
        "category": str(bundle.get("category", "developer")),
        "instructions_md": str(bundle.get("instructions_md", "")),
        "name": str(bundle.get("name") or bundle.get("title") or ""),
        "orbiter_group": str(bundle.get("orbiter_group") or bundle.get("anchor") or "DEV-01"),
        "permission_scope": sorted(
            [str(p) for p in (bundle.get("permission_scope") or bundle.get("permissions") or [])]
        ),
        "references": sorted([str(r) for r in bundle.get("references", [])]),
        "schema_version": str(bundle.get("schema_version", "1.0")),
        "slug": str(bundle.get("slug", "")),
        "type": str(bundle.get("type", "skill")),
    }
    canon_bytes = json.dumps(canonical_payload, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode("utf-8")
    return hashlib.sha256(canon_bytes).hexdigest()


class SkillMarketplaceImporter:
    """Manages creation, signing, safety scanning, and installation of .nxskill bundles."""

    def __init__(self, db_path: Optional[Union[str, Path]] = None) -> None:
        self.slice_engine = InfinitySliceEngine(db_path=str(db_path) if db_path else None)
        self.db_path = Path(self.slice_engine.db_path)
        self.auditor = AgentShieldAuditor(db_path=self.db_path)
        self.governor = WorkspaceGovernor()
        self.vault = CredentialVault()
        self._ensure_tables()

    def _get_connection(self) -> sqlite3.Connection:
        if not self.db_path.parent.exists():
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self.db_path), timeout=10.0)
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.row_factory = sqlite3.Row
        return conn

    def _ensure_tables(self) -> None:
        """Initializes ecc_skills, ecc_agents, ecc_skills_fts, and installed_skills in SQLite WAL."""
        with self._get_connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS ecc_skills (
                    slug TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    author TEXT,
                    category TEXT,
                    description TEXT,
                    type TEXT DEFAULT 'skill',
                    orbiter_group TEXT DEFAULT 'DEV-01',
                    permission_scope TEXT DEFAULT '[]',
                    instructions_md TEXT,
                    references_json TEXT DEFAULT '[]',
                    tools_json TEXT DEFAULT '[]',
                    package_url TEXT,
                    sha256 TEXT,
                    risk_score INTEGER DEFAULT 0,
                    verified INTEGER DEFAULT 1,
                    indexed_at TEXT
                );
                """
            )
            # Ensure new columns exist if table was previously created with older schema
            for col, col_type, default_val in [
                ("type", "TEXT", "'skill'"),
                ("orbiter_group", "TEXT", "'DEV-01'"),
                ("permission_scope", "TEXT", "'[]'"),
                ("instructions_md", "TEXT", "''"),
                ("references_json", "TEXT", "'[]'"),
            ]:
                try:
                    conn.execute(f"ALTER TABLE ecc_skills ADD COLUMN {col} {col_type} DEFAULT {default_val};")
                except Exception:
                    pass

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS ecc_agents (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    anchor TEXT,
                    role TEXT,
                    description TEXT,
                    skills_json TEXT,
                    indexed_at TEXT
                );
                """
            )

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS installed_skills (
                    slug TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    version TEXT DEFAULT '1.0.0',
                    description TEXT,
                    category TEXT DEFAULT 'general',
                    type TEXT DEFAULT 'skill',
                    orbiter_group TEXT DEFAULT 'DEV-01',
                    path TEXT NOT NULL,
                    permissions_json TEXT,
                    sha256 TEXT,
                    installed_at TEXT
                );
                """
            )
            for col, col_type, default_val in [
                ("type", "TEXT", "'skill'"),
                ("orbiter_group", "TEXT", "'DEV-01'"),
            ]:
                try:
                    conn.execute(f"ALTER TABLE installed_skills ADD COLUMN {col} {col_type} DEFAULT {default_val};")
                except Exception:
                    pass

            # Ensure learned_instincts compatibility
            try:
                cols = [row[1] for row in conn.execute("PRAGMA table_info(learned_instincts);").fetchall()]
                if cols and "instinct_rule" not in cols:
                    conn.execute("ALTER TABLE learned_instincts ADD COLUMN instinct_rule TEXT DEFAULT '';")
                if cols and "confidence_score" not in cols:
                    conn.execute("ALTER TABLE learned_instincts ADD COLUMN confidence_score REAL DEFAULT 0.85;")
                if cols and "workspace_mode" not in cols:
                    conn.execute("ALTER TABLE learned_instincts ADD COLUMN workspace_mode TEXT DEFAULT 'DEV';")
            except Exception:
                pass

            # FTS5 Virtual Table for Instant Search
            try:
                # Migrate ecc_skills_fts if it lacks orbiter_group
                cols = [row[1] for row in conn.execute("PRAGMA table_info(ecc_skills_fts);").fetchall()]
                if cols and "orbiter_group" not in cols:
                    conn.execute("DROP TRIGGER IF EXISTS trg_ecc_skills_ai;")
                    conn.execute("DROP TRIGGER IF EXISTS trg_ecc_skills_ad;")
                    conn.execute("DROP TRIGGER IF EXISTS trg_ecc_skills_au;")
                    conn.execute("DROP TABLE IF EXISTS ecc_skills_fts;")

                conn.execute(
                    """
                    CREATE VIRTUAL TABLE IF NOT EXISTS ecc_skills_fts USING fts5(
                        slug,
                        title,
                        description,
                        category,
                        orbiter_group,
                        instructions_md,
                        tokenize = 'porter unicode61'
                    );
                    """
                )
                # Automated Triggers for FTS Synchronization
                conn.execute(
                    """
                    CREATE TRIGGER IF NOT EXISTS trg_ecc_skills_ai AFTER INSERT ON ecc_skills
                    BEGIN
                        INSERT INTO ecc_skills_fts(slug, title, description, category, orbiter_group, instructions_md)
                        VALUES (new.slug, new.title, new.description, new.category, new.orbiter_group, new.instructions_md);
                    END;
                    """
                )
                conn.execute(
                    """
                    CREATE TRIGGER IF NOT EXISTS trg_ecc_skills_ad AFTER DELETE ON ecc_skills
                    BEGIN
                        DELETE FROM ecc_skills_fts WHERE slug = old.slug;
                    END;
                    """
                )
                conn.execute(
                    """
                    CREATE TRIGGER IF NOT EXISTS trg_ecc_skills_au AFTER UPDATE ON ecc_skills
                    BEGIN
                        DELETE FROM ecc_skills_fts WHERE slug = old.slug;
                        INSERT INTO ecc_skills_fts(slug, title, description, category, orbiter_group, instructions_md)
                        VALUES (new.slug, new.title, new.description, new.category, new.orbiter_group, new.instructions_md);
                    END;
                    """
                )
            except Exception as exc:
                logger.debug("FTS5 table or trigger notice: %s", exc)

            conn.commit()

    def export_skill_to_nxskill(
        self,
        slug: str,
        output_dir: Optional[Union[str, Path]] = None,
    ) -> Dict[str, Any]:
        """Generates a downloadable signed .nxskill bundle from SQLite WAL.

        Contains:
        { schema_version: "1.0", slug, name, type, orbiter_group, category,
          permission_scope, instructions_md, references, sha256 }
        """
        clean_slug = re_slug(slug)
        out_dir = Path(output_dir or DEFAULT_PACKAGES_DIR).resolve()
        out_dir.mkdir(parents=True, exist_ok=True)
        bundle_path = out_dir / f"{clean_slug}.nxskill"

        name = clean_slug.replace("-", " ").title()
        category = "developer"
        orbiter_group = "DEV-01"
        item_type = "skill"
        permission_scope = ["FILESYSTEM_READ", "WORKSPACE_WRITE"]
        instructions_md = f"# {name}\n\nAutomated capability package for {clean_slug}."
        references: List[str] = []

        with self._get_connection() as conn:
            # 1. Check ecc_skills
            cursor = conn.execute("SELECT * FROM ecc_skills WHERE slug = ? LIMIT 1;", (clean_slug,))
            row = cursor.fetchone()
            if row:
                name = row["title"]
                category = row["category"] or category
                orbiter_group = row["orbiter_group"] if "orbiter_group" in row.keys() and row["orbiter_group"] else orbiter_group
                item_type = row["type"] if "type" in row.keys() and row["type"] else item_type
                if "instructions_md" in row.keys() and row["instructions_md"]:
                    instructions_md = row["instructions_md"]
                elif row["description"]:
                    instructions_md = f"# {name}\n\n{row['description']}\n"
                try:
                    permission_scope = json.loads(row["permission_scope"]) if "permission_scope" in row.keys() and row["permission_scope"] else permission_scope
                except Exception:
                    pass
                try:
                    references = json.loads(row["references_json"]) if "references_json" in row.keys() and row["references_json"] else references
                except Exception:
                    pass
            else:
                # 2. Check learned_instincts
                cursor = conn.execute("SELECT * FROM learned_instincts WHERE trigger_pattern LIKE ? OR id = ? LIMIT 1;", (f"%{clean_slug}%", clean_slug))
                inst = cursor.fetchone()
                if inst:
                    name = f"Instinct: {inst['trigger_pattern']}"
                    category = "instinct"
                    instructions_md = (
                        f"# {name}\n\n"
                        f"**Trigger Pattern:** `{inst['trigger_pattern']}`\n"
                        f"**Workspace Mode:** `{inst['workspace_mode']}`\n"
                        f"**Confidence:** `{inst['confidence_score']}`\n\n"
                        f"## Execution Rule\n\n{inst['instinct_rule']}\n"
                    )

        bundle: Dict[str, Any] = {
            "schema_version": "1.0",
            "slug": clean_slug,
            "name": name,
            "type": item_type,
            "orbiter_group": orbiter_group,
            "category": category,
            "permission_scope": permission_scope,
            "instructions_md": instructions_md,
            "references": references,
        }

        # Sign with canonical SHA-256
        bundle["sha256"] = compute_bundle_hash(bundle)

        # Write formatted JSON bundle
        bundle_path.write_text(json.dumps(bundle, indent=2), encoding="utf-8")
        logger.info("Exported signed .nxskill bundle '%s' to %s (sha256=%s)", clean_slug, bundle_path, bundle["sha256"][:12])

        return {
            "success": True,
            "slug": clean_slug,
            "bundle": bundle,
            "bundle_path": str(bundle_path),
            "sha256": bundle["sha256"],
            "size_bytes": bundle_path.stat().st_size,
        }

    def export_skill_bundle(
        self,
        slug: Union[str, Path],
        output_dir: Optional[Union[str, Path]] = None,
    ) -> Dict[str, Any]:
        """Packages a skill directory into a signed .nxskill ZIP bundle or exports from SQLite WAL."""
        target_path = Path(slug)
        if target_path.exists() and target_path.is_dir():
            manifest_file = target_path / "manifest.json"
            manifest_data: Dict[str, Any] = {}
            if manifest_file.exists():
                try:
                    manifest_data = json.loads(manifest_file.read_text(encoding="utf-8"))
                except Exception:
                    pass

            clean_slug = manifest_data.get("slug") or re_slug(target_path.name)
            out_dir = Path(output_dir or DEFAULT_PACKAGES_DIR).resolve()
            out_dir.mkdir(parents=True, exist_ok=True)
            bundle_path = out_dir / f"{clean_slug}.nxskill"

            with zipfile.ZipFile(bundle_path, "w", zipfile.ZIP_DEFLATED) as zf:
                for root, _, files in os.walk(target_path):
                    for file in files:
                        full_file_path = Path(root) / file
                        arcname = full_file_path.relative_to(target_path)
                        zf.write(full_file_path, arcname=str(arcname))

            sha256_hash = hashlib.sha256(bundle_path.read_bytes()).hexdigest()
            logger.info("Exported signed .nxskill zip bundle '%s' to %s (sha256=%s)", clean_slug, bundle_path, sha256_hash[:12])
            return {
                "success": True,
                "slug": clean_slug,
                "bundle_path": str(bundle_path),
                "sha256": sha256_hash,
                "size_bytes": bundle_path.stat().st_size,
            }

        return self.export_skill_to_nxskill(slug=str(slug), output_dir=output_dir)

    def export_nxskill(self, slug: str, output_dir: Optional[Union[str, Path]] = None) -> Dict[str, Any]:
        """Convenience alias for exporting a skill bundle."""
        return self.export_skill_bundle(slug, output_dir=output_dir)

    def compile_macro(
        self,
        macro_name: str,
        output_path: Optional[Union[str, Path]] = None,
        permissions: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Compiles a recorded macro into a signed .nxskill package bundle."""
        from core.runtime.macro_recorder import compile_macro_to_nxskill
        return compile_macro_to_nxskill(
            macro_name=macro_name,
            output_path=output_path,
            db_path=self.db_path,
            permissions=permissions,
        )

    def install_nxskill_bundle(
        self,
        bundle_path_or_url: Union[str, Path, Dict[str, Any]],
        auto_elevate: bool = False,
        target_dir: Optional[Union[str, Path]] = None,
    ) -> Dict[str, Any]:
        """Validates SHA-256 integrity, runs AgentShield audit, enforces WorkspaceGovernor,

        and upserts valid skills into SQLite WAL and FTS5.
        """
        raw_bundle: Optional[Dict[str, Any]] = None
        source_identifier: str = ""
        is_zip_source = False
        zip_file_sha = ""
        zip_file_path: Optional[Path] = None

        # 1. Parse Input: Dict, URL, or Path
        if isinstance(bundle_path_or_url, dict):
            raw_bundle = dict(bundle_path_or_url)
            source_identifier = raw_bundle.get("slug", "memory_bundle")
        else:
            input_str = str(bundle_path_or_url).strip()
            source_identifier = input_str

            # Check if remote URL
            if input_str.startswith("http://") or input_str.startswith("https://"):
                active_mode = self.governor.active_mode if hasattr(self.governor, "active_mode") else "DEV"
                if active_mode == "SILENT":
                    logger.warning("[WORKSPACE_GOVERNOR] Remote URL download denied in SILENT air-gapped mode: %s", input_str)
                    return {
                        "success": False,
                        "status": "GOVERNOR_BLOCKED",
                        "error": "Remote downloads blocked in SILENT air-gapped workspace mode.",
                    }

                try:
                    req = urllib.request.Request(input_str, headers={"User-Agent": "NexusSkillImporter/5.0"})
                    with urllib.request.urlopen(req, timeout=5.0) as resp:
                        content_bytes = resp.read()
                        raw_bundle = json.loads(content_bytes.decode("utf-8"))
                except Exception as exc:
                    logger.error("Failed to fetch remote .nxskill bundle from %s: %s", input_str, exc)
                    return {
                        "success": False,
                        "status": "FETCH_FAILED",
                        "error": f"Failed to download remote bundle: {exc}",
                    }
            else:
                # Local file path
                p = Path(input_str).resolve()
                if not p.exists() and not input_str.endswith(".nxskill"):
                    cand = (DEFAULT_PACKAGES_DIR / f"{input_str}.nxskill").resolve()
                    if cand.exists():
                        p = cand

                if not p.exists():
                    return {
                        "success": False,
                        "status": "NOT_FOUND",
                        "error": f"Skill bundle file not found: {input_str}",
                    }

                try:
                    # Attempt reading as JSON .nxskill
                    text = p.read_text(encoding="utf-8", errors="replace")
                    raw_bundle = json.loads(text)
                except Exception:
                    # Attempt reading as ZIP .nxskill
                    try:
                        if zipfile.is_zipfile(p):
                            is_zip_source = True
                            zip_file_path = p
                            zip_file_sha = hashlib.sha256(p.read_bytes()).hexdigest()
                            with zipfile.ZipFile(p, "r") as zf:
                                manifest_data = {}
                                instructions_md = ""
                                if "manifest.json" in zf.namelist():
                                    manifest_data = json.loads(zf.read("manifest.json").decode("utf-8"))
                                if "SKILL.md" in zf.namelist():
                                    instructions_md = zf.read("SKILL.md").decode("utf-8", errors="replace")
                                raw_bundle = {
                                    "schema_version": "1.0",
                                    "slug": manifest_data.get("slug", p.stem),
                                    "name": manifest_data.get("title") or manifest_data.get("name", p.stem),
                                    "type": manifest_data.get("type", "skill"),
                                    "orbiter_group": manifest_data.get("orbiter_group") or manifest_data.get("anchor", "DEV-01"),
                                    "category": manifest_data.get("category", "developer"),
                                    "permission_scope": manifest_data.get("permissions") or manifest_data.get("permission_scope") or [],
                                    "instructions_md": instructions_md or manifest_data.get("description", ""),
                                    "references": manifest_data.get("references", []),
                                    "sha256": manifest_data.get("sha256", "") or zip_file_sha,
                                }
                    except Exception as exc:
                        return {
                            "success": False,
                            "status": "PARSE_ERROR",
                            "error": f"Failed to parse skill bundle format: {exc}",
                        }

        if not raw_bundle or not isinstance(raw_bundle, dict):
            return {
                "success": False,
                "status": "INVALID_BUNDLE",
                "error": "Invalid bundle data structure.",
            }

        # Extract normalized attributes
        slug = re_slug(raw_bundle.get("slug") or raw_bundle.get("name") or "unnamed-skill")
        name = str(raw_bundle.get("name") or raw_bundle.get("title") or slug.replace("-", " ").title())
        item_type = str(raw_bundle.get("type", "skill"))
        orbiter_group = str(raw_bundle.get("orbiter_group") or raw_bundle.get("anchor") or "DEV-01")
        category = str(raw_bundle.get("category", "developer"))
        permission_scope = raw_bundle.get("permission_scope") or raw_bundle.get("permissions") or []
        if isinstance(permission_scope, str):
            permission_scope = [permission_scope]
        instructions_md = str(raw_bundle.get("instructions_md", ""))
        references = raw_bundle.get("references", [])
        expected_sha = str(raw_bundle.get("sha256", "")).strip()

        # 2. Verify SHA-256 Integrity
        if is_zip_source and zip_file_sha:
            computed_sha = zip_file_sha
            if expected_sha and expected_sha != zip_file_sha and expected_sha != compute_bundle_hash(raw_bundle):
                logger.warning("[INTEGRITY_FAILED] SHA-256 mismatch for '%s': expected %s vs computed %s", slug, expected_sha, zip_file_sha)
                return {
                    "success": False,
                    "status": "INTEGRITY_FAILED",
                    "error": f"SHA-256 checksum mismatch. Expected {expected_sha[:12]} but computed {zip_file_sha[:12]}. Bundle has been tampered with or corrupted.",
                    "slug": slug,
                    "expected_sha": expected_sha,
                    "computed_sha": zip_file_sha,
                }
            sha256_hash = zip_file_sha
        else:
            computed_sha = compute_bundle_hash(raw_bundle)
            if expected_sha and expected_sha != computed_sha:
                logger.warning("[INTEGRITY_FAILED] SHA-256 mismatch for '%s': expected %s vs computed %s", slug, expected_sha, computed_sha)
                return {
                    "success": False,
                    "status": "INTEGRITY_FAILED",
                    "error": f"SHA-256 checksum mismatch. Expected {expected_sha[:12]} but computed {computed_sha[:12]}. Bundle has been tampered with or corrupted.",
                    "slug": slug,
                    "expected_sha": expected_sha,
                    "computed_sha": computed_sha,
                }
            sha256_hash = expected_sha or computed_sha

        # 3. AgentShield Static AST/Regex Audit
        audit = self.auditor.audit_skill(raw_bundle)
        risk_score = audit.get("risk_score", 0)
        is_critical = audit.get("is_critical", False)
        findings = audit.get("findings", [])

        if is_critical or audit.get("quarantined", False):
            logger.error("[AGENT_SHIELD_QUARANTINE] Critical security violations in bundle '%s': %s", slug, findings)
            return {
                "success": False,
                "status": "QUARANTINED",
                "error": "AgentShield security violation: Critical threats detected. Skill has been quarantined and blocked from installation.",
                "slug": slug,
                "score": audit.get("score", 0),
                "risk_score": risk_score,
                "findings": findings,
            }

        # Elevated risk check
        if risk_score >= 40 and not auto_elevate:
            return {
                "success": False,
                "status": "NEEDS_APPROVAL",
                "slug": slug,
                "name": name,
                "risk_score": risk_score,
                "findings": findings,
                "permission_scope": permission_scope,
                "message": f"Elevated permissions required for '{name}'. Confirm authorization via Notch HUD or pass auto_elevate=True.",
            }

        # 4. Save Extracted Playbook to Local Disk
        dest_base = Path(target_dir or DEFAULT_SKILLS_DIR).resolve()
        skill_dir = (dest_base / slug).resolve()
        skill_dir.mkdir(parents=True, exist_ok=True)
        if is_zip_source and zip_file_path and zip_file_path.exists() and zipfile.is_zipfile(zip_file_path):
            with zipfile.ZipFile(zip_file_path, "r") as zf:
                zf.extractall(skill_dir)
        if not (skill_dir / "SKILL.md").exists():
            (skill_dir / "SKILL.md").write_text(instructions_md, encoding="utf-8")
        if not (skill_dir / "manifest.json").exists():
            manifest_copy = {
                "schema_version": "1.0",
                "slug": slug,
                "name": name,
                "type": item_type,
                "orbiter_group": orbiter_group,
                "category": category,
                "permission_scope": permission_scope,
                "instructions_md": instructions_md,
                "references": references,
                "sha256": sha256_hash,
            }
            (skill_dir / "manifest.json").write_text(json.dumps(manifest_copy, indent=2), encoding="utf-8")

        # 5. Upsert into SQLite WAL Database
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with self._get_connection() as conn:
            # ecc_skills table
            conn.execute(
                """
                INSERT INTO ecc_skills (
                    slug, title, author, category, description, type,
                    orbiter_group, permission_scope, instructions_md, references_json,
                    tools_json, package_url, sha256, risk_score, verified, indexed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
                ON CONFLICT(slug) DO UPDATE SET
                    title = excluded.title,
                    author = excluded.author,
                    category = excluded.category,
                    description = excluded.description,
                    type = excluded.type,
                    orbiter_group = excluded.orbiter_group,
                    permission_scope = excluded.permission_scope,
                    instructions_md = excluded.instructions_md,
                    references_json = excluded.references_json,
                    tools_json = excluded.tools_json,
                    package_url = excluded.package_url,
                    sha256 = excluded.sha256,
                    risk_score = excluded.risk_score,
                    verified = 1,
                    indexed_at = excluded.indexed_at;
                """,
                (
                    slug,
                    name,
                    raw_bundle.get("author", "Nexus Community"),
                    category,
                    instructions_md[:200].replace("\n", " "),
                    item_type,
                    orbiter_group,
                    json.dumps(permission_scope),
                    instructions_md,
                    json.dumps(references),
                    json.dumps(raw_bundle.get("tools", [])),
                    f"/packages/{slug}.nxskill",
                    sha256_hash,
                    risk_score,
                    now_iso,
                ),
            )

            # If agent type, upsert into ecc_agents
            if item_type == "agent":
                conn.execute(
                    """
                    INSERT INTO ecc_agents (
                        id, name, anchor, role, description, skills_json, indexed_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        name = excluded.name,
                        anchor = excluded.anchor,
                        role = excluded.role,
                        description = excluded.description,
                        skills_json = excluded.skills_json,
                        indexed_at = excluded.indexed_at;
                    """,
                    (
                        slug,
                        name,
                        orbiter_group,
                        category.title(),
                        instructions_md[:200],
                        json.dumps([slug]),
                        now_iso,
                    ),
                )

            # installed_skills tracking table
            conn.execute(
                """
                INSERT INTO installed_skills (
                    slug, title, version, description, category, type, orbiter_group,
                    path, permissions_json, sha256, installed_at
                ) VALUES (?, ?, '1.0.0', ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(slug) DO UPDATE SET
                    title = excluded.title,
                    description = excluded.description,
                    category = excluded.category,
                    type = excluded.type,
                    orbiter_group = excluded.orbiter_group,
                    path = excluded.path,
                    permissions_json = excluded.permissions_json,
                    sha256 = excluded.sha256,
                    installed_at = excluded.installed_at;
                """,
                (
                    slug,
                    name,
                    instructions_md[:200],
                    category,
                    item_type,
                    orbiter_group,
                    str(skill_dir),
                    json.dumps(permission_scope),
                    sha256_hash,
                    now_iso,
                ),
            )
            conn.commit()

        logger.info("Successfully installed .nxskill '%s' (%s) [SHA-256: %s] [AgentShield Verified]", slug, name, sha256_hash[:12])
        return {
            "success": True,
            "status": "INSTALLED",
            "slug": slug,
            "name": name,
            "type": item_type,
            "orbiter_group": orbiter_group,
            "category": category,
            "path": str(skill_dir),
            "sha256": sha256_hash,
            "risk_score": risk_score,
            "permission_scope": permission_scope,
            "skill_command": f"/skill:{slug}",
            "installed_at": now_iso,
        }

    def import_skill_bundle(
        self,
        bundle_path_or_slug: Union[str, Path],
        auto_elevate: bool = False,
        target_dir: Optional[Union[str, Path]] = None,
    ) -> Dict[str, Any]:
        """Imports an .nxskill bundle (ZIP or JSON) with AgentShield audit and SQLite WAL indexing."""
        return self.install_nxskill_bundle(bundle_path_or_slug, auto_elevate=auto_elevate, target_dir=target_dir)

    def import_nxskill(
        self,
        source: str,
        raw_payload: Optional[Dict[str, Any]] = None,
        auto_approve_readonly: bool = True,
        approved_elevated: bool = False,
        target_dir: Optional[Union[str, Path]] = None,
    ) -> Dict[str, Any]:
        """Convenience method for IPC, deep-link, and CLI skill installation."""
        return self.install_nxskill_bundle(raw_payload or source, auto_elevate=approved_elevated, target_dir=target_dir)

    def promote_instinct_to_skill(
        self,
        instinct_id_or_pattern: str,
        target_slug: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Promotes a learned_instincts row into an installable /skill:<slug> package."""
        target_id = instinct_id_or_pattern.strip()
        inst: Optional[Dict[str, Any]] = None

        with self._get_connection() as conn:
            cursor = conn.execute(
                "SELECT * FROM learned_instincts WHERE id = ? OR trigger_pattern = ? OR trigger_pattern LIKE ? LIMIT 1;",
                (target_id, target_id, f"%{target_id}%"),
            )
            row = cursor.fetchone()
            if row:
                inst = dict(row)

        if not inst:
            # Fallback: create instinct entry if pattern provided directly
            slug = target_slug or re_slug(target_id)
            title = slug.replace("-", " ").title()
            rule = f"Autonomous workflow policy distilled for '{target_id}'."
        else:
            slug = target_slug or re_slug(inst["trigger_pattern"])
            title = f"Instinct: {inst['trigger_pattern']}"
            rule = inst["instinct_rule"]

        instructions_md = (
            f"# {title}\n\n"
            f"**Distilled Instinct Policy**\n\n"
            f"- Trigger Pattern: `{inst['trigger_pattern'] if inst else target_id}`\n"
            f"- Confidence Score: `{inst.get('confidence_score', 0.85) if inst else 0.85}`\n"
            f"- Workspace Mode: `{inst.get('workspace_mode', 'DEV') if inst else 'DEV'}`\n\n"
            f"## Automated Execution Rules\n\n"
            f"{rule}\n"
        )

        bundle: Dict[str, Any] = {
            "schema_version": "1.0",
            "slug": slug,
            "name": title,
            "type": "skill",
            "orbiter_group": "DEV-01",
            "category": "instinct",
            "permission_scope": ["WORKSPACE_WRITE"],
            "instructions_md": instructions_md,
            "references": [],
        }
        bundle["sha256"] = compute_bundle_hash(bundle)

        # Install directly
        install_res = self.install_nxskill_bundle(bundle, auto_elevate=True)
        install_res["promoted_from_instinct"] = True
        return install_res

    def get_installed_skills(self, ttl: float = 30.0) -> List[Dict[str, Any]]:
        """Returns all installed skills from SQLite WAL."""
        now = time.time()
        if hasattr(self, "_cached_skills") and hasattr(self, "_cached_skills_time"):
            if now - self._cached_skills_time < ttl:
                return self._cached_skills

        with self._get_connection() as conn:
            cursor = conn.execute("SELECT * FROM installed_skills ORDER BY installed_at DESC;")
            results = []
            for r in cursor.fetchall():
                perms = []
                try:
                    perms = json.loads(r["permissions_json"])
                except Exception:
                    pass
                results.append({
                    "slug": r["slug"],
                    "name": r["title"],
                    "version": r["version"],
                    "description": r["description"],
                    "category": r["category"],
                    "type": r["type"] if "type" in r.keys() else "skill",
                    "orbiter_group": r["orbiter_group"] if "orbiter_group" in r.keys() else "DEV-01",
                    "path": r["path"],
                    "permission_scope": perms,
                    "sha256": r["sha256"],
                    "installed_at": r["installed_at"],
                })
            self._cached_skills = results
            self._cached_skills_time = now
            return results

    def search_skills_fts(self, query: str, limit: int = 25) -> List[Dict[str, Any]]:
        """Performs high-speed BM25 search across indexed skills using FTS5."""
        clean_q = re.sub(r"[^\w\s-]", " ", query).strip()
        if not clean_q:
            return []

        fts_query = " OR ".join(f'"{token}*"' for token in clean_q.split() if token)
        if not fts_query:
            return []

        with self._get_connection() as conn:
            cursor = conn.execute(
                """
                SELECT slug, title, description, category, orbiter_group
                FROM ecc_skills_fts
                WHERE ecc_skills_fts MATCH ?
                ORDER BY rank
                LIMIT ?;
                """,
                (fts_query, limit),
            )
            return [dict(r) for r in cursor.fetchall()]

    @staticmethod
    def compute_sha256(path: Path) -> str:
        """Computes SHA-256 hash of a file on disk."""
        if not path.is_file():
            return ""
        h = hashlib.sha256()
        with open(path, "rb") as fp:
            while chunk := fp.read(64 * 1024):
                h.update(chunk)
        return h.hexdigest()
