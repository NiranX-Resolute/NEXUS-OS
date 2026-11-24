"""Nexus OS v5.0 - Opt-in Cloud Memory Sync & Replication Adapter.

Provides optional, non-blocking incremental replication of ~/.nexus-agent/db/agent_local.db:
- Turso libSQL: Snapshot and incremental SQL record replication over HTTP pipeline.
- Qdrant Cloud: High-dimensional vector upsert over REST API.
- Neo4j Aura: Knowledge graph edge and node projection over Cypher HTTP API.

Sovereignty & Security Invariants:
1. Pure Opt-In & Dormant by Default: Stays dormant in STANDBY status unless credentials exist.
2. Windows DPAPI Exclusivity: Credentials (TURSO_*, QDRANT_*, NEO4J_*) are read strictly
   from Windows DPAPI (core/security/vault.py) - zero plaintext env file leaks.
3. Air-Gap & ESTOP Confinement: All cloud egress is strictly terminated if WorkspaceGovernor
   mode is 'SILENT' or ESTOP == 1.
"""

from __future__ import annotations

import base64
import json
import logging
from pathlib import Path
import sqlite3
import struct
import threading
import time
from typing import Any, Dict, List, Optional, Tuple, Union
import urllib.error
import urllib.parse
import urllib.request

from core.security.vault import CredentialVault, get_default_vault
from core.runtime.workspaces import WorkspaceGovernor

logger = logging.getLogger("nexus.memory.cloud_sync")


class CloudMemorySyncAdapter:
    """Non-blocking, opt-in cloud replication adapter for local SQLite memory."""

    DEFAULT_DB_PATH = Path.home() / ".nexus-agent" / "db" / "agent_local.db"
    DEFAULT_QDRANT_COLLECTION = "nexus_memories"
    DEFAULT_NEO4J_DATABASE = "neo4j"

    def __init__(
        self,
        vault: Optional[CredentialVault] = None,
        governor: Optional[WorkspaceGovernor] = None,
        db_path: Optional[Union[str, Path]] = None,
    ) -> None:
        self.vault = vault or get_default_vault()
        self.governor = governor or WorkspaceGovernor()

        if db_path is None:
            self.db_path = self.DEFAULT_DB_PATH
        else:
            self.db_path = Path(db_path)

        if str(self.db_path) != ":memory:":
            self.db_path.parent.mkdir(parents=True, exist_ok=True)

        self._last_sync_records: int = 0
        self._last_error: Optional[str] = None
        self._sync_lock = threading.Lock()

    # -------------------------------------------------------------------------
    # Secret Resolution via Windows DPAPI Exclusively
    # -------------------------------------------------------------------------
    def get_secret(self, key_name: str) -> Optional[str]:
        """Retrieves an optional cloud secret strictly from Windows DPAPI."""
        try:
            val = self.vault.get_secret(key_name)
            if val and isinstance(val, str) and val.strip():
                return val.strip()
        except Exception as exc:
            logger.debug("DPAPI lookup notice for '%s': %s", key_name, exc)
        return None

    # -------------------------------------------------------------------------
    # System Confinement & Safety Queries
    # -------------------------------------------------------------------------
    def is_air_gapped(self) -> bool:
        """Returns True if current operating mode is SILENT."""
        return self.governor.is_silent() or self.governor.get_mode().upper() == "SILENT"

    def is_estop_active(self) -> bool:
        """Returns True if emergency stop flag ESTOP is set to 1 in SQLite."""
        if not self.db_path.exists() and str(self.db_path) != ":memory:":
            return False
        try:
            conn = sqlite3.connect(str(self.db_path), timeout=2.0)
            try:
                row = conn.execute(
                    "SELECT flag_value FROM system_flags WHERE flag_key = 'ESTOP';"
                ).fetchone()
                if row and str(row[0]).strip() == "1":
                    return True
            finally:
                conn.close()
        except Exception as exc:
            logger.debug("ESTOP flag query notice: %s", exc)
        return False

    def get_last_sync_timestamp(self) -> float:
        """Retrieves timestamp of the last successful cloud sync from system_flags."""
        if not self.db_path.exists() and str(self.db_path) != ":memory:":
            return 0.0
        try:
            conn = sqlite3.connect(str(self.db_path), timeout=2.0)
            try:
                row = conn.execute(
                    "SELECT flag_value FROM system_flags WHERE flag_key = 'LAST_CLOUD_SYNC_TIMESTAMP';"
                ).fetchone()
                if row and row[0]:
                    return float(row[0])
            finally:
                conn.close()
        except Exception as exc:
            logger.debug("Last sync query notice: %s", exc)
        return 0.0

    def set_last_sync_timestamp(self, ts: float) -> None:
        """Records timestamp of the last successful cloud sync into system_flags."""
        try:
            conn = sqlite3.connect(str(self.db_path), timeout=2.0)
            try:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS system_flags (
                        flag_key TEXT PRIMARY KEY,
                        flag_value TEXT NOT NULL,
                        updated_at REAL NOT NULL
                    );
                    """
                )
                conn.execute(
                    """
                    INSERT INTO system_flags (flag_key, flag_value, updated_at)
                    VALUES ('LAST_CLOUD_SYNC_TIMESTAMP', ?, ?)
                    ON CONFLICT(flag_key) DO UPDATE SET
                        flag_value = excluded.flag_value,
                        updated_at = excluded.updated_at;
                    """,
                    (str(ts), time.time()),
                )
                conn.commit()
            finally:
                conn.close()
        except Exception as exc:
            logger.debug("Failed updating sync timestamp: %s", exc)

    # -------------------------------------------------------------------------
    # Telemetry & Status
    # -------------------------------------------------------------------------
    def get_sync_status(self) -> Dict[str, Any]:
        """Returns comprehensive status of optional cloud replication adapters."""
        is_silent = self.is_air_gapped()
        estop = self.is_estop_active()

        turso_configured = bool(self.get_secret("TURSO_DATABASE_URL"))
        qdrant_configured = bool(self.get_secret("QDRANT_URL"))
        neo4j_configured = bool(self.get_secret("NEO4J_URI"))

        any_configured = turso_configured or qdrant_configured or neo4j_configured

        if is_silent or estop:
            status = "DORMANT"
        elif not any_configured:
            status = "STANDBY"
        else:
            status = "READY"

        return {
            "status": status,
            "workspace_mode": self.governor.get_mode(),
            "is_silent": is_silent,
            "estop_active": estop,
            "turso_configured": turso_configured,
            "qdrant_configured": qdrant_configured,
            "neo4j_configured": neo4j_configured,
            "last_sync_timestamp": self.get_last_sync_timestamp(),
            "last_sync_records": self._last_sync_records,
            "last_error": self._last_error,
        }

    # -------------------------------------------------------------------------
    # Data Reading Helpers
    # -------------------------------------------------------------------------
    def _fetch_incremental_memories(self, since_ts: float) -> List[Dict[str, Any]]:
        """Reads memory_nodes created or modified since given timestamp."""
        if not self.db_path.exists() and str(self.db_path) != ":memory:":
            return []
        records: List[Dict[str, Any]] = []
        try:
            conn = sqlite3.connect(str(self.db_path), timeout=5.0)
            conn.row_factory = sqlite3.Row
            try:
                rows = conn.execute(
                    """
                    SELECT id, namespace, title, content, metadata_json, embedding_blob, is_encrypted, created_at, updated_at
                    FROM memory_nodes
                    WHERE updated_at > ?
                    ORDER BY updated_at ASC
                    LIMIT 200;
                    """,
                    (since_ts,),
                ).fetchall()
                for r in rows:
                    records.append({
                        "id": r["id"],
                        "namespace": r["namespace"],
                        "title": r["title"],
                        "content": r["content"],
                        "metadata_json": r["metadata_json"],
                        "embedding_blob": r["embedding_blob"],
                        "is_encrypted": int(r["is_encrypted"]),
                        "created_at": float(r["created_at"]),
                        "updated_at": float(r["updated_at"]),
                    })
            finally:
                conn.close()
        except Exception as exc:
            logger.debug("Fetch incremental memories notice: %s", exc)
        return records

    @staticmethod
    def _unpack_vector(blob: bytes) -> List[float]:
        """Unpacks float32 binary embedding blob."""
        if not blob:
            return []
        count = len(blob) // 4
        return list(struct.unpack(f"{count}f", blob))

    # -------------------------------------------------------------------------
    # Target 1: Turso libSQL HTTP Pipeline Sync
    # -------------------------------------------------------------------------
    def _sync_to_turso(self, records: List[Dict[str, Any]]) -> int:
        """Replicates incremental memory records to remote Turso libSQL database via HTTP."""
        if not records:
            return 0

        turso_url = self.get_secret("TURSO_DATABASE_URL")
        turso_token = self.get_secret("TURSO_AUTH_TOKEN")
        if not turso_url:
            return 0

        # Normalize URL to HTTP pipeline endpoint
        parsed = urllib.parse.urlparse(turso_url)
        scheme = "https" if parsed.scheme in ("https", "libsql") else "http"
        netloc = parsed.netloc or parsed.path
        if netloc.startswith("libsql://"):
            netloc = netloc[9:]
        pipeline_url = f"{scheme}://{netloc}/v2/pipeline"

        requests_batch: List[Dict[str, Any]] = []
        for r in records:
            sql = """
            INSERT INTO memory_nodes (id, namespace, title, content, metadata_json, is_encrypted, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                content = excluded.content,
                metadata_json = excluded.metadata_json,
                updated_at = excluded.updated_at;
            """
            args = [
                {"type": "text", "value": r["id"]},
                {"type": "text", "value": r["namespace"]},
                {"type": "text", "value": r["title"]},
                {"type": "text", "value": r["content"]},
                {"type": "text", "value": r.get("metadata_json") or "{}"},
                {"type": "integer", "value": str(r.get("is_encrypted", 0))},
                {"type": "float", "value": r["created_at"]},
                {"type": "float", "value": r["updated_at"]},
            ]
            requests_batch.append({
                "type": "execute",
                "stmt": {"sql": sql, "args": args},
            })

        payload = json.dumps({"requests": requests_batch}).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Nexus-CloudSync/5.0",
        }
        if turso_token:
            headers["Authorization"] = f"Bearer {turso_token}"

        req = urllib.request.Request(pipeline_url, data=payload, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=10.0) as resp:
            if resp.status in (200, 201):
                logger.info("Replicated %d records to Turso libSQL.", len(records))
                return len(records)
            else:
                logger.warning("Turso sync returned status code: %d", resp.status)
                return 0

    # -------------------------------------------------------------------------
    # Target 2: Qdrant Cloud Vector REST Upsert
    # -------------------------------------------------------------------------
    def _sync_to_qdrant(self, records: List[Dict[str, Any]]) -> int:
        """Upserts vectorized memories to Qdrant Cloud via REST API."""
        qdrant_url = self.get_secret("QDRANT_URL")
        qdrant_key = self.get_secret("QDRANT_API_KEY")
        if not qdrant_url:
            return 0

        vector_points: List[Dict[str, Any]] = []
        for r in records:
            blob = r.get("embedding_blob")
            if not blob or not isinstance(blob, bytes):
                continue
            vec = self._unpack_vector(blob)
            if not vec:
                continue

            vector_points.append({
                "id": str(r["id"]),
                "vector": vec,
                "payload": {
                    "title": r["title"],
                    "namespace": r["namespace"],
                    "created_at": r["created_at"],
                    "updated_at": r["updated_at"],
                },
            })

        if not vector_points:
            return 0

        target_url = f"{qdrant_url.rstrip('/')}/collections/{self.DEFAULT_QDRANT_COLLECTION}/points?wait=true"
        payload = json.dumps({"points": vector_points}).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Nexus-CloudSync/5.0",
        }
        if qdrant_key:
            headers["api-key"] = qdrant_key

        req = urllib.request.Request(target_url, data=payload, headers=headers, method="PUT")
        with urllib.request.urlopen(req, timeout=10.0) as resp:
            if resp.status in (200, 201):
                logger.info("Upserted %d vector points to Qdrant Cloud.", len(vector_points))
                return len(vector_points)
            else:
                logger.warning("Qdrant upsert returned status: %d", resp.status)
                return 0

    # -------------------------------------------------------------------------
    # Target 3: Neo4j Aura Cypher HTTP Transaction Sync
    # -------------------------------------------------------------------------
    def _sync_to_neo4j(self, records: List[Dict[str, Any]]) -> int:
        """Projects memory nodes into Neo4j Aura knowledge graph via Cypher HTTP transaction."""
        neo4j_uri = self.get_secret("NEO4J_URI")
        neo4j_password = self.get_secret("NEO4J_PASSWORD")
        if not neo4j_uri:
            return 0

        parsed = urllib.parse.urlparse(neo4j_uri)
        scheme = "https" if parsed.scheme in ("https", "neo4j+s", "bolt+s") else "http"
        netloc = parsed.netloc or parsed.path
        if netloc.startswith("neo4j+s://"):
            netloc = netloc[10:]
        elif netloc.startswith("bolt+s://"):
            netloc = netloc[9:]

        commit_url = f"{scheme}://{netloc}/db/{self.DEFAULT_NEO4J_DATABASE}/tx/commit"

        statements: List[Dict[str, Any]] = []
        for r in records:
            cypher = """
            MERGE (m:MemoryNode {id: $id})
            SET m.title = $title,
                m.namespace = $namespace,
                m.updated_at = $updated_at
            MERGE (ns:Namespace {name: $namespace})
            MERGE (m)-[:BELONGS_TO]->(ns)
            """
            statements.append({
                "statement": cypher,
                "parameters": {
                    "id": str(r["id"]),
                    "title": str(r["title"]),
                    "namespace": str(r["namespace"]),
                    "updated_at": float(r["updated_at"]),
                },
            })

        if not statements:
            return 0

        payload = json.dumps({"statements": statements}).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Nexus-CloudSync/5.0",
        }
        if neo4j_password:
            auth_str = f"neo4j:{neo4j_password}"
            b64_auth = base64.b64encode(auth_str.encode("utf-8")).decode("utf-8")
            headers["Authorization"] = f"Basic {b64_auth}"

        req = urllib.request.Request(commit_url, data=payload, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=10.0) as resp:
            if resp.status in (200, 201):
                logger.info("Projected %d memory nodes to Neo4j Aura graph.", len(statements))
                return len(statements)
            else:
                logger.warning("Neo4j commit returned status: %d", resp.status)
                return 0

    # -------------------------------------------------------------------------
    # Master Sync Orchestration
    # -------------------------------------------------------------------------
    def sync_incremental(self, force: bool = False) -> Dict[str, Any]:
        """
        Executes an incremental sync pass to configured cloud targets.
        Strictly stays in STANDBY if unconfigured, in SILENT mode, or if ESTOP is active.
        """
        # Invariant 1: Air-Gap Confinement
        if self.is_air_gapped():
            logger.info("SILENT mode active: skipping cloud memory sync.")
            return {
                "success": False,
                "status": "STANDBY",
                "reason": "AIR_GAPPED_SILENT_MODE",
                "synced": 0,
            }

        # Invariant 2: Emergency Stop Check
        if self.is_estop_active():
            logger.warning("ESTOP active: cloud memory sync blocked.")
            return {
                "success": False,
                "status": "STANDBY",
                "reason": "ESTOP_ACTIVE",
                "synced": 0,
            }

        turso_configured = bool(self.get_secret("TURSO_DATABASE_URL"))
        qdrant_configured = bool(self.get_secret("QDRANT_URL"))
        neo4j_configured = bool(self.get_secret("NEO4J_URI"))

        if not (turso_configured or qdrant_configured or neo4j_configured):
            return {
                "success": True,
                "status": "STANDBY",
                "reason": "NO_CREDENTIALS_CONFIGURED",
                "synced": 0,
            }

        if not self._sync_lock.acquire(blocking=False):
            return {
                "success": False,
                "status": "BUSY",
                "reason": "SYNC_IN_PROGRESS",
                "synced": 0,
            }

        try:
            since_ts = 0.0 if force else self.get_last_sync_timestamp()
            records = self._fetch_incremental_memories(since_ts)

            if not records:
                return {
                    "success": True,
                    "status": "UP_TO_DATE",
                    "reason": "NO_NEW_RECORDS",
                    "synced": 0,
                }

            turso_count = 0
            qdrant_count = 0
            neo4j_count = 0

            # 1. Turso Replication
            if turso_configured:
                try:
                    turso_count = self._sync_to_turso(records)
                except Exception as exc:
                    self._last_error = f"Turso sync error: {exc}"
                    logger.warning(self._last_error)

            # 2. Qdrant Vector Upsert
            if qdrant_configured:
                try:
                    qdrant_count = self._sync_to_qdrant(records)
                except Exception as exc:
                    self._last_error = f"Qdrant sync error: {exc}"
                    logger.warning(self._last_error)

            # 3. Neo4j Graph Export
            if neo4j_configured:
                try:
                    neo4j_count = self._sync_to_neo4j(records)
                except Exception as exc:
                    self._last_error = f"Neo4j sync error: {exc}"
                    logger.warning(self._last_error)

            total_synced = max(turso_count, qdrant_count, neo4j_count)
            if total_synced > 0:
                max_updated = max(r["updated_at"] for r in records)
                self.set_last_sync_timestamp(max_updated)
                self._last_sync_records = total_synced
                self._last_error = None

            return {
                "success": True,
                "status": "SYNCED",
                "synced": total_synced,
                "turso_count": turso_count,
                "qdrant_count": qdrant_count,
                "neo4j_count": neo4j_count,
                "timestamp": time.time(),
            }
        finally:
            self._sync_lock.release()

    def sync_async(self, force: bool = False) -> threading.Thread:
        """Executes sync_incremental in a non-blocking background daemon thread."""
        thread = threading.Thread(
            target=self.sync_incremental,
            kwargs={"force": force},
            daemon=True,
            name="nexus-cloud-memory-sync",
        )
        thread.start()
        return thread
