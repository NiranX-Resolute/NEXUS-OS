"""Nexus OS v5.0 - Haru-4B Full-Duplex Voice Bridge Client.

Wires the Higurashi-AI Haru-4B full-duplex conversational model (7.5 Hz / 133ms frames)
into the Nexus voice pipeline, PersonaEngine, and FederatedComputePool.
Enforces strict Windows DPAPI secret sovereignty, 15s health caching,
and immediate (<50ms) local fallback on offline, timeout, or SILENT air-gap switch.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
from pathlib import Path
import sqlite3
import time
from typing import Any, Dict, List, Optional, Tuple, Union
import urllib.error
import urllib.parse
import urllib.request
import wave

from core.runtime.workspaces import WorkspaceGovernor
from core.runtime.compute_pool import FederatedComputePool
from core.bridge.persona_engine import PersonaEngine, get_persona_engine

logger = logging.getLogger("nexus.bridge.haru_client")

# 133ms at 16kHz 16-bit mono PCM = 2128 samples * 2 bytes = 4256 bytes
HARU_FRAME_MS = 133.33
HARU_FRAME_SAMPLES = 2128
HARU_FRAME_BYTES = 4256
HEALTH_CHECK_TIMEOUT_SEC = 2.0
HEALTH_CACHE_TTL_SEC = 15.0
STREAM_TIMEOUT_SEC = 2.5


class HaruUnavailableError(Exception):
    """Raised when Haru-4B duplex node is unreachable, offline, timed out, or air-gapped."""


class HaruDuplexClient:
    """Full-Duplex Streaming Client for Haru-4B Audio Bridge."""

    def __init__(
        self,
        governor: Optional[WorkspaceGovernor] = None,
        pool: Optional[FederatedComputePool] = None,
        db_path: Optional[Union[str, Path]] = None,
        override_url: Optional[str] = None,
    ) -> None:
        self.governor = governor or WorkspaceGovernor()
        self.pool = pool or FederatedComputePool(governor=self.governor)
        if db_path is None:
            self.db_path = Path.home() / ".nexus-agent" / "db" / "agent_local.db"
        else:
            self.db_path = Path(db_path)

        self.override_url = override_url.rstrip("/") if override_url else None
        self._health_cached_status: bool = False
        self._health_cached_latency_ms: float = 0.0
        self._health_cached_time: float = 0.0
        self._health_cached_url: Optional[str] = None
        self._last_activity_ping: float = 0.0
        self._cached_estop_val: bool = False
        self._cached_estop_time: float = 0.0
        self._cached_enabled_val: bool = False
        self._cached_enabled_time: float = 0.0

    def is_air_gapped(self) -> bool:
        """Checks if SILENT mode is active, strictly prohibiting outbound network calls."""
        return self.governor.get_mode().upper() == "SILENT" or self.pool.is_air_gapped()

    def is_estop_active(self, force: bool = False) -> bool:
        """Checks if Emergency Stop (ESTOP) flag is set in SQLite flags with 1.0s caching."""
        now = time.time()
        if not force and (now - self._cached_estop_time) < 1.0:
            return self._cached_estop_val
        if not self.db_path.exists():
            return False
        try:
            conn = sqlite3.connect(str(self.db_path), timeout=1.0)
            try:
                row = conn.execute("SELECT flag_value FROM system_flags WHERE flag_key = 'ESTOP';").fetchone()
                val = bool(row and row[0] == "1")
                self._cached_estop_val = val
                self._cached_estop_time = now
                return val
            finally:
                conn.close()
        except Exception as exc:
            logger.debug("ESTOP flag inspection: %s", exc)
            return False

    def is_enabled(self, force: bool = False) -> bool:
        """Returns True if voice_engine is set to 'haru_4b' in persona settings with 1.0s caching."""
        now = time.time()
        if not force and (now - self._cached_enabled_time) < 1.0:
            return self._cached_enabled_val
        if not self.db_path.exists():
            return False
        try:
            conn = sqlite3.connect(str(self.db_path), timeout=1.0)
            try:
                row = conn.execute("SELECT voice_engine FROM persona_settings WHERE id = 1 LIMIT 1;").fetchone()
                val = bool(row and row[0] == "haru_4b")
                self._cached_enabled_val = val
                self._cached_enabled_time = now
                return val
            finally:
                conn.close()
        except Exception as exc:
            logger.debug("Haru enabled check error: %s", exc)
            return False

    def get_node_url(self) -> Optional[str]:
        """Discovers active Haru-4B node URL from override, vault, or compute pool."""
        if self.is_air_gapped() or self.is_estop_active():
            return None

        if self.override_url:
            return self.override_url

        # 1. DPAPI Vault / Environment Variable
        vault_url = self.pool.get_secret("HARU_DUPLEX_URL") or os.environ.get("HARU_DUPLEX_URL")
        if vault_url:
            return vault_url.strip().rstrip("/")

        # 2. Voice Duplex Node from Federated Compute Pool
        voice_node = self.pool.get_voice_duplex_node()
        if voice_node and voice_node.get("url"):
            return str(voice_node["url"]).strip().rstrip("/")

        # 3. Direct inspection of compute pool cache
        for node in getattr(self.pool, "_nodes_cache", []):
            node_type = str(node.get("type", "")).lower()
            node_id = str(node.get("node_id", "")).lower()
            if node_type in ("voice_duplex", "duplex_voice") or "haru" in node_id:
                if node.get("url"):
                    return str(node["url"]).strip().rstrip("/")

        return None

    def check_health(self, force: bool = False) -> Tuple[bool, float]:
        """Runs a 2.0s health check cached for 15s so offline checks never stall loops."""
        if self.is_air_gapped():
            self._health_cached_status = False
            self._health_cached_latency_ms = 0.0
            return False, 0.0

        now = time.time()
        if not force and (now - self._health_cached_time) < HEALTH_CACHE_TTL_SEC:
            return self._health_cached_status, self._health_cached_latency_ms

        if self.is_estop_active():
            self._health_cached_status = False
            self._health_cached_latency_ms = 0.0
            self._health_cached_time = now
            return False, 0.0

        node_url = self.get_node_url()
        if not node_url:
            self._health_cached_status = False
            self._health_cached_latency_ms = 0.0
            self._health_cached_time = now
            return False, 0.0

        health_url = f"{node_url}/health"
        req = urllib.request.Request(
            health_url,
            headers={"User-Agent": "Nexus-HaruDuplex/5.0", "Accept": "application/json"},
            method="GET",
        )

        start_time = time.perf_counter()
        try:
            with urllib.request.urlopen(req, timeout=HEALTH_CHECK_TIMEOUT_SEC) as resp:
                status_code = resp.status
                latency_ms = round((time.perf_counter() - start_time) * 1000.0, 2)
                is_healthy = 200 <= status_code < 300
                self._health_cached_status = is_healthy
                self._health_cached_latency_ms = latency_ms if is_healthy else 0.0
                self._health_cached_time = now
                self._health_cached_url = node_url
                return is_healthy, latency_ms
        except urllib.error.HTTPError as http_err:
            latency_ms = round((time.perf_counter() - start_time) * 1000.0, 2)
            # If /health gives 404, check root / as endpoint reachability fallback
            if http_err.code == 404:
                try:
                    root_req = urllib.request.Request(
                        node_url,
                        headers={"User-Agent": "Nexus-HaruDuplex/5.0"},
                        method="GET",
                    )
                    with urllib.request.urlopen(root_req, timeout=HEALTH_CHECK_TIMEOUT_SEC) as root_resp:
                        is_healthy = root_resp.status < 500
                        self._health_cached_status = is_healthy
                        self._health_cached_latency_ms = latency_ms
                        self._health_cached_time = now
                        self._health_cached_url = node_url
                        return is_healthy, latency_ms
                except Exception as root_exc:
                    logger.debug("Haru root endpoint reachability fallback error: %s", root_exc)
            self._health_cached_status = False
            self._health_cached_latency_ms = 0.0
            self._health_cached_time = now
            self._health_cached_url = node_url
            return False, 0.0
        except Exception as exc:
            logger.debug("Haru health check error (%s): %s", health_url, exc)
            self._health_cached_status = False
            self._health_cached_latency_ms = 0.0
            self._health_cached_time = now
            self._health_cached_url = node_url
            return False, 0.0

    def is_available(self, force: bool = False) -> bool:
        """Determines if Haru-4B endpoint is live, healthy, and permitted."""
        healthy, _ = self.check_health(force=force)
        return healthy

    def build_persona_card(self) -> Dict[str, Any]:
        """Builds Haru character persona card dynamically from live PersonaEngine settings."""
        engine = PersonaEngine(db_path=self.db_path, auto_load=True)
        settings = engine.get_settings()
        empathy = settings.get("empathy_pct", 80)
        humor = settings.get("humor_pct", 45)
        candor = settings.get("candor_pct", 85)
        verbosity = settings.get("verbosity_pct", 45)
        preset = settings.get("active_preset", "CARING_COMPANION")

        card_prompt = (
            f"You are Haru, Nexus OS's full-duplex conversational voice companion.\n"
            f"Active Matrix Calibration: Empathy={empathy}%, Humor={humor}%, Candor={candor}%, Verbosity={verbosity}%.\n"
            f"Active Preset Profile: {preset}.\n"
            f"Respond naturally with authentic spoken conversational delivery and zero markdown."
        )

        return {
            "name": "Haru",
            "model": "higurashi-ai/Haru-4B",
            "preset": preset,
            "empathy_pct": empathy,
            "humor_pct": humor,
            "candor_pct": candor,
            "verbosity_pct": verbosity,
            "system_prompt": card_prompt,
        }

    def get_reference_clip_path(self) -> Optional[Path]:
        """Returns path to local reference voice audio clip if valid (3s-180s WAV)."""
        ref_path = Path.home() / ".nexus-agent" / "voices" / "haru_ref.wav"
        if not ref_path.exists() or not ref_path.is_file():
            return None

        size = ref_path.stat().st_size
        if size < 44:
            return None

        try:
            with wave.open(str(ref_path), "rb") as wf:
                framerate = wf.getframerate()
                nframes = wf.getnframes()
                if framerate <= 0:
                    return None
                duration_sec = nframes / float(framerate)
                if 3.0 <= duration_sec <= 180.0:
                    return ref_path
                logger.debug("Haru ref clip duration outside 3s-180s window: %.2fs", duration_sec)
                return None
        except Exception as exc:
            logger.debug("Haru ref clip wave inspection notice: %s", exc)
            return None

    def ping_activity_telemetry(self, node_url: str) -> None:
        """Pings Kaggle QuotaGuardProxy to reset last_activity during active speech."""
        now = time.time()
        if (now - self._last_activity_ping) < 5.0:
            return
        self._last_activity_ping = now

        activity_url = f"{node_url}/_nexus/activity"
        req = urllib.request.Request(
            activity_url,
            data=b"{}",
            headers={"Content-Type": "application/json", "User-Agent": "Nexus-HaruDuplex/5.0"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=1.0) as resp:
                if resp.status < 300:
                    logger.debug("QuotaGuardProxy activity heartbeat confirmed.")
        except Exception as exc:
            logger.debug("QuotaGuardProxy activity ping notice: %s", exc)

    def send_duplex_frame(
        self,
        pcm_frame: bytes,
        persona_card: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Sends a 133ms 16kHz PCM audio frame to the Haru endpoint and parses response."""
        if self.is_air_gapped() or self.is_estop_active():
            raise HaruUnavailableError("SILENT mode or ESTOP active: remote Haru duplex frame transmission denied")

        node_url = self.get_node_url()
        if not node_url:
            raise HaruUnavailableError("No active Haru-4B node registered in FederatedComputePool")

        card = persona_card or self.build_persona_card()
        ref_clip = self.get_reference_clip_path()

        payload = {
            "pcm_frame": base64.b64encode(pcm_frame).decode("ascii"),
            "frame_bytes": len(pcm_frame),
            "sample_rate": 16000,
            "channels": 1,
            "persona_card": card,
            "reference_clip_present": ref_clip is not None,
            "timestamp": time.time(),
        }

        duplex_url = f"{node_url}/api/haru/duplex"
        req_data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            duplex_url,
            data=req_data,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "Nexus-HaruDuplex/5.0",
                "X-Nexus-Activity": "1",
            },
            method="POST",
        )

        start_time = time.perf_counter()
        try:
            with urllib.request.urlopen(req, timeout=STREAM_TIMEOUT_SEC) as resp:
                if resp.status >= 500:
                    raise HaruUnavailableError(f"Haru node returned HTTP {resp.status}")

                raw_body = resp.read()
                data = json.loads(raw_body.decode("utf-8"))
                latency_ms = round((time.perf_counter() - start_time) * 1000.0, 2)

                audio_bytes = b""
                if "audio_response" in data and data["audio_response"]:
                    audio_bytes = base64.b64decode(data["audio_response"])
                elif "pcm_out" in data and data["pcm_out"]:
                    audio_bytes = base64.b64decode(data["pcm_out"])

                self.ping_activity_telemetry(node_url)

                return {
                    "status": "ok",
                    "spoken_text": data.get("spoken_text", ""),
                    "audio_frame": audio_bytes,
                    "latency_ms": latency_ms,
                    "persona_preset": card.get("preset", ""),
                }
        except urllib.error.HTTPError as http_err:
            raise HaruUnavailableError(f"Haru HTTP error {http_err.code}: {http_err.reason}") from http_err
        except Exception as exc:
            raise HaruUnavailableError(f"Haru duplex connection failed: {exc}") from exc

    async def stream_duplex_session(
        self,
        audio_in_queue: Any,
        audio_out_queue: Any,
        stop_event: Any,
    ) -> None:
        """Asynchronously streams 133ms PCM chunks and dispatches incoming frames concurrently."""
        if self.is_air_gapped() or self.is_estop_active():
            raise HaruUnavailableError("SILENT mode or ESTOP active: remote Haru duplex session prohibited")

        node_url = self.get_node_url()
        if not node_url or not self.is_available():
            raise HaruUnavailableError("Haru-4B full-duplex node is unavailable or offline")

        persona_card = self.build_persona_card()

        while not stop_event.is_set():
            if self.is_air_gapped() or self.is_estop_active():
                raise HaruUnavailableError("Session interrupted: SILENT mode or ESTOP engaged mid-stream")

            # Collect next 133ms PCM audio chunk from in-queue
            try:
                if hasattr(audio_in_queue, "get_nowait"):
                    pcm_chunk = audio_in_queue.get_nowait()
                elif asyncio.iscoroutinefunction(getattr(audio_in_queue, "get", None)):
                    pcm_chunk = await asyncio.wait_for(audio_in_queue.get(), timeout=0.2)
                else:
                    pcm_chunk = audio_in_queue.get(timeout=0.2)
            except Exception:
                await asyncio.sleep(0.01)
                continue

            if not pcm_chunk:
                continue

            # Execute frame dispatch
            loop = asyncio.get_running_loop()
            try:
                frame_result = await loop.run_in_executor(
                    None,
                    self.send_duplex_frame,
                    pcm_chunk,
                    persona_card,
                )
            except HaruUnavailableError:
                raise
            except Exception as exc:
                raise HaruUnavailableError(f"Duplex frame transmission error: {exc}") from exc

            # Put synthesized audio/text response into out_queue
            if hasattr(audio_out_queue, "put_nowait"):
                audio_out_queue.put_nowait(frame_result)
            elif asyncio.iscoroutinefunction(getattr(audio_out_queue, "put", None)):
                await audio_out_queue.put(frame_result)
            else:
                audio_out_queue.put(frame_result)

            await asyncio.sleep(0.005)

    def get_status(self) -> Dict[str, Any]:
        """Compiles live Haru status telemetry for IPC route /api/voice/haru/status."""
        air_gapped = self.is_air_gapped()
        active_mode = self.governor.get_mode()
        node_url = self.get_node_url()
        available, latency_ms = self.check_health()
        enabled = self.is_enabled()
        ref_present = self.get_reference_clip_path() is not None

        return {
            "success": True,
            "enabled": enabled,
            "available": available,
            "node_url": node_url,
            "latency_ms": latency_ms,
            "active_mode": active_mode,
            "air_gapped": air_gapped,
            "reference_clip_present": ref_present,
        }
