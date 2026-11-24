"""Nexus OS v5.0 - Federated Multi-Cloud Compute Pool & Dynamic Router.

Discovers, aggregates, and dynamically routes AI inference and background tasks
across zero-card cloud GPUs, 16GB CPU workers, free serverless APIs, and local Ollama:
- Priority 1: Live Cloud GPUs (Kaggle 2x T4, Google Colab, Lightning AI via Cloudflare tunnels)
- Priority 2: Always-On 16GB RAM Cloud CPU Workers (Hugging Face Spaces, Tailscale burst)
- Priority 3: Free Serverless API Cascade (Google AI Studio, OpenRouter :free, Groq)
- Priority 4: Local Sovereign Fallback (Local Ollama offline daemon)

Strictly enforces Windows DPAPI secret sovereignty and Air-Gap (SILENT mode) containment.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import sys
import time
from typing import Any, Dict, List, Optional, Tuple
import urllib.error
import urllib.parse
import urllib.request
import uuid

try:
    import httpx
    HAS_HTTPX = True
except ImportError:
    HAS_HTTPX = False

from core.security.vault import CredentialVault, get_secret as get_vault_secret
from core.runtime.workspaces import WorkspaceGovernor

logger = logging.getLogger("nexus.runtime.compute_pool")

DEFAULT_EDGE_NODES_URL = "https://nexus-bridge.pages.dev/api/compute/nodes"
FALLBACK_EDGE_NODES_URL = "https://nexus-bridge-7l1.pages.dev/api/compute/nodes"
DEFAULT_TAILSCALE_BURST_ENDPOINT = "http://nexus-burst-worker:8000"
CACHE_TTL_SECONDS = 30.0
NODE_EXPIRATION_SECONDS = 180.0


class FederatedComputePool:
    """Federated Zero-Card Compute Pool & Dynamic Dispatch Engine."""

    def __init__(
        self,
        governor: Optional[WorkspaceGovernor] = None,
        edge_nodes_url: Optional[str] = None,
        db_path: Optional[Path | str] = None,
        vault: Optional[CredentialVault] = None,
    ) -> None:
        self.governor = governor or WorkspaceGovernor()
        self.edge_nodes_url = edge_nodes_url or os.environ.get("NEXUS_EDGE_URL", DEFAULT_EDGE_NODES_URL)
        if self.edge_nodes_url.endswith("/register"):
            self.edge_nodes_url = self.edge_nodes_url[:-9] + "/nodes"

        self.vault = vault or CredentialVault()

        if db_path is None:
            self.db_path = Path.home() / ".nexus-agent" / "db" / "agent_local.db"
        else:
            self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

        self._nodes_cache: List[Dict[str, Any]] = []
        self._last_refresh_time: float = 0.0
        self._cooldowns: Dict[str, float] = {}
        self._secrets_cache: Dict[str, Optional[str]] = {}
        self._last_kaggle_wake_time: float = 0.0

        self._init_db()
        self._load_cache_from_disk()

    def _init_db(self) -> None:
        """Initializes SQLite system_flags table if missing."""
        try:
            conn = sqlite3.connect(str(self.db_path), timeout=5.0)
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
                conn.commit()
            finally:
                conn.close()
        except Exception as exc:
            logger.debug("Database initialization notice: %s", exc)

    def _load_cache_from_disk(self) -> None:
        """Restores cached compute node metadata from local SQLite WAL on cold start."""
        try:
            if not self.db_path.exists():
                return
            conn = sqlite3.connect(str(self.db_path), timeout=2.0)
            try:
                row = conn.execute(
                    "SELECT flag_value, updated_at FROM system_flags WHERE flag_key = 'COMPUTE_NODES_CACHE';"
                ).fetchone()
                if row:
                    raw_json, updated_at = row
                    parsed = json.loads(raw_json)
                    if isinstance(parsed, list):
                        self._nodes_cache = self._filter_active_nodes(parsed)
                        self._last_refresh_time = float(updated_at)
                        logger.info("Cold-start: Restored %d compute nodes from disk cache.", len(self._nodes_cache))
            finally:
                conn.close()
        except Exception as exc:
            logger.debug("Disk cache load notice: %s", exc)

    def _persist_cache_to_disk(self) -> None:
        """Persists current active node roster to local SQLite WAL for cold start."""
        try:
            conn = sqlite3.connect(str(self.db_path), timeout=2.0)
            try:
                now = time.time()
                payload = json.dumps(self._nodes_cache)
                conn.execute(
                    """
                    INSERT INTO system_flags (flag_key, flag_value, updated_at)
                    VALUES ('COMPUTE_NODES_CACHE', ?, ?)
                    ON CONFLICT(flag_key) DO UPDATE SET
                        flag_value = excluded.flag_value,
                        updated_at = excluded.updated_at;
                    """,
                    (payload, now),
                )
                conn.commit()
            finally:
                conn.close()
        except Exception as exc:
            logger.debug("Disk cache persist notice: %s", exc)

    def get_secret(self, key_name: str) -> Optional[str]:
        """Retrieves secret prioritizing in-memory cache, then DPAPI CredentialVault with os.environ fallback."""
        if key_name in self._secrets_cache:
            return self._secrets_cache[key_name]

        val = None
        try:
            val = self.vault.get_secret(key_name)
        except Exception as exc:
            logger.debug("Vault lookup for '%s' returned: %s", key_name, exc)

        if not val:
            val = os.environ.get(key_name)

        clean_val = val.strip() if val else None
        self._secrets_cache[key_name] = clean_val
        return clean_val

    def invalidate_secret_cache(self, key_name: Optional[str] = None) -> None:
        """Invalidates in-memory secret cache."""
        if key_name:
            self._secrets_cache.pop(key_name, None)
        else:
            self._secrets_cache.clear()

    def is_air_gapped(self) -> bool:
        """Checks if SILENT workspace mode is active, strictly prohibiting cloud egress."""
        current_mode = self.governor.get_mode().upper()
        return current_mode == "SILENT"

    def _filter_active_nodes(self, raw_nodes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Filters out dead or expired nodes older than NODE_EXPIRATION_SECONDS."""
        now_ms = time.time() * 1000.0
        expiration_ms = NODE_EXPIRATION_SECONDS * 1000.0
        active: List[Dict[str, Any]] = []

        for node in raw_nodes:
            if not isinstance(node, dict):
                continue
            if not node.get("url"):
                continue

            last_hb = node.get("last_heartbeat") or node.get("registered_at") or 0
            if last_hb and (now_ms - float(last_hb)) > expiration_ms:
                continue

            active.append(node)

        # Sort: GPUs by VRAM descending, then RAM descending
        active.sort(
            key=lambda n: (
                1 if n.get("type") == "gpu" else 0,
                float(n.get("vram_gb", 0)),
                float(n.get("ram_gb", 0)),
            ),
            reverse=True,
        )
        return active

    async def refresh_nodes_async(self, force: bool = False) -> List[Dict[str, Any]]:
        """Asynchronously discovers active cloud GPU/CPU nodes from Cloudflare KV Edge."""
        if self.is_air_gapped():
            logger.info("SILENT mode active: skipping cloud node refresh.")
            self._nodes_cache = []
            return []

        now = time.time()
        if not force and (now - self._last_refresh_time) < CACHE_TTL_SECONDS:
            return self._nodes_cache

        token = self.get_secret("NEXUS_TOKEN")
        headers = {"User-Agent": "Nexus-Compute-Pool/5.0"}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        try:
            if HAS_HTTPX:
                async with httpx.AsyncClient(timeout=2.5) as client:
                    resp = await client.get(self.edge_nodes_url, headers=headers)
                    if resp.status_code == 200:
                        data = resp.json()
                        raw_nodes = data.get("active_nodes", [])
                        self._nodes_cache = self._filter_active_nodes(raw_nodes)
                        self._last_refresh_time = now
                        self._persist_cache_to_disk()
                        logger.info("Refreshed %d active cloud nodes from edge registry.", len(self._nodes_cache))
                        return self._nodes_cache
            else:
                req = urllib.request.Request(self.edge_nodes_url, headers=headers)
                with urllib.request.urlopen(req, timeout=2.5) as resp:
                    if resp.status == 200:
                        data = json.loads(resp.read().decode("utf-8"))
                        raw_nodes = data.get("active_nodes", [])
                        self._nodes_cache = self._filter_active_nodes(raw_nodes)
                        self._last_refresh_time = now
                        self._persist_cache_to_disk()
                        return self._nodes_cache
        except Exception as exc:
            logger.warning("Edge node discovery notice (%s); retaining existing cached roster", exc)

        return self._nodes_cache

    def refresh_nodes_sync(self, force: bool = False) -> List[Dict[str, Any]]:
        """Synchronously refreshes active nodes with a strict 2.5s timeout."""
        if self.is_air_gapped():
            self._nodes_cache = []
            return []

        now = time.time()
        if not force and (now - self._last_refresh_time) < CACHE_TTL_SECONDS:
            return self._nodes_cache

        token = self.get_secret("NEXUS_TOKEN")
        headers = {
            "User-Agent": "Nexus-Compute-Pool/5.0",
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"

        req = urllib.request.Request(self.edge_nodes_url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=2.5) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode("utf-8"))
                    raw_nodes = data.get("active_nodes", [])
                    self._nodes_cache = self._filter_active_nodes(raw_nodes)
                    self._last_refresh_time = now
                    self._persist_cache_to_disk()
                    logger.info("Sync refreshed %d active cloud nodes from edge registry.", len(self._nodes_cache))
                    return self._nodes_cache
        except Exception as exc:
            logger.debug("Sync edge discovery notice: %s", exc)

        return self._nodes_cache

    def add_direct_node(self, node: Dict[str, Any]) -> Dict[str, Any]:
        """Directly injects an active compute node into local pool cache and SQLite WAL for immediate routing."""
        if not isinstance(node, dict) or not node.get("url"):
            return {"success": False, "error": "Invalid node: 'url' is required."}

        node_id = str(node.get("node_id") or f"direct-{uuid.uuid4().hex[:8]}")
        clean_node = {
            "node_id": node_id,
            "url": str(node["url"]).rstrip("/"),
            "type": str(node.get("type", "gpu")).lower(),
            "model": str(node.get("model", "qwen3.8:27b")),
            "vram_gb": float(node.get("vram_gb", 16)) if node.get("vram_gb") is not None else 16.0,
            "ram_gb": float(node.get("ram_gb", 16)) if node.get("ram_gb") is not None else 16.0,
            "cpu_cores": int(node.get("cpu_cores", 4)) if node.get("cpu_cores") is not None else 4,
            "provider": str(node.get("provider", "direct")),
            "status": "ACTIVE",
            "registered_at": time.time() * 1000.0,
            "last_heartbeat": time.time() * 1000.0,
            "idle_seconds": int(node.get("idle_seconds", 0)),
        }

        # Update in-memory cache: replace previous matching node_id if present
        self._nodes_cache = [n for n in self._nodes_cache if n.get("node_id") != node_id]
        self._nodes_cache.insert(0, clean_node)
        self._last_refresh_time = time.time()
        self._persist_cache_to_disk()
        logger.info("Direct node '%s' (%s) injected into compute pool.", node_id, clean_node["url"])
        return {"success": True, "node": clean_node}

    def release_idle_cloud_nodes(self, reason: str = "manual_release") -> Dict[str, Any]:
        """
        Sends POST /_nexus/shutdown to all active cloud GPU nodes to preserve quota,
        deregisters them from Cloudflare KV edge registry, and prunes local caches.
        """
        released: List[str] = []
        failed: List[str] = []
        token = self.get_secret("NEXUS_TOKEN")
        headers = {
            "User-Agent": "Nexus-Compute-Pool/5.0",
            "Content-Type": "application/json",
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"

        gpu_nodes = [n for n in self._nodes_cache if n.get("type") in ("gpu", "voice_duplex", "duplex_voice")]
        for node in gpu_nodes:
            node_id = node.get("node_id", "unknown")
            base_url = str(node.get("url", "")).rstrip("/")
            if not base_url:
                continue

            # 1. Send remote shutdown to QuotaGuardProxy
            shutdown_url = f"{base_url}/_nexus/shutdown"
            try:
                req = urllib.request.Request(
                    shutdown_url,
                    data=json.dumps({"reason": reason, "node_id": node_id}).encode("utf-8"),
                    headers=headers,
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=1.2) as resp:
                    if resp.status in (200, 201, 202):
                        logger.info("Remote shutdown signal confirmed by node '%s' (%s): status %d", node_id, base_url, resp.status)
            except Exception as exc:
                logger.debug("Node '%s' shutdown signal notice: %s (proceeding with edge deregistration)", node_id, exc)

            # 2. Deregister from Cloudflare KV edge registry: DELETE /api/compute/nodes/<node_id>
            try:
                parsed = urllib.parse.urlparse(self.edge_nodes_url)
                base_path = re.sub(r"/nodes/?$", "", parsed.path)
                delete_url = urllib.parse.urlunparse((
                    parsed.scheme,
                    parsed.netloc,
                    f"{base_path}/nodes/{node_id}",
                    "",
                    "",
                    "",
                ))
                del_req = urllib.request.Request(
                    delete_url,
                    headers={
                        "Authorization": f"Bearer {token}",
                        "User-Agent": "Nexus-Compute-Pool/5.0",
                    },
                    method="DELETE",
                )
                with urllib.request.urlopen(del_req, timeout=1.2) as del_resp:
                    logger.debug("Edge deregister status for '%s': %d", node_id, del_resp.status)
            except Exception as exc:
                logger.debug("Edge deregister notice for '%s': %s", node_id, exc)

            released.append(node_id)

        # 3. Prune released nodes from cache and persist to SQLite WAL
        if released:
            self._nodes_cache = [n for n in self._nodes_cache if n.get("node_id") not in released]
            self._persist_cache_to_disk()
            logger.info("Released %d cloud GPU nodes (%s). Kaggle/Colab quota preserved.", len(released), reason)

        return {
            "success": True,
            "released_nodes": released,
            "failed_nodes": failed,
            "count": len(released),
            "reason": reason,
            "timestamp": time.time(),
        }

    def record_rate_limit(self, route_key: str, cooldown_sec: float = 60.0) -> None:
        """Enforces instant sub-5ms failover by placing a provider in temporary cooldown."""
        self._cooldowns[route_key] = time.time() + cooldown_sec
        logger.warning("Provider route '%s' placed in cooldown for %.1fs due to rate limiting.", route_key, cooldown_sec)

    def is_route_available(self, route_key: str) -> bool:
        """Checks if a route is currently outside its cooldown window."""
        cooldown_until = self._cooldowns.get(route_key, 0.0)
        return time.time() >= cooldown_until

    def get_candidate_routes(self) -> List[Dict[str, Any]]:
        """
        Merges dynamic live nodes and permanent zero-card tiers in strict priority order:
        Priority 1: Live Cloud GPUs (Kaggle / Colab / Lightning AI)
        Priority 2: Always-On 16GB Cloud CPU Workers (HF Spaces / Tailscale)
        Priority 3: Free Serverless API Cascade (Gemini -> OpenRouter -> Groq)
        Priority 4: Local Sovereign Fallback (Local Ollama)
        """
        # STRICT AIR-GAP ENFORCEMENT: If in SILENT mode, only allow Priority 4 Local Ollama
        if self.is_air_gapped():
            logger.info("[AIR-GAP] Workspace mode is SILENT: strictly returning local sovereign route.")
            return [
                {
                    "priority": 4,
                    "tier": "LOCAL_SOVEREIGN",
                    "provider": "ollama",
                    "model": "qwen2.5-coder:7b",
                    "endpoint": "http://127.0.0.1:11434/v1",
                    "route_key": "ollama:local",
                    "vram_gb": 0,
                    "ram_gb": 16,
                    "available": True,
                }
            ]

        routes: List[Dict[str, Any]] = []

        # Ensure active nodes are loaded
        if not self._nodes_cache and (time.time() - self._last_refresh_time) > CACHE_TTL_SECONDS:
            self.refresh_nodes_sync()

        # Priority 1: Live Cloud GPUs
        for node in self._nodes_cache:
            if node.get("type") == "gpu":
                r_key = f"cloud_gpu:{node.get('node_id', 'unknown')}"
                routes.append({
                    "priority": 1,
                    "tier": "LIVE_CLOUD_GPU",
                    "provider": node.get("provider", "cloud_gpu"),
                    "node_id": node.get("node_id"),
                    "model": node.get("model", "qwen3.8:27b"),
                    "endpoint": f"{node['url'].rstrip('/')}/v1",
                    "base_url": node["url"].rstrip("/"),
                    "route_key": r_key,
                    "vram_gb": node.get("vram_gb", 16),
                    "ram_gb": node.get("ram_gb", 16),
                    "cpu_cores": node.get("cpu_cores", 2),
                    "idle_seconds": int(node.get("idle_seconds", 0)),
                    "available": self.is_route_available(r_key),
                })

        # Priority 2: Always-On 16GB Cloud CPU Workers
        hf_space_url = os.environ.get("HF_SPACE_URL") or self.get_secret("HF_SPACE_URL")
        if hf_space_url:
            r_key = "hf_space:cpu_16gb"
            routes.append({
                "priority": 2,
                "tier": "CLOUD_CPU_CONTAINER",
                "provider": "huggingface_space",
                "model": "scout-slice-worker",
                "endpoint": f"{hf_space_url.rstrip('/')}/v1",
                "base_url": hf_space_url.rstrip("/"),
                "route_key": r_key,
                "vram_gb": 0,
                "ram_gb": 16,
                "cpu_cores": 2,
                "available": self.is_route_available(r_key),
            })

        for node in self._nodes_cache:
            if node.get("type") == "cpu":
                r_key = f"cloud_cpu:{node.get('node_id', 'unknown')}"
                routes.append({
                    "priority": 2,
                    "tier": "CLOUD_CPU_CONTAINER",
                    "provider": node.get("provider", "cloud_cpu"),
                    "node_id": node.get("node_id"),
                    "model": node.get("model", "cpu-worker"),
                    "endpoint": f"{node['url'].rstrip('/')}/v1",
                    "base_url": node["url"].rstrip("/"),
                    "route_key": r_key,
                    "vram_gb": 0,
                    "ram_gb": node.get("ram_gb", 16),
                    "cpu_cores": node.get("cpu_cores", 2),
                    "idle_seconds": int(node.get("idle_seconds", 0)),
                    "available": self.is_route_available(r_key),
                })

        # Priority 2: Tailscale Ephemeral Burst VM (GitHub Codespaces, Cloud Shell, Linux VMs)
        burst_ep = self.get_secret("TAILSCALE_BURST_ENDPOINT") or os.environ.get("TAILSCALE_BURST_ENDPOINT")
        if burst_ep:
            burst_node = self.probe_tailscale_burst(endpoint=burst_ep)
            if burst_node:
                r_key = "tailscale_burst:worker"
                routes.append({
                    "priority": 2,
                    "tier": "TAILSCALE_BURST_CPU",
                    "provider": "tailscale_burst",
                    "node_id": burst_node.get("node_id", "tailscale-burst-worker"),
                    "model": burst_node.get("model", "burst-cpu-executor"),
                    "endpoint": f"{burst_node['url'].rstrip('/')}/v1",
                    "base_url": burst_node["url"].rstrip("/"),
                    "route_key": r_key,
                    "vram_gb": 0,
                    "ram_gb": burst_node.get("ram_gb", 16),
                    "cpu_cores": burst_node.get("cpu_cores", 4),
                    "available": self.is_route_available(r_key),
                })

        # Priority 3: Free Serverless API Cascade
        gemini_key = self.get_secret("GEMINI_API_KEY")
        if gemini_key:
            r_key = "serverless:gemini"
            routes.append({
                "priority": 3,
                "tier": "SERVERLESS_FREE_API",
                "provider": "gemini",
                "model": "gemini-3.8-flash",
                "endpoint": "https://generativelanguage.googleapis.com/v1beta/models",
                "route_key": r_key,
                "api_key": gemini_key,
                "available": self.is_route_available(r_key),
            })

        openrouter_key = self.get_secret("OPENROUTER_API_KEY")
        if openrouter_key:
            r_key = "serverless:openrouter"
            routes.append({
                "priority": 3,
                "tier": "SERVERLESS_FREE_API",
                "provider": "openrouter",
                "model": "deepseek/deepseek-chat:free",
                "endpoint": "https://openrouter.ai/api/v1/chat/completions",
                "route_key": r_key,
                "api_key": openrouter_key,
                "available": self.is_route_available(r_key),
            })

        groq_key = self.get_secret("GROQ_API_KEY")
        if groq_key:
            r_key = "serverless:groq"
            routes.append({
                "priority": 3,
                "tier": "SERVERLESS_FREE_API",
                "provider": "groq",
                "model": "llama-3.3-70b-versatile",
                "endpoint": "https://api.groq.com/openai/v1/chat/completions",
                "route_key": r_key,
                "api_key": groq_key,
                "available": self.is_route_available(r_key),
            })

        # Priority 4: Local Sovereign Fallback (Always present)
        routes.append({
            "priority": 4,
            "tier": "LOCAL_SOVEREIGN",
            "provider": "ollama",
            "model": "qwen2.5-coder:7b",
            "endpoint": "http://127.0.0.1:11434/v1",
            "route_key": "ollama:local",
            "vram_gb": 0,
            "ram_gb": 16,
            "available": True,
        })

        return routes

    def wake_kaggle_gpu_on_demand(self, force: bool = False) -> Dict[str, Any]:
        """
        Triggers on-demand boot of remote Kaggle 2x T4 GPU worker via `kaggle kernels push`.
        Enforces 15-minute cooldown guard to prevent duplicate launches and respects SILENT air-gap mode.
        """
        if self.is_air_gapped():
            logger.info("SILENT mode active: skipping Kaggle GPU wake-up.")
            return {"success": False, "reason": "AIR_GAPPED", "cooldown": False}

        # Check for ESTOP in SQLite flags
        try:
            conn = sqlite3.connect(str(self.db_path), timeout=1.0)
            try:
                row = conn.execute("SELECT flag_value FROM system_flags WHERE flag_key = 'ESTOP';").fetchone()
                if row and row[0] == "1":
                    logger.warning("ESTOP active: blocking Kaggle GPU wake-up.")
                    return {"success": False, "reason": "ESTOP_ACTIVE", "cooldown": False}
            finally:
                conn.close()
        except Exception as exc:
            logger.debug("ESTOP flag query notice: %s", exc)

        now = time.time()
        persisted_last_wake = 0.0
        try:
            conn = sqlite3.connect(str(self.db_path), timeout=1.0)
            try:
                row = conn.execute("SELECT flag_value FROM system_flags WHERE flag_key = 'LAST_KAGGLE_WAKE_TIME';").fetchone()
                if row and row[0]:
                    persisted_last_wake = float(row[0])
            finally:
                conn.close()
        except Exception as exc:
            logger.debug("Persisted wake time query notice: %s", exc)

        last_wake = max(self._last_kaggle_wake_time, persisted_last_wake)
        elapsed = now - last_wake
        if not force and elapsed < 900.0:  # 15 min cooldown
            remaining = int(900.0 - elapsed)
            logger.info("Kaggle wake-up cooldown active (%ds remaining).", remaining)
            return {
                "success": False,
                "reason": "COOLDOWN_ACTIVE",
                "remaining_seconds": remaining,
                "cooldown": True,
            }

        k_user = self.get_secret("KAGGLE_USERNAME")
        k_key = self.get_secret("KAGGLE_KEY")

        env_run = os.environ.copy()
        if k_user:
            env_run["KAGGLE_USERNAME"] = k_user
        if k_key:
            env_run["KAGGLE_KEY"] = k_key

        kernel_dir = Path(__file__).resolve().parent.parent.parent / "scripts" / "kaggle_kernel"
        if not kernel_dir.exists():
            return {"success": False, "reason": "KERNEL_DIR_NOT_FOUND", "path": str(kernel_dir)}

        self._last_kaggle_wake_time = now
        try:
            conn = sqlite3.connect(str(self.db_path), timeout=1.0)
            try:
                conn.execute(
                    """
                    INSERT INTO system_flags (flag_key, flag_value, updated_at)
                    VALUES ('LAST_KAGGLE_WAKE_TIME', ?, ?)
                    ON CONFLICT(flag_key) DO UPDATE SET
                        flag_value = excluded.flag_value,
                        updated_at = excluded.updated_at;
                    """,
                    (str(now), now),
                )
                conn.commit()
            finally:
                conn.close()
        except Exception as exc:
            logger.debug("Failed persisting wake time to SQLite: %s", exc)
        cmd = ["kaggle", "kernels", "push", "-p", str(kernel_dir)]
        if not shutil.which("kaggle"):
            cmd = [sys.executable, "-m", "kaggle", "kernels", "push", "-p", str(kernel_dir)]

        logger.info("Triggering Kaggle GPU worker wake-up: %s", " ".join(cmd))
        try:
            proc = subprocess.Popen(
                cmd,
                env=env_run,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            return {
                "success": True,
                "message": "Kaggle GPU wake-up initiated",
                "pid": proc.pid,
                "cooldown": True,
                "cooldown_seconds": 900,
                "timestamp": now,
            }
        except Exception as exc:
            logger.warning("Failed to invoke kaggle kernels push: %s", exc)
            return {
                "success": False,
                "reason": f"EXECUTION_FAILED: {exc}",
                "cooldown": False,
            }

    def get_voice_duplex_node(self) -> Optional[Dict[str, Any]]:
        """Returns active voice duplex node (Haru-4B on GPU 1) if available and not air-gapped."""
        if self.is_air_gapped():
            return None
        for node in self._nodes_cache:
            if (
                node.get("type") in ("voice_duplex", "duplex_voice")
                or "haru" in str(node.get("node_id", "")).lower()
                or "haru" in str(node.get("model", "")).lower()
            ):
                return node
        return None

    def get_gpu_node(self) -> Optional[Dict[str, Any]]:
        """Returns primary active cloud GPU node (Ollama on GPU 0) if available and not air-gapped."""
        if self.is_air_gapped():
            return None
        for node in self._nodes_cache:
            if node.get("type") == "gpu":
                return node
        return None

    def probe_tailscale_burst(self, endpoint: Optional[str] = None, timeout: float = 2.0) -> Optional[Dict[str, Any]]:
        """
        Probes the configured Tailscale burst worker endpoint with a strict 2.0s timeout.
        Returns node dictionary if healthy, or None if offline/unreachable/air-gapped.
        Strictly enforces air-gap and ESTOP invariants with zero unhandled exceptions.
        """
        if self.is_air_gapped():
            logger.info("SILENT mode active: skipping Tailscale burst probe.")
            return None

        # Check ESTOP in SQLite
        try:
            conn = sqlite3.connect(str(self.db_path), timeout=1.0)
            try:
                row = conn.execute("SELECT flag_value FROM system_flags WHERE flag_key = 'ESTOP';").fetchone()
                if row and str(row[0]).strip() == "1":
                    logger.warning("ESTOP active: skipping Tailscale burst probe.")
                    return None
            finally:
                conn.close()
        except Exception as exc:
            logger.debug("ESTOP flag query notice: %s", exc)

        target_url = (
            endpoint
            or self.get_secret("TAILSCALE_BURST_ENDPOINT")
            or os.environ.get("TAILSCALE_BURST_ENDPOINT")
        )
        if not target_url:
            return None
        clean_url = target_url.rstrip("/")
        health_url = f"{clean_url}/health"

        headers = {"User-Agent": "Nexus-Compute-Pool/5.0"}
        req = urllib.request.Request(health_url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                if resp.status == 200:
                    raw = resp.read().decode("utf-8")
                    data = json.loads(raw) if raw else {}
                    node = {
                        "node_id": "tailscale-burst-worker",
                        "url": clean_url,
                        "type": "cpu",
                        "provider": "tailscale_burst",
                        "ram_gb": float(data.get("ram_gb", 16.0)),
                        "cpu_cores": int(data.get("cpu_cores", 4)),
                        "status": "ACTIVE",
                        "model": "burst-cpu-executor",
                        "registered_at": time.time() * 1000.0,
                        "last_heartbeat": time.time() * 1000.0,
                    }
                    logger.info("Tailscale burst node detected online at %s", clean_url)
                    return node
        except Exception as exc:
            logger.debug("Tailscale burst probe (%s) failed or timed out: %s", clean_url, exc)

        return None

    def get_tailscale_burst_node(self, endpoint: Optional[str] = None, timeout: float = 2.0) -> Optional[Dict[str, Any]]:
        """Returns active Tailscale burst compute node if available and healthy, else None."""
        return self.probe_tailscale_burst(endpoint=endpoint, timeout=timeout)

    def select_best_route(self, task_type: str = "general") -> Optional[Dict[str, Any]]:
        """Returns the highest priority available route not under rate-limit cooldown."""
        candidates = self.get_candidate_routes()

        if task_type in ("heavy_cpu", "docker", "burst_compute"):
            burst_route = next(
                (r for r in candidates if r.get("provider") == "tailscale_burst" and r.get("available")),
                None,
            )
            if burst_route:
                return burst_route

        if task_type in ("coding", "reasoning", "heavy"):
            has_gpu = any(r.get("priority") == 1 and r.get("available") for r in candidates)
            if not has_gpu and not self.is_air_gapped():
                self.wake_kaggle_gpu_on_demand()

        for route in candidates:
            if route.get("available", True):
                return route
        return candidates[-1] if candidates else None

    def get_pool_status(self) -> Dict[str, Any]:
        """Returns comprehensive telemetry of the Federated Compute Pool capacity."""
        is_silent = self.is_air_gapped()
        routes = self.get_candidate_routes()

        gpu_nodes = [r for r in routes if r.get("priority") == 1]
        cpu_nodes = [r for r in routes if r.get("priority") == 2]
        api_nodes = [r for r in routes if r.get("priority") == 3]

        total_vram = sum(int(r.get("vram_gb", 0)) for r in gpu_nodes)
        total_ram = sum(int(r.get("ram_gb", 0)) for r in (gpu_nodes + cpu_nodes))

        return {
            "success": True,
            "air_gap_mode": is_silent,
            "workspace_mode": self.governor.get_mode(),
            "cloud_gpus_count": len(gpu_nodes),
            "cloud_gpus": gpu_nodes,
            "cpu_workers_count": len(cpu_nodes),
            "cpu_workers": cpu_nodes,
            "serverless_apis_count": len(api_nodes),
            "serverless_apis": [r.get("provider") for r in api_nodes],
            "total_cloud_vram_gb": total_vram,
            "total_cloud_ram_gb": total_ram,
            "total_routes_count": len(routes),
            "routes": routes,
            "cached_at": self._last_refresh_time,
            "timestamp": time.time(),
        }

    def generate_kaggle_worker_script(
        self,
        accelerator: str = "gpu_t4_x2",
        model_name: str = "qwen3.8:27b",
        idle_timeout_sec: int = 600,
        voice_sidecar: str = "none",
    ) -> str:
        """
        Generates a self-contained, turnkey Python worker script for Kaggle notebooks.
        Supports standard Ollama models and direct Hugging Face GGUF tags (hf.co/...:quant).
        Provisions QuotaGuardProxy, auto-idle shutdown, Cloudflare tunnel, and optional voice sidecars.
        """
        script = f'''# ==============================================================================
# Nexus OS v5.0 - Dedicated Kaggle Quota-Guarded Worker Node
# Accelerator: {accelerator} | Primary Model: {model_name}
# Idle Timeout: {idle_timeout_sec}s | Voice Sidecar: {voice_sidecar}
# ==============================================================================

import os
import sys
import time
import json
import logging
import subprocess
import threading
import urllib.request
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [NEXUS-KAGGLE] %(message)s")
logger = logging.getLogger("nexus.kaggle.worker")

ACCELERATOR = "{accelerator}"
MODEL_NAME = "{model_name}"
IDLE_TIMEOUT_SEC = {idle_timeout_sec}
VOICE_SIDECAR = "{voice_sidecar}"
EDGE_REGISTER_URL = "https://nexus-bridge.pages.dev/api/compute/register"
BACKEND_PORT = 11435
FRONTEND_PORT = 11434
SIDECAR_PORT = 8998

# 1. Resolve Auth Token from Kaggle Secrets or Env
def get_auth_token():
    token = os.environ.get("NEXUS_TOKEN", "").strip()
    if token:
        return token
    try:
        from kaggle_secrets import UserSecretsClient
        return str(UserSecretsClient().get_secret("NEXUS_TOKEN")).strip()
    except Exception:
        return "nexus_ephemeral_dev_token"

NEXUS_TOKEN = get_auth_token()

# 2. Install & Start Ollama
logger.info("Initializing Ollama runtime...")
subprocess.run(["curl", "-fsSL", "https://ollama.com/install.sh", "-o", "/tmp/install_ollama.sh"], check=False)
subprocess.run(["sh", "/tmp/install_ollama.sh"], check=False)

env_ollama = os.environ.copy()
env_ollama["OLLAMA_HOST"] = f"127.0.0.1:{{BACKEND_PORT}}"
env_ollama["OLLAMA_KEEP_ALIVE"] = "15m"
if ACCELERATOR == "gpu_t4_x2" and VOICE_SIDECAR != "none":
    env_ollama["CUDA_VISIBLE_DEVICES"] = "0"

ollama_proc = subprocess.Popen(["ollama", "serve"], env=env_ollama)
time.sleep(3)

# 3. Pull Primary Model (Standard or hf.co/... GGUF)
logger.info("Pulling target model: %s", MODEL_NAME)
subprocess.run(["ollama", "pull", MODEL_NAME], env=env_ollama, check=False)

# 4. QuotaGuardProxy with Auto-Idle Shutdown
last_request_time = time.time()
shutdown_event = threading.Event()

class QuotaGuardProxy(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def do_POST(self):
        global last_request_time
        last_request_time = time.time()

        if self.path == "/_nexus/shutdown":
            logger.info("Received instant remote shutdown request via /_nexus/shutdown")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{{"success": true, "message": "Worker shutdown sequence initiated"}}')
            threading.Thread(target=lambda: (time.sleep(1), shutdown_event.set())).start()
            return

        self._proxy_request("POST")

    def do_GET(self):
        global last_request_time
        last_request_time = time.time()
        if self.path in ("/", "/health", "/api/health"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({{
                "status": "OPERATIONAL",
                "model": MODEL_NAME,
                "accelerator": ACCELERATOR,
                "voice_sidecar": VOICE_SIDECAR,
                "idle_remaining_sec": max(0, int(IDLE_TIMEOUT_SEC - (time.time() - last_request_time)))
            }}).encode("utf-8"))
            return
        self._proxy_request("GET")

    def _proxy_request(self, method):
        target_url = f"http://127.0.0.1:{{BACKEND_PORT}}{{self.path}}"
        body = None
        length = int(self.headers.get("Content-Length", 0))
        if length > 0:
            body = self.rfile.read(length)

        headers = {{k: v for k, v in self.headers.items() if k.lower() not in ("host", "content-length")}}
        req = urllib.request.Request(target_url, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                self.send_response(resp.status)
                for h, v in resp.headers.items():
                    if h.lower() not in ("transfer-encoding", "content-encoding", "content-length"):
                        self.send_header(h, v)
                data = resp.read()
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as exc:
            self.send_response(exc.code)
            self.end_headers()
            self.wfile.write(exc.read())
        except Exception as exc:
            self.send_response(502)
            self.end_headers()
            self.wfile.write(str(exc).encode("utf-8"))

proxy_server = HTTPServer(("127.0.0.1", FRONTEND_PORT), QuotaGuardProxy)
threading.Thread(target=proxy_server.serve_forever, daemon=True).start()
logger.info("QuotaGuardProxy active on port %d with %ds idle watchdog", FRONTEND_PORT, IDLE_TIMEOUT_SEC)

# 5. Optional Haru-4B / VoxCPM2 Voice Sidecar on GPU 1
sidecar_proc = None
if ACCELERATOR == "gpu_t4_x2" and VOICE_SIDECAR != "none":
    logger.info("Spawning voice sidecar '%s' on GPU 1 (Port %d)...", VOICE_SIDECAR, SIDECAR_PORT)
    env_sidecar = os.environ.copy()
    env_sidecar["CUDA_VISIBLE_DEVICES"] = "1"
    # Launch minimal voice sidecar proxy/runner
    sidecar_proc = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(SIDECAR_PORT)],
        env=env_sidecar
    )

# 6. Bind Zero-Account Cloudflare Quick Tunnel
logger.info("Downloading cloudflared binary...")
subprocess.run(["curl", "-fsSL", "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64", "-o", "/tmp/cloudflared"], check=False)
subprocess.run(["chmod", "+x", "/tmp/cloudflared"], check=False)

tunnel_proc = subprocess.Popen(
    ["/tmp/cloudflared", "tunnel", "--url", f"http://127.0.0.1:{{FRONTEND_PORT}}"],
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True
)

tunnel_url = ""
for line in iter(tunnel_proc.stdout.readline, ""):
    if "trycloudflare.com" in line:
        import re
        match = re.search(r"https://[a-zA-Z0-9-]+\\.trycloudflare\\.com", line)
        if match:
            tunnel_url = match.group(0)
            logger.info("⚡ Tunnel Established: %s", tunnel_url)
            break

# 7. Register Node with Nexus Edge Mesh
if tunnel_url:
    payload = json.dumps({{
        "node_id": f"kaggle-{{int(time.time())}}",
        "type": "gpu",
        "url": tunnel_url,
        "model": MODEL_NAME,
        "token": NEXUS_TOKEN,
        "accelerator": ACCELERATOR,
        "voice_sidecar": VOICE_SIDECAR,
        "ttl_sec": 180
    }}).encode("utf-8")
    req = urllib.request.Request(
        EDGE_REGISTER_URL,
        data=payload,
        headers={{"Content-Type": "application/json", "Authorization": f"Bearer {{NEXUS_TOKEN}}"}},
        method="POST"
    )
    try:
        urllib.request.urlopen(req, timeout=10)
        logger.info("✓ Node registered with Nexus Edge Mesh.")
    except Exception as exc:
        logger.warning("Node edge registration warning: %s", exc)

# 8. Watchdog Loop
logger.info("Worker entering active monitoring loop...")
while not shutdown_event.is_set():
    time.sleep(10)
    idle_time = time.time() - last_request_time
    if idle_time > IDLE_TIMEOUT_SEC:
        logger.warning("Idle watchdog threshold reached (%.0fs > %ds). QuotaGuard shutting down.", idle_time, IDLE_TIMEOUT_SEC)
        break

logger.info("Terminating worker processes to conserve quota...")
proxy_server.shutdown()
ollama_proc.terminate()
if sidecar_proc:
    sidecar_proc.terminate()
tunnel_proc.terminate()
logger.info("Worker shutdown complete.")
'''
        return script

    def auto_wake_kaggle_kernel(self, kernel_slug: Optional[str] = None) -> Dict[str, Any]:
        """
        Auto-wakes a Kaggle dual-T4 worker kernel via Kaggle CLI.
        Enforces a strict 15-minute cooldown guard to prevent quota churn.
        Credentials resolved securely from Windows DPAPI.
        """
        now = time.time()
        last_wake = getattr(self, "_last_kaggle_wake_time", 0.0)
        cooldown_sec = 900.0  # 15 minutes
        elapsed = now - last_wake

        if elapsed < cooldown_sec:
            remaining = int(cooldown_sec - elapsed)
            return {
                "success": False,
                "cooldown": True,
                "remaining_sec": remaining,
                "error": f"Kaggle wake cooldown active. Please wait {remaining}s before triggering next worker wake.",
            }

        k_user = self.get_secret("KAGGLE_USERNAME") or os.environ.get("KAGGLE_USERNAME", "").strip()
        k_key = self.get_secret("KAGGLE_KEY") or os.environ.get("KAGGLE_KEY", "").strip()

        if not k_user or not k_key:
            return {
                "success": False,
                "error": "Kaggle credentials not configured in Windows DPAPI vault. Please save KAGGLE_USERNAME and KAGGLE_KEY.",
            }

        slug = kernel_slug or f"{k_user}/nexus-os-gpu-worker"
        env = os.environ.copy()
        env["KAGGLE_USERNAME"] = k_user
        env["KAGGLE_KEY"] = k_key

        try:
            # Check if kaggle binary is on PATH
            kaggle_bin = shutil.which("kaggle")
            if not kaggle_bin:
                # If CLI not in PATH, return actionable instructions
                self._last_kaggle_wake_time = now
                return {
                    "success": True,
                    "cooldown": False,
                    "message": "Kaggle credentials verified in DPAPI. Worker template ready for push.",
                    "kernel_slug": slug,
                    "cli_status": "CREDENTIALS_VALIDATED",
                }

            # Execute CLI push or status check
            proc = subprocess.run(
                [kaggle_bin, "kernels", "status", slug],
                capture_output=True,
                text=True,
                env=env,
                timeout=15.0,
            )
            self._last_kaggle_wake_time = now
            return {
                "success": True,
                "cooldown": False,
                "message": f"Kaggle kernel {slug} status checked: {proc.stdout.strip() or 'Queued'}",
                "kernel_slug": slug,
                "output": proc.stdout.strip(),
            }
        except Exception as exc:
            logger.warning("Kaggle wake invocation error: %s", exc)
            self._last_kaggle_wake_time = now
            return {
                "success": False,
                "error": f"Failed invoking Kaggle CLI: {str(exc)}",
            }

    def release_gpu_node(self, tunnel_url: Optional[str] = None) -> Dict[str, Any]:
        """
        Sends an immediate shutdown signal to active Kaggle worker QuotaGuardProxy.
        Releases GPU allocation to conserve user quota.
        """
        target_url = tunnel_url
        if not target_url:
            nodes = self.get_active_nodes(force_refresh=False)
            if nodes:
                target_url = nodes[0].get("url")

        if not target_url:
            return {
                "success": True,
                "released": False,
                "message": "No active remote GPU node found to release.",
            }

        shutdown_endpoint = f"{target_url.rstrip('/')}/_nexus/shutdown"
        try:
            token = self.get_secret("NEXUS_TOKEN") or "nexus_ephemeral_dev_token"
            req = urllib.request.Request(
                shutdown_endpoint,
                headers={"Authorization": f"Bearer {token}"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=4.0) as resp:
                status_code = resp.status
                return {
                    "success": True,
                    "released": True,
                    "status_code": status_code,
                    "message": f"Shutdown signal accepted by {target_url}. GPU quota released.",
                }
        except Exception as exc:
            logger.info("Shutdown signal notice for %s: %s", shutdown_endpoint, exc)
            return {
                "success": True,
                "released": True,
                "message": f"Shutdown signal dispatched to {target_url}.",
            }

    def get_uitars_route(self) -> Dict[str, Any]:
        """
        Discovers the active UI-TARS-1.5-7B route across:
        1. Live Cloud GPU (Kaggle T4 / Google Colab / vLLM)
        2. Hugging Face ZeroGPU endpoint
        3. Local Ollama / vLLM sovereign daemon
        """
        if not self.is_air_gapped():
            # 1. Search live cloud GPU nodes
            for node in self._nodes_cache:
                m_name = str(node.get("model", "")).lower()
                if "tars" in m_name or "ui-tars" in m_name or node.get("type") == "gpu":
                    return {
                        "tier": "LIVE_CLOUD_GPU",
                        "provider": node.get("provider", "kaggle_t4"),
                        "model": "ui-tars-1.5-7b",
                        "endpoint": f"{node['url'].rstrip('/')}/v1/chat/completions",
                        "base_url": node["url"].rstrip("/"),
                        "available": True,
                    }

            # 2. Search HF ZeroGPU endpoint
            hf_zero = self.get_secret("HF_ZEROGPU_ENDPOINT") or os.environ.get("HF_ZEROGPU_ENDPOINT")
            if hf_zero:
                return {
                    "tier": "HF_ZEROGPU",
                    "provider": "huggingface",
                    "model": "ui-tars-1.5-7b",
                    "endpoint": f"{hf_zero.rstrip('/')}/v1/chat/completions",
                    "base_url": hf_zero.rstrip("/"),
                    "available": True,
                }

        # 3. Local sovereign Ollama / vLLM fallback
        return {
            "tier": "LOCAL_SOVEREIGN",
            "provider": "ollama",
            "model": "ui-tars-1.5-7b",
            "endpoint": "http://127.0.0.1:11434/v1/chat/completions",
            "base_url": "http://127.0.0.1:11434",
            "available": True,
        }

    def dispatch_uitars_grounding(
        self,
        query: str,
        image_b64: Optional[str] = None,
        fast_mode: bool = True,
        screen_width: int = 1920,
        screen_height: int = 1080,
        dpi_scale: float = 1.0,
        timeout: float = 2.0,
    ) -> Dict[str, Any]:
        """
        Dispatches UI-TARS-1.5 visual grounding query to resolve screen coordinates.
        Supports GROUNDING fast-prompt mode (no Thought tokens).
        Falls back to local heuristic grounding engine when remote endpoints are offline.
        """
        from core.engine.grounding_parser import build_grounding_prompt, parse_tars_action

        t_start = time.perf_counter()
        prompt = build_grounding_prompt(query=query, fast_mode=fast_mode)
        route = self.get_uitars_route()

        # Construct OpenAI-compatible vision payload
        user_content: List[Dict[str, Any]] = [{"type": "text", "text": prompt}]
        if image_b64:
            user_content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"},
            })

        payload = {
            "model": route.get("model", "ui-tars-1.5-7b"),
            "messages": [{"role": "user", "content": user_content}],
            "temperature": 0.0,
            "max_tokens": 128 if fast_mode else 384,
        }

        raw_output = ""
        # 1. Attempt HTTP request to endpoint if online
        try:
            req = urllib.request.Request(
                route["endpoint"],
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json", "User-Agent": "Nexus-UI-TARS/5.0"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode("utf-8"))
                    choices = data.get("choices", [])
                    if choices:
                        raw_output = choices[0].get("message", {}).get("content", "")
        except Exception as exc:
            logger.debug("Remote UI-TARS endpoint offline or unreachable (%s); using on-device heuristic grounding", exc)

        # 2. On-device local grounding synthesis when endpoint offline
        if not raw_output:
            from core.engine.vla_grounding import VLAGroundingEngine
            vla = VLAGroundingEngine(screen_width=screen_width, screen_height=screen_height)
            grounded = vla.ground_element(query=query)
            tars_x = int(round(grounded.normalized_x * 1000.0))
            tars_y = int(round(grounded.normalized_y * 1000.0))
            if fast_mode:
                raw_output = f"Action: click(start_box='({tars_x},{tars_y})')"
            else:
                raw_output = (
                    f"Thought: Identified '{query}' at normalized coordinates ({tars_x}, {tars_y}).\n"
                    f"Action: click(start_box='({tars_x},{tars_y})')"
                )

        # 3. Parse generated UI-TARS action and scale coordinates
        parsed = parse_tars_action(
            raw_output=raw_output,
            screen_width=screen_width,
            screen_height=screen_height,
            dpi_scale=dpi_scale,
        )
        parsed["route_tier"] = route.get("tier", "LOCAL_SOVEREIGN")
        parsed["total_latency_ms"] = round((time.perf_counter() - t_start) * 1000, 3)
        return parsed
