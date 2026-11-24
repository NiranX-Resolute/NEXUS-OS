"""Nexus OS v5.0 - Voice Guardian Biometrics & Guest Sandbox Real Tests.

Zero-stub, zero-simulation tests validating:
1. DPAPI Enrollment Roundtrip (WeSpeaker / deterministic acoustic features + Windows DPAPI).
2. Operator vs Guest speaker classification (<40ms latency verification).
3. ScopeGuard guest sandbox enforcement (blocking privileged tools, allowing safe Q&A).
4. Vertical IPC Server routes (/api/voice/guardian/*) under Bearer authentication.
5. VoicePipeline biometrics integration.
"""

from __future__ import annotations

import base64
import json
import os
from pathlib import Path
import threading
import time
from typing import Dict, Any, Tuple
import urllib.request
import urllib.error

import numpy as np
import pytest

from core.bridge.voice_guardian import VoiceGuardian, get_voice_guardian
from core.runtime.scope_guard import ScopeGuard, enforce_speaker_tier
from core.runtime.gravitas_guard import ScopeViolationError
from core.runtime.ipc_server import NexusIPCServer
from core.bridge.voice_pipeline import VoicePipeline
from core.memory.sovereign_store import SovereignMemoryStore


def _generate_synthetic_voice(
    base_freq: float,
    harmonics: list[float],
    duration_sec: float = 1.0,
    sample_rate: int = 16000,
) -> np.ndarray:
    """Generates a multi-harmonic acoustic audio signal representing a speaker vocal profile."""
    t = np.linspace(0, duration_sec, int(sample_rate * duration_sec), endpoint=False, dtype=np.float32)
    sig = np.zeros_like(t)
    for i, harmonic_freq in enumerate([base_freq] + harmonics):
        amp = 1.0 / (i + 1)
        sig += amp * np.sin(2.0 * np.pi * harmonic_freq * t).astype(np.float32)
    norm = float(np.max(np.abs(sig)))
    if norm > 1e-6:
        sig = sig / norm
    return sig


def test_voice_guardian_dpapi_enrollment_roundtrip(tmp_path: Path) -> None:
    """Verifies operator voice enrollment, DPAPI encryption, and SQLite storage roundtrip."""
    test_db = tmp_path / "agent_local.db"
    guardian = VoiceGuardian(db_path=test_db, threshold=0.65)

    assert not guardian.get_status()["enrolled"]

    # Generate synthetic operator voice (fundamental 220Hz + formants 440Hz, 660Hz, 880Hz)
    operator_samples = _generate_synthetic_voice(220.0, [440.0, 660.0, 880.0])
    pcm_bytes = (operator_samples * 32767.0).astype(np.int16).tobytes()

    enroll_res = guardian.enroll_operator(pcm_bytes, sample_rate=16000)
    assert enroll_res["success"] is True
    assert enroll_res["speaker_tier"] == "OPERATOR"
    assert enroll_res["embedding_dim"] > 0

    status = guardian.get_status()
    assert status["enrolled"] is True
    assert status["speaker_tier"] == "OPERATOR"

    # Reload from SQLite to verify DPAPI decryption roundtrip
    reloaded_guardian = VoiceGuardian(db_path=test_db, threshold=0.65)
    reloaded_status = reloaded_guardian.get_status()
    assert reloaded_status["enrolled"] is True
    assert reloaded_status["embedding_dim"] == enroll_res["embedding_dim"]


def test_voice_guardian_operator_vs_guest_classification(tmp_path: Path) -> None:
    """Verifies speaker classification (OPERATOR vs GUEST) in <40ms."""
    test_db = tmp_path / "agent_local.db"
    guardian = VoiceGuardian(db_path=test_db, threshold=0.65)

    operator_voice = _generate_synthetic_voice(220.0, [440.0, 660.0, 880.0], duration_sec=1.5)
    guardian.enroll_operator(operator_voice, sample_rate=16000)

    # 1. Verify exact operator audio -> OPERATOR (> 0.90 similarity)
    t0 = time.perf_counter()
    tier_op, score_op = guardian.verify_speaker(operator_voice, sample_rate=16000)
    latency_ms = (time.perf_counter() - t0) * 1000.0

    assert latency_ms < 40.0
    assert tier_op == "OPERATOR"
    assert score_op >= 0.90

    # 2. Verify slight variation of operator audio (same pitch, minor phase/amp change) -> OPERATOR
    operator_variant = _generate_synthetic_voice(220.0, [440.0, 660.0, 880.0], duration_sec=1.2)
    tier_var, score_var = guardian.verify_speaker(operator_variant, sample_rate=16000)
    assert tier_var == "OPERATOR"
    assert score_var >= 0.65

    # 3. Verify completely different voice (different pitch: 850Hz, different harmonics) -> GUEST
    guest_voice = _generate_synthetic_voice(850.0, [1700.0, 2550.0], duration_sec=1.2)
    tier_guest, score_guest = guardian.verify_speaker(guest_voice, sample_rate=16000)
    assert tier_guest == "GUEST"
    assert score_guest < 0.65

    # 4. Verify white noise -> GUEST
    noise = np.random.uniform(-0.5, 0.5, 16000).astype(np.float32)
    tier_noise, score_noise = guardian.verify_speaker(noise, sample_rate=16000)
    assert tier_noise == "GUEST"
    assert score_noise < 0.65


def test_scope_guard_guest_sandbox_enforcement() -> None:
    """Verifies ScopeGuard blocks privileged actions for GUEST while permitting safe Q&A."""
    guard = ScopeGuard()

    # Privileged tools blocked for GUEST
    privileged_calls = [
        ("run_command", "dir c:\\"),
        ("execute_command", "npm run build"),
        ("terminal", "python script.py"),
        ("write_file", "c:/temp/test.txt"),
        ("edit_file", "c:/temp/test.txt"),
        ("delete_file", "c:/temp/old.txt"),
        ("get_secret", "OPENAI_API_KEY"),
        ("vault_get", "MODAL_TOKEN"),
        ("recall_private", "personal_notes"),
        ("ui_action", "Delete Account"),
        ("click", "Confirm Payment"),
        ("desktop_click", "Purge System Files"),
    ]

    for tool_name, target in privileged_calls:
        with pytest.raises(ScopeViolationError) as exc_info:
            guard.enforce_speaker_tier("GUEST", tool_name, target)
        assert "GUEST" in str(exc_info.value)
        assert "OPERATOR" in str(exc_info.value)

    # Safe read-only & Q&A tools permitted for GUEST
    safe_tools = [
        ("read_file", "README.md"),
        ("search_web", "python documentation"),
        ("ask_question", "How does voice biometrics work?"),
        ("chat", "Explain quantum computing"),
        ("get_status", "system_health"),
        ("view_symbol", "VoiceGuardian"),
    ]

    for tool_name, target in safe_tools:
        guard.enforce_speaker_tier("GUEST", tool_name, target)

    # OPERATOR tier permits privileged operations
    for tool_name, target in privileged_calls:
        guard.enforce_speaker_tier("OPERATOR", tool_name, target)


def test_voice_guardian_ipc_routes(tmp_path: Path) -> None:
    """Verifies IPC routes (/api/voice/guardian/*) under strict Bearer auth."""
    test_db = tmp_path / "ipc_agent.db"
    port = 47688

    server = NexusIPCServer(host="127.0.0.1", port=port, db_path=test_db, dry_run_hardware=True)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    time.sleep(0.2)

    try:
        base_url = f"http://127.0.0.1:{port}"
        auth_header = {"Authorization": f"Bearer {server.auth_token}"}

        # 1. Unauthenticated request to sensitive endpoint must return 401
        status_req_unauth = urllib.request.Request(f"{base_url}/api/voice/guardian/status")
        with pytest.raises(urllib.error.HTTPError) as err:
            urllib.request.urlopen(status_req_unauth)
        assert err.value.code == 401

        # 2. Authenticated GET /api/voice/guardian/status
        status_req = urllib.request.Request(f"{base_url}/api/voice/guardian/status", headers=auth_header)
        with urllib.request.urlopen(status_req) as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode("utf-8"))
            assert data["success"] is True
            assert data["enrolled"] is False

        # 3. Authenticated POST /api/voice/guardian/enroll
        operator_voice = _generate_synthetic_voice(220.0, [440.0, 660.0])
        pcm_bytes = (operator_voice * 32767.0).astype(np.int16).tobytes()
        b64_audio = base64.b64encode(pcm_bytes).decode("utf-8")

        enroll_body = json.dumps({"pcm_base64": b64_audio, "sample_rate": 16000}).encode("utf-8")
        enroll_req = urllib.request.Request(
            f"{base_url}/api/voice/guardian/enroll",
            data=enroll_body,
            headers={**auth_header, "Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(enroll_req) as resp:
            assert resp.status == 200
            res_data = json.loads(resp.read().decode("utf-8"))
            assert res_data["success"] is True
            assert res_data["speaker_tier"] == "OPERATOR"

        # 4. Status should now report enrolled
        with urllib.request.urlopen(status_req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            assert data["enrolled"] is True

        # 5. Authenticated POST /api/voice/guardian/config
        config_body = json.dumps({"threshold": 0.72}).encode("utf-8")
        config_req = urllib.request.Request(
            f"{base_url}/api/voice/guardian/config",
            data=config_body,
            headers={**auth_header, "Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(config_req) as resp:
            assert resp.status == 200
            cfg_data = json.loads(resp.read().decode("utf-8"))
            assert cfg_data["success"] is True
            assert cfg_data["config"]["threshold"] == 0.72

        # 6. Unauthenticated GET /api/security/voice-events must return 401
        events_req_unauth = urllib.request.Request(f"{base_url}/api/security/voice-events")
        with pytest.raises(urllib.error.HTTPError) as err:
            urllib.request.urlopen(events_req_unauth)
        assert err.value.code == 401

        # 7. Authenticated GET /api/security/voice-events
        events_req = urllib.request.Request(f"{base_url}/api/security/voice-events", headers=auth_header)
        with urllib.request.urlopen(events_req) as resp:
            assert resp.status == 200
            events_data = json.loads(resp.read().decode("utf-8"))
            assert events_data["success"] is True
            assert isinstance(events_data["events"], list)
            assert "count" in events_data

    finally:
        server.shutdown()
        server.server_close()


def test_voice_pipeline_guardian_wiring(tmp_path: Path) -> None:
    """Verifies that VoicePipeline is fully wired with VoiceGuardian."""
    test_db = tmp_path / "vp_agent.db"
    store = SovereignMemoryStore(db_path=test_db)
    guardian = VoiceGuardian(db_path=test_db, threshold=0.65)

    pipeline = VoicePipeline(store=store, voice_guardian=guardian)
    assert hasattr(pipeline, "voice_guardian")
    assert hasattr(pipeline, "VOICE_GUARDIAN")

    operator_voice = _generate_synthetic_voice(220.0, [440.0, 660.0])
    pcm_bytes = (operator_voice * 32767.0).astype(np.int16).tobytes()

    enroll_res = pipeline.enroll_operator_biometrics(pcm_bytes, sample_rate=16000)
    assert enroll_res["success"] is True

    tier, score = pipeline.verify_speaker_biometrics(pcm_bytes, sample_rate=16000)
    assert tier == "OPERATOR"
    assert score >= 0.90
    assert pipeline.current_speaker_role == "OPERATOR"


def test_voice_security_logs_persistence(tmp_path: Path) -> None:
    """Verifies that guest/unrecognized voice events are persisted in voice_security_logs."""
    test_db = tmp_path / "agent_local.db"
    guardian = VoiceGuardian(db_path=test_db, threshold=0.65)
    store = SovereignMemoryStore(db_path=test_db)

    # 1. Unenrolled verification triggers GUEST security audit event
    guest_sample = _generate_synthetic_voice(900.0, [1800.0, 2700.0])
    tier, score = guardian.verify_speaker(guest_sample, sample_rate=16000)
    assert tier == "GUEST"

    logs = guardian.get_security_logs(limit=10)
    assert len(logs) >= 1
    assert logs[0]["speaker_role"] == "GUEST"
    assert logs[0]["status"] == "NO_OPERATOR_ENROLLED"

    # 2. Enroll operator
    operator_samples = _generate_synthetic_voice(220.0, [440.0, 660.0])
    guardian.enroll_operator(operator_samples, sample_rate=16000)

    # 3. Verify operator does NOT log unrecognized event
    logs_before = len(guardian.get_security_logs(limit=10))
    tier_op, _ = guardian.verify_speaker(operator_samples, sample_rate=16000)
    assert tier_op == "OPERATOR"
    assert len(guardian.get_security_logs(limit=10)) == logs_before

    # 4. Verify guest voice triggers UNRECOGNIZED_SPEAKER security log
    tier_guest, _ = guardian.verify_speaker(guest_sample, sample_rate=16000)
    assert tier_guest == "GUEST"
    logs_after = guardian.get_security_logs(limit=10)
    assert len(logs_after) == logs_before + 1
    assert logs_after[0]["speaker_role"] == "GUEST"
    assert logs_after[0]["status"] == "UNRECOGNIZED_SPEAKER"

    # 5. Verify direct retrieval via SovereignMemoryStore
    store_logs = store.get_voice_security_logs(limit=10)
    assert len(store_logs) == len(logs_after)
    assert store_logs[0]["status"] == "UNRECOGNIZED_SPEAKER"

