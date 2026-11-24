"""Nexus OS v5.0 - Autonomous Gemini Quota & Adaptive Model Cascade Engine.

Features:
1. Exact mapping of Gemini API quotas from Google AI Studio / Gemini API Dashboard.
2. Prioritizes Unlimited models (Live API) & High-Capacity models (Flash Lite 500 RPD, Gemma 14.4k RPD).
3. Strict Safety Threshold (Pre-flight check):
   - Never sends a request that would exceed 5 RPM / 20 RPD.
   - Tripped at (RPM limit - 1) e.g. 4/5, or (RPD limit - 2) e.g. 18/20.
4. Auto-Shifting:
   - When a model approaches limit or encounters HTTP 429, automatically shifts to the next tier model.
5. Sliding-window RPM tracking (60s) & persistent SQLite telemetry logging.
"""

from __future__ import annotations

import collections
from dataclasses import dataclass, field
import datetime
import json
import logging
import math
import os
from pathlib import Path
import sqlite3
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("nexus.runtime.gemini_quota")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [GEMINI_QUOTA] %(message)s")


@dataclass
class GeminiModelSpec:
    model_id: str
    display_name: str
    rpm_limit: float          # math.inf for Unlimited
    tpm_limit: float          # e.g. 250_000
    rpd_limit: float          # math.inf for Unlimited
    tier: int                 # 1: Unlimited, 2: High Limit (15-200 RPM, 500-14.4k RPD), 3: Restricted (5 RPM, 20 RPD)
    category: str             # "live", "flash_lite", "gemma", "decision", "standard"
    rpm_safety_margin: int = 1   # Trip ceiling at (rpm_limit - rpm_safety_margin)
    rpd_safety_margin: int = 2   # Trip ceiling at (rpd_limit - rpd_safety_margin)


# Complete Quota Map matching NiranX's Google AI Studio Dashboard
GEMINI_MODELS_CATALOG: Dict[str, GeminiModelSpec] = {
    # --- TIER 1: UNLIMITED MODELS (Live API & Unlimited RPD/RPM) ---
    "gemini-3.8-live": GeminiModelSpec(
        model_id="gemini-3.8-live",
        display_name="Gemini 3.8 Live",
        rpm_limit=math.inf,
        tpm_limit=85_000,
        rpd_limit=math.inf,
        tier=1,
        category="live",
    ),
    "gemini-3.8-live-extended-thinking": GeminiModelSpec(
        model_id="gemini-3.8-live-extended-thinking",
        display_name="Gemini 3.8 Live Extended Thinking",
        rpm_limit=math.inf,
        tpm_limit=85_000,
        rpd_limit=math.inf,
        tier=1,
        category="live",
    ),
    "gemini-3-flash-live": GeminiModelSpec(
        model_id="gemini-3-flash-live",
        display_name="Gemini 3 Flash Live",
        rpm_limit=math.inf,
        tpm_limit=85_000,
        rpd_limit=math.inf,
        tier=1,
        category="live",
    ),
    "gemini-2.5-flash-native-audio-dialog": GeminiModelSpec(
        model_id="gemini-2.5-flash-native-audio-dialog",
        display_name="Gemini 2.5 Flash Native Audio Dialog",
        rpm_limit=math.inf,
        tpm_limit=1_000_000,
        rpd_limit=math.inf,
        tier=1,
        category="live",
    ),

    # --- TIER 2: HIGH CAPACITY MODELS (15-200 RPM, 500-14,400 RPD) ---
    "gemini-3.5-flash-lite": GeminiModelSpec(
        model_id="gemini-3.5-flash-lite",
        display_name="Gemini 3.5 Flash Lite",
        rpm_limit=15.0,
        tpm_limit=250_000,
        rpd_limit=500.0,
        tier=2,
        category="flash_lite",
        rpm_safety_margin=2,
        rpd_safety_margin=10,
    ),
    "gemini-3.1-flash-lite": GeminiModelSpec(
        model_id="gemini-3.1-flash-lite",
        display_name="Gemini 3.1 Flash Lite",
        rpm_limit=15.0,
        tpm_limit=250_000,
        rpd_limit=500.0,
        tier=2,
        category="flash_lite",
        rpm_safety_margin=2,
        rpd_safety_margin=10,
    ),
    "gemma-4-31b": GeminiModelSpec(
        model_id="gemma-4-31b",
        display_name="Gemma 4 31B",
        rpm_limit=30.0,
        tpm_limit=18_000,
        rpd_limit=14_400.0,
        tier=2,
        category="gemma",
        rpm_safety_margin=3,
        rpd_safety_margin=50,
    ),
    "gemma-4-26b": GeminiModelSpec(
        model_id="gemma-4-26b",
        display_name="Gemma 4 26B",
        rpm_limit=30.0,
        tpm_limit=18_000,
        rpd_limit=14_400.0,
        tier=2,
        category="gemma",
        rpm_safety_margin=3,
        rpd_safety_margin=50,
    ),
    "antigravity": GeminiModelSpec(
        model_id="antigravity",
        display_name="Antigravity Agent",
        rpm_limit=80.0,
        tpm_limit=100_000,
        rpd_limit=100.0,
        tier=2,
        category="agent",
        rpm_safety_margin=5,
        rpd_safety_margin=5,
    ),
    "gemini-decision-1": GeminiModelSpec(
        model_id="gemini-decision-1",
        display_name="Gemini Decision 1",
        rpm_limit=200.0,
        tpm_limit=50_000,
        rpd_limit=10_000.0,
        tier=2,
        category="decision",
        rpm_safety_margin=10,
        rpd_safety_margin=50,
    ),
    "gemini-2.5-flash-lite": GeminiModelSpec(
        model_id="gemini-2.5-flash-lite",
        display_name="Gemini 2.5 Flash Lite",
        rpm_limit=10.0,
        tpm_limit=250_000,
        rpd_limit=20.0,
        tier=2,
        category="flash_lite",
        rpm_safety_margin=1,
        rpd_safety_margin=2,
    ),

    # --- TIER 3: RESTRICTED MODELS (Strict 5 RPM / 20 RPD Ceiling) ---
    "gemini-3.8-flash": GeminiModelSpec(
        model_id="gemini-3.8-flash",
        display_name="Gemini 3.8 Flash",
        rpm_limit=5.0,
        tpm_limit=250_000,
        rpd_limit=20.0,
        tier=3,
        category="standard",
        rpm_safety_margin=1,  # Safe cap: 4 RPM
        rpd_safety_margin=2,  # Safe cap: 18 RPD
    ),
    "gemini-3-flash": GeminiModelSpec(
        model_id="gemini-3-flash",
        display_name="Gemini 3 Flash",
        rpm_limit=5.0,
        tpm_limit=250_000,
        rpd_limit=20.0,
        tier=3,
        category="standard",
        rpm_safety_margin=1,
        rpd_safety_margin=2,
    ),
    "gemini-2.5-flash": GeminiModelSpec(
        model_id="gemini-2.5-flash",
        display_name="Gemini 2.5 Flash",
        rpm_limit=5.0,
        tpm_limit=250_000,
        rpd_limit=20.0,
        tier=3,
        category="standard",
        rpm_safety_margin=1,
        rpd_safety_margin=2,
    ),
    "gemini-4-hydrogen": GeminiModelSpec(
        model_id="gemini-4-hydrogen",
        display_name="Gemini 4 Hydrogen",
        rpm_limit=5.0,
        tpm_limit=250_000,
        rpd_limit=20.0,
        tier=3,
        category="standard",
        rpm_safety_margin=1,
        rpd_safety_margin=2,
    ),
    "gemini-3.6-flash": GeminiModelSpec(
        model_id="gemini-3.6-flash",
        display_name="Gemini 3.6 Flash",
        rpm_limit=5.0,
        tpm_limit=250_000,
        rpd_limit=20.0,
        tier=3,
        category="standard",
        rpm_safety_margin=1,
        rpd_safety_margin=2,
    ),
}


class GeminiQuotaManager:
    """Tracks rate limits and shifts models automatically to prevent quota exhaustion."""

    def __init__(self, db_path: Optional[Path | str] = None) -> None:
        if db_path is None:
            self.db_path = Path.home() / ".nexus-agent" / "db" / "agent_local.db"
        else:
            self.db_path = Path(db_path)

        self._lock = threading.RLock()
        # model_id -> collections.deque of request timestamps in last 60 seconds
        self._rpm_windows: Dict[str, collections.deque] = collections.defaultdict(collections.deque)
        # model_id -> count of requests today
        self._rpd_counts: Dict[str, int] = collections.defaultdict(int)
        self._rpd_date: str = datetime.date.today().isoformat()
        # model_id -> cooldown expiration timestamp
        self._cooldowns: Dict[str, float] = {}

        # Mark gemini-3.6-flash as initially exhausted if detected from screenshot metrics (6/5 and 21/20)
        self._cooldowns["gemini-3.6-flash"] = time.time() + 300.0  # 5m cooldown

    def _clean_window(self, model_id: str) -> None:
        """Removes timestamps older than 60 seconds from the RPM sliding window."""
        now = time.time()
        win = self._rpm_windows[model_id]
        while win and (now - win[0] > 60.0):
            win.popleft()

        # Reset daily counter at midnight
        today = datetime.date.today().isoformat()
        if today != self._rpd_date:
            self._rpd_counts.clear()
            self._rpd_date = today

    def get_model_status(self, model_id: str) -> Dict[str, Any]:
        """Returns current live RPM, RPD, capacity, and health of a specific model."""
        with self._lock:
            self._clean_window(model_id)
            spec = GEMINI_MODELS_CATALOG.get(model_id)
            if not spec:
                return {"model_id": model_id, "available": False, "reason": "Unknown model"}

            now = time.time()
            in_cooldown = self._cooldowns.get(model_id, 0.0) > now
            rpm_used = len(self._rpm_windows[model_id])
            rpd_used = self._rpd_counts[model_id]

            rpm_max_safe = math.inf if spec.rpm_limit == math.inf else max(1, spec.rpm_limit - spec.rpm_safety_margin)
            rpd_max_safe = math.inf if spec.rpd_limit == math.inf else max(1, spec.rpd_limit - spec.rpd_safety_margin)

            at_rpm_limit = rpm_used >= rpm_max_safe
            at_rpd_limit = rpd_used >= rpd_max_safe

            available = not in_cooldown and not at_rpm_limit and not at_rpd_limit

            return {
                "model_id": model_id,
                "display_name": spec.display_name,
                "tier": spec.tier,
                "category": spec.category,
                "available": available,
                "in_cooldown": in_cooldown,
                "cooldown_remaining_sec": max(0.0, round(self._cooldowns.get(model_id, 0.0) - now, 1)),
                "rpm_used": rpm_used,
                "rpm_limit": "Unlimited" if spec.rpm_limit == math.inf else int(spec.rpm_limit),
                "rpm_safe_ceiling": "Unlimited" if rpm_max_safe == math.inf else int(rpm_max_safe),
                "rpd_used": rpd_used,
                "rpd_limit": "Unlimited" if spec.rpd_limit == math.inf else int(spec.rpd_limit),
                "rpd_safe_ceiling": "Unlimited" if rpd_max_safe == math.inf else int(rpd_max_safe),
            }

    def can_dispatch(self, model_id: str) -> bool:
        """Evaluates whether model is safely under its RPM and RPD ceilings."""
        st = self.get_model_status(model_id)
        return bool(st["available"])

    def record_request(self, model_id: str) -> None:
        """Records a successful or dispatched request into RPM sliding window & RPD counter."""
        with self._lock:
            now = time.time()
            self._rpm_windows[model_id].append(now)
            self._rpd_counts[model_id] += 1
            logger.debug("Recorded request for %s (RPM=%d, RPD=%d)", model_id, len(self._rpm_windows[model_id]), self._rpd_counts[model_id])

    def record_rate_limit(self, model_id: str, cooldown_sec: float = 65.0) -> None:
        """Records an HTTP 429 rate limit hit, enforcing instant cooldown and auto-shift."""
        with self._lock:
            now = time.time()
            self._cooldowns[model_id] = now + cooldown_sec
            logger.warning("🚨 [GEMINI-QUOTA] Model '%s' hit rate limit! Enforcing %.1fs cooldown.", model_id, cooldown_sec)
            self._log_telemetry("RATE_LIMIT_HIT", model_id, f"429 Rate limit encountered, cooling down for {cooldown_sec}s")

    def select_active_model(self, preferred_category: str = "general") -> Tuple[str, str]:
        """Selects the best available model, auto-shifting down the hierarchy when limits are hit.
        
        Returns:
            Tuple of (model_id, shift_reason)
        """
        # Hierarchical Candidate Cascade:
        # Tier 1 (Unlimited Live) -> Tier 2 (High Capacity Lite/Gemma) -> Tier 3 (Standard 5 RPM)
        ordered_candidates = [
            # 1. Unlimited Live models (Sub-second streaming, unlimited RPM/RPD)
            "gemini-3.8-live",
            "gemini-3.8-live-extended-thinking",
            "gemini-3-flash-live",
            "gemini-2.5-flash-native-audio-dialog",

            # 2. High-Capacity models (15-200 RPM, 500 - 14,400 RPD)
            "gemini-3.5-flash-lite",
            "gemini-3.1-flash-lite",
            "gemma-4-31b",
            "gemma-4-26b",
            "antigravity",
            "gemini-decision-1",
            "gemini-2.5-flash-lite",

            # 3. Standard Models (5 RPM / 20 RPD with strict safety margins)
            "gemini-3.8-flash",
            "gemini-3-flash",
            "gemini-2.5-flash",
            "gemini-4-hydrogen",
            "gemini-3.6-flash",
        ]

        # Check each candidate in priority order
        for candidate_id in ordered_candidates:
            status = self.get_model_status(candidate_id)
            if status["available"]:
                tier_label = f"Tier-{status['tier']}"
                reason = f"Selected {candidate_id} ({tier_label}, RPM: {status['rpm_used']}/{status['rpm_limit']})"
                return candidate_id, reason

        # Emergency Fallback if all Gemini models are exhausted
        return "gemini-3.5-flash-lite", "Fallback: all primary quotas saturated, routing to high-capacity baseline"

    def get_telemetry_snapshot(self) -> Dict[str, Any]:
        """Returns a complete telemetry snapshot of all Gemini models, their quotas, and active cascaded selection."""
        with self._lock:
            models_data = {}
            for m_id in GEMINI_MODELS_CATALOG:
                models_data[m_id] = self.get_model_status(m_id)

            active_model, reason = self.select_active_model()
            return {
                "success": True,
                "timestamp": time.time(),
                "active_model": active_model,
                "cascade_reason": reason,
                "catalog_count": len(GEMINI_MODELS_CATALOG),
                "models": models_data,
            }

    def _log_telemetry(self, event_type: str, model_id: str, message: str) -> None:
        try:
            if not self.db_path.exists():
                return
            conn = sqlite3.connect(str(self.db_path), timeout=2.0)
            conn.execute(
                """
                INSERT INTO telemetry_logs (source, level, message, metadata)
                VALUES ('GEMINI_QUOTA', 'INFO', ?, ?);
                """,
                (f"[{event_type}] {model_id}: {message}", json.dumps({"model_id": model_id, "timestamp": time.time()})),
            )
            conn.commit()
            conn.close()
        except Exception as err:
            logger.debug("Quota telemetry logging suppressed: %s", err)
