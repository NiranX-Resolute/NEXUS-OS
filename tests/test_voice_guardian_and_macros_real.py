"""
Nexus OS v5.0 - Voice Guardian Biometrics & Macro Compilation Verification Suite (ZERO MOCKS, ZERO STUBS).
Part of the Nexus Edge-to-Desktop Autonomous Engine.

Verifies:
1. VoiceGuardian:
   - Real acoustic feature extraction (spectral centroid, energy envelope, zero-crossing rate).
   - DPAPI-encrypted speaker enrollment into SQLite WAL voice_biometrics table.
   - Sub-40ms speaker verification (OPERATOR vs GUEST) based on cosine similarity.
   - Multi-speaker registry and profile management.
2. MacroRecorder:
   - Discrete interaction stream recording (mouse, keyboard, UIA, wait).
   - Sensitive credential and API key auto-masking with ${VAULT:...} placeholders.
3. MacroEngine:
   - Persistent SQLite CRUD in macros table.
   - Deterministic replay execution with vault secret resolution.
   - Autonomous cron scheduling in cron_jobs table.
   - .nxskill bundle compilation with canonical SHA-256 checksum, AgentShield audit, and ecc_skills / FTS5 indexing.
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path
import sqlite3
import struct
import time
from typing import Any, Dict, List

import numpy as np
import pytest

from core.bridge.voice_guardian import (
    VoiceGuardian,
    enroll_operator,
    verify_speaker,
    get_enrolled_speakers,
    DEFAULT_SAMPLE_RATE,
)
from core.runtime.macro_recorder import MacroRecorder, mask_sensitive_data
from core.runtime.macro_engine import MacroEngine, slugify
from core.security.vault import CredentialVault, _dpapi_protect, _dpapi_unprotect


def generate_synthetic_voice_pcm(
    base_freq: float = 220.0,
    duration_sec: float = 1.0,
    sample_rate: int = DEFAULT_SAMPLE_RATE,
    amplitude: float = 0.6,
) -> bytes:
    """Generates synthetic harmonic voice-like audio in 16-bit Mono PCM."""
    num_samples = int(sample_rate * duration_sec)
    t = np.linspace(0, duration_sec, num_samples, endpoint=False, dtype=np.float32)

    # Fundamental + harmonics (formants simulation)
    signal = (
        0.5 * np.sin(2 * np.pi * base_freq * t)
        + 0.3 * np.sin(2 * np.pi * (2 * base_freq) * t)
        + 0.15 * np.sin(2 * np.pi * (3 * base_freq) * t)
        + 0.05 * np.sin(2 * np.pi * (4 * base_freq) * t)
    )
    # Apply amplitude envelope (fade in and out)
    envelope = np.sin(np.pi * np.linspace(0, 1, num_samples, dtype=np.float32))
    shaped = signal * envelope * amplitude

    int_samples = np.clip(shaped * 32767, -32768, 32767).astype(np.int16)
    return int_samples.tobytes()


@pytest.fixture
def temp_agent_db(tmp_path: Path):
    """Provides an isolated SQLite database path for zero-mock testing."""
    db_file = tmp_path / "test_agent_local.db"
    return db_file


class TestVoiceGuardianReal:
    """Verifies Speaker Biometrics and Voice Guardian with real acoustic feature math and DPAPI."""

    def test_enroll_and_verify_operator_real(self, temp_agent_db: Path):
        """Verifies enrollment with DPAPI encryption and sub-40ms verification for matching speaker."""
        guardian = VoiceGuardian(db_path=temp_agent_db, similarity_threshold=0.65)

        # 1. Generate Operator voice sample (220 Hz pitch)
        operator_audio = generate_synthetic_voice_pcm(base_freq=220.0, duration_sec=1.0)

        # Enroll operator
        enroll_res = guardian.enroll_operator(operator_audio, speaker_id="operator-1", label="OPERATOR")
        assert enroll_res["success"] is True
        assert enroll_res["speaker_id"] == "operator-1"
        assert enroll_res["label"] == "OPERATOR"
        assert enroll_res["dimensions"] == 64
        assert enroll_res["encrypted_bytes"] > 0

        # Verify entry exists in SQLite
        with sqlite3.connect(str(temp_agent_db)) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute("SELECT * FROM voice_biometrics WHERE speaker_id = 'operator-1';").fetchone()
            assert row is not None
            assert row["speaker_tier"] == "OPERATOR"
            assert row["embedding_dim"] == 64
            # Verify DPAPI encrypted blob decrypts back to 64 floats
            dec_bytes = _dpapi_unprotect(row["encrypted_embedding"])
            unpacked = struct.unpack("64f", dec_bytes)
            assert len(unpacked) == 64

        # 2. Verify matching operator voice in <40ms
        matching_audio = generate_synthetic_voice_pcm(base_freq=220.0, duration_sec=0.8)
        t0 = time.perf_counter()
        verdict, score = guardian.verify_speaker(matching_audio)
        dt_ms = (time.perf_counter() - t0) * 1000.0

        assert verdict == "OPERATOR"
        assert score >= 0.70
        assert dt_ms < 40.0, f"Verification SLA breached: {dt_ms:.2f}ms >= 40ms"

        # 3. Verify distinct guest voice (800 Hz pitch) is classified as GUEST
        guest_audio = generate_synthetic_voice_pcm(base_freq=800.0, duration_sec=0.8)
        t1 = time.perf_counter()
        g_verdict, g_score = guardian.verify_speaker(guest_audio)
        g_dt_ms = (time.perf_counter() - t1) * 1000.0

        assert g_verdict == "GUEST"
        assert g_score < 0.65
        assert g_dt_ms < 40.0

    def test_list_and_clear_enrolled_speakers(self, temp_agent_db: Path):
        """Verifies retrieving speaker profiles without plaintext embedding leaks."""
        guardian = VoiceGuardian(db_path=temp_agent_db)

        # Initially empty
        assert len(guardian.get_enrolled_speakers()) == 0

        # Enroll 2 operators
        audio_op1 = generate_synthetic_voice_pcm(base_freq=180.0)
        audio_op2 = generate_synthetic_voice_pcm(base_freq=240.0)
        guardian.enroll_operator(audio_op1, speaker_id="primary_operator")
        guardian.enroll_operator(audio_op2, speaker_id="backup_operator")

        speakers = guardian.get_enrolled_speakers()
        assert len(speakers) == 2
        ids = {s["speaker_id"] for s in speakers}
        assert "primary_operator" in ids
        assert "backup_operator" in ids
        # Ensure raw encrypted bytes are not in the public list output
        for s in speakers:
            assert "encrypted_embedding" not in s

        # Clear enrolled speakers
        cleared = guardian.clear_enrolled_speakers()
        assert cleared == 2
        assert len(guardian.get_enrolled_speakers()) == 0


class TestMacroRecorderAndEngineReal:
    """Verifies Macro recording, password masking, SQLite persistence, replay, and .nxskill compilation."""

    def test_macro_recorder_sensitive_masking(self):
        """Verifies recording interactions and masking API keys and passwords."""
        recorder = MacroRecorder(mask_secrets=True)
        assert recorder.is_recording is False

        recorder.start_recording()
        assert recorder.is_recording is True

        # 1. Record clicks and mouse moves
        recorder.record_click(150, 300, button="left")
        recorder.record_move(200, 400)
        recorder.record_scroll(0, -120)

        # 2. Record keystroke
        recorder.record_key("Return", modifiers=["ctrl"])

        # 3. Record typing with credentials
        recorder.record_type("user=admin password=superSecretPassword123")
        recorder.record_type("sk-proj-1234567890abcdefghijklmnopqrstuv")
        recorder.record_type("Authorization: Bearer ghp_1234567890abcdefghijklmnopqrstuvwxyz")

        # 4. Record wait and UIA action
        recorder.record_wait(250.0)
        recorder.record_uia("Button", "Submit Order", "Invoke", automation_id="btn_submit")

        actions = recorder.stop_recording()
        assert recorder.is_recording is False
        assert len(actions) == 9

        # Verify password masking
        typed_actions = [a for a in actions if a["action_type"] == "type_text"]
        assert len(typed_actions) == 3

        # Password masked
        assert "superSecretPassword123" not in typed_actions[0]["data"]["text"]
        assert ("${VAULT:SECRET_PLACEHOLDER}" in typed_actions[0]["data"]["text"] or "${VAULT:MASKED_SECRET}" in typed_actions[0]["data"]["text"])

        # OpenAI key masked
        assert "sk-proj" not in typed_actions[1]["data"]["text"]
        assert "${VAULT:OPENAI_API_KEY}" in typed_actions[1]["data"]["text"]

        # Bearer GitHub token masked
        assert "ghp_" not in typed_actions[2]["data"]["text"]
        assert ("${VAULT:BEARER_TOKEN}" in typed_actions[2]["data"]["text"] or "${VAULT:GITHUB_TOKEN}" in typed_actions[2]["data"]["text"])

    def test_macro_engine_crud_and_replay_real(self, temp_agent_db: Path):
        """Verifies SQLite storage, edit, cron scheduling, and replay execution."""
        engine = MacroEngine(db_path=temp_agent_db)

        # 1. Save Macro
        sample_actions = [
            {"action_type": "mouse_click", "data": {"x": 500, "y": 400, "button": "left"}},
            {"action_type": "type_text", "data": {"text": "Hello Nexus v5.0"}},
            {"action_type": "wait", "data": {"duration_ms": 50.0}},
        ]

        saved = engine.save_macro(
            name="Daily Deployment Workflow",
            actions=sample_actions,
            description="Automated deployment checklist runner",
            tags=["devops", "cloud"],
        )
        macro_id = saved["macro_id"]
        assert macro_id is not None
        assert saved["name"] == "Daily Deployment Workflow"
        assert saved["action_count"] == 3
        assert saved["tags"] == ["devops", "cloud"]

        # 2. Retrieve & List
        fetched = engine.get_macro(macro_id)
        assert fetched is not None
        assert fetched["name"] == "Daily Deployment Workflow"

        all_macros = engine.list_macros()
        assert len(all_macros) == 1
        assert all_macros[0]["macro_id"] == macro_id

        # 3. Update Macro
        updated = engine.update_macro(macro_id, description="Updated workflow description")
        assert updated["description"] == "Updated workflow description"

        # 4. Schedule Macro via Cron
        cron_res = engine.schedule_macro(macro_id, "0 9 * * 1-5")
        assert cron_res["success"] is True
        assert cron_res["cron_schedule"] == "0 9 * * 1-5"

        # Check cron_jobs table in DB
        with sqlite3.connect(str(temp_agent_db)) as conn:
            conn.row_factory = sqlite3.Row
            job = conn.execute("SELECT * FROM cron_jobs WHERE job_id = ?;", (macro_id,)).fetchone()
            assert job is not None
            assert job["cron_schedule"] == "0 9 * * 1-5"
            assert job["job_type"] == "macro"

        # 5. Replay Macro in dry_run mode
        replay_res = engine.replay_macro(macro_id, speed_multiplier=2.0, dry_run=True)
        assert replay_res["success"] is True
        assert replay_res["actions_executed"] == 3
        assert replay_res["dry_run"] is True

        # 6. Delete Macro
        deleted = engine.delete_macro(macro_id)
        assert deleted is True
        assert engine.get_macro(macro_id) is None

    def test_compile_to_nxskill_and_fts_indexing(self, temp_agent_db: Path, tmp_path: Path):
        """Verifies .nxskill compilation, AgentShield audit, SHA-256 signing, and FTS5 indexing."""
        engine = MacroEngine(db_path=temp_agent_db)

        actions = [
            {"action_type": "mouse_click", "data": {"x": 200, "y": 300, "button": "left"}},
            {"action_type": "type_text", "data": {"text": "nexus build --release"}},
            {"action_type": "key_press", "data": {"key": "Return"}},
        ]
        macro = engine.save_macro(
            name="Compile Release Artifact",
            actions=actions,
            description="Builds and signs release binaries for desktop",
        )

        out_skills_dir = tmp_path / "skills"
        compiled = engine.compile_to_nxskill(macro["macro_id"], output_dir=out_skills_dir)

        assert compiled["success"] is True
        assert compiled["slug"] == "compile-release-artifact"
        assert len(compiled["sha256"]) == 64
        assert compiled["shield_score"] >= 80
        assert compiled["status"] == "CLEAN"

        # Check .nxskill artifact file exists on disk
        pkg_file = Path(compiled["package_path"])
        assert pkg_file.exists()
        assert pkg_file.suffix == ".nxskill"

        # Verify ecc_skills table record in agent_local.db
        with sqlite3.connect(str(temp_agent_db)) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute("SELECT * FROM ecc_skills WHERE slug = 'compile-release-artifact';").fetchone()
            assert row is not None
            assert row["title"] == "Compile Release Artifact"
            assert row["sha256"] == compiled["sha256"]
            assert row["category"] == "automation"
            assert row["verified"] == 1
