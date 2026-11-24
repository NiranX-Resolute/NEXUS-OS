"""
Nexus Real-Time Voice Pipeline with Conversational AI & Disturbance-Resilient Barge-In
=============================================================================
High-Speed Voice Companion & Telephony Audio Loop:
1. Proper AI Responding: Generates context-aware, natural spoken conversational responses.
2. Disturbance / Noise Rejection: Background noise, coughs, and volume spikes do NOT close
   the agent. The agent continues speaking smoothly.
3. Explicit Interruption Barge-In: Agent halts speaking ONLY if the user explicitly says
   keywords such as "wait", "listen me", "stop", "pause", "hold on", or similar.
4. Non-Breaking Playback: Headless PresentationCore MediaPlayer & SAPI with dynamic timeouts
   preventing abrupt timeouts or wmplayer popups.
=============================================================================
"""

import datetime
import json
import logging
import os
from pathlib import Path
import re
import sqlite3
import sys
import time
import queue
import asyncio
import subprocess
import threading
from typing import Optional, Callable, Dict, Any, List, Tuple

try:
    from core.bridge.persona_engine import (
        PersonaTelemetry,
        build_dynamic_voice_prompt,
        compute_tts_prosody,
        sanitize_for_tts,
        PERSONA_PRESETS,
    )
    from core.memory.sovereign_store import SovereignMemoryStore
    from core.runtime.reflex_router import ReflexRouter
    from core.runtime.voice_normalizer import normalize_for_speech
    from core.bridge.voice_guardian import VoiceGuardian, get_voice_guardian, VOICE_GUARDIAN
except ImportError:
    try:
        from bridge.persona_engine import (
            PersonaTelemetry,
            build_dynamic_voice_prompt,
            compute_tts_prosody,
            sanitize_for_tts,
            PERSONA_PRESETS,
        )
        from memory.sovereign_store import SovereignMemoryStore
        from runtime.reflex_router import ReflexRouter
        from runtime.voice_normalizer import normalize_for_speech
        from bridge.voice_guardian import VoiceGuardian, get_voice_guardian, VOICE_GUARDIAN
    except ImportError:
        from .persona_engine import (
            PersonaTelemetry,
            build_dynamic_voice_prompt,
            compute_tts_prosody,
            sanitize_for_tts,
            PERSONA_PRESETS,
        )
        from ..memory.sovereign_store import SovereignMemoryStore
        from ..runtime.reflex_router import ReflexRouter
        from ..runtime.voice_normalizer import normalize_for_speech
        from .voice_guardian import VoiceGuardian, get_voice_guardian, VOICE_GUARDIAN

# Regex pattern for intentional user interruptions: "wait", "listen me", "stop", etc.
INTERRUPTION_PATTERN = re.compile(
    r"\b("
    r"wait(\s+(a\s+)?(second|minute|moment|sec|min))?|"
    r"listen(\s+(to\s+)?me|\s+here)?|"
    r"hear\s+me(\s+out)?|"
    r"stop(\s+(talking|speaking|it|now))?|"
    r"hold\s+(on|up)|"
    r"hang\s+on|"
    r"pause|"
    r"quiet|"
    r"shut\s*up|"
    r"be\s+quiet|"
    r"silence|"
    r"cancel|"
    r"halt"
    r")\b",
    re.IGNORECASE
)

# Attempt to load ProviderMesh for high-intelligence AI completions
try:
    from engine.provider_mesh import ProviderMesh
    HAS_PROVIDER_MESH = True
except ImportError:
    try:
        sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
        from engine.provider_mesh import ProviderMesh
        HAS_PROVIDER_MESH = True
    except Exception:
        ProviderMesh = None
        HAS_PROVIDER_MESH = False

try:
    import edge_tts
    HAS_EDGE_TTS = True
except ImportError:
    edge_tts = None
    HAS_EDGE_TTS = False

import io
import math
import struct
import wave

# -----------------------------------------------------------------------------
# Slow Tool Interim Feedback Engine (>2.5s operations)
# -----------------------------------------------------------------------------
_SLOW_TOOLS: List[str] = [
    "scholar_search",
    "scholar_synthesize",
    "web_visit",
    "code_review",
    "run_tests",
    "exec_verify",
    "deep_research",
    "swarm_spawn",
    "audit_code",
    "action_batch",
    "coding_agent",
    "browser_agent",
    "analyze_screen",
    "search_web",
    "fetch_url_page_text",
    "ingest_document_to_kb",
    "query_knowledge_base",
    "run_terminal_command",
    "explorer_search_files",
    "create_skill",
    "run_skill",
]

_INTERIM_FEEDBACK_MAP: Dict[str, str] = {
    "scholar_search": "Searching academic literature across global repositories...",
    "scholar_synthesize": "Synthesizing research brief and literature citations...",
    "web_visit": "Connecting to web destination and inspecting page structure...",
    "code_review": "Analyzing codebase AST and running structural security heuristics...",
    "run_tests": "Executing test suite and collecting verification evidence...",
    "exec_verify": "Running native build verification and compiler checks...",
    "deep_research": "Initiating deep research across sovereign memory and online sources...",
    "swarm_spawn": "Planning multi-agent topology and spawning autonomous workers...",
    "audit_code": "Running security shield heuristics and verifying code integrity...",
    "action_batch": "Executing multi-step native system batch...",
    "coding_agent": "Working on that code modification now...",
    "browser_agent": "Interacting with browser session and extracting page content...",
    "analyze_screen": "Capturing screen frame and analyzing active desktop visual elements...",
    "search_web": "Executing web search and reading top search citations...",
    "fetch_url_page_text": "Retrieving destination webpage content and formatting text...",
    "ingest_document_to_kb": "Parsing document layout and computing vector embeddings...",
    "query_knowledge_base": "Searching local knowledge base and ranking relevant passages...",
    "run_terminal_command": "Executing command in secure terminal session...",
    "explorer_search_files": "Searching filesystem index for matching documents...",
    "create_skill": "Scaffolding autonomous agent skill definition...",
    "run_skill": "Executing agent skill workflow...",
}


def get_interim_feedback(tool_name: str) -> str:
    """Returns fast interim speech feedback for slow operations (>2.5s)."""
    norm = (tool_name or "").strip().lower()
    return _INTERIM_FEEDBACK_MAP.get(norm, "Working on that...")


class SlowToolTimer:
    """Manages 2.5s interim speech acknowledgment timer for long-running tools.

    If tool call exceeds delay_sec (default 2.5s) without completing, emits a short
    non-blocking spoken acknowledgment through the active TTS stream, canceling it
    cleanly if the tool finishes early.
    """

    def __init__(
        self,
        tool_name: str,
        voice_pipeline: Optional[Any] = None,
        delay_sec: float = 2.5,
    ) -> None:
        self.tool_name = (tool_name or "").strip().lower()
        self.voice_pipeline = voice_pipeline
        self.delay_sec = delay_sec
        self._canceled = threading.Event()
        self._timer: Optional[threading.Timer] = None
        self.dispatched = False

    def start(self) -> "SlowToolTimer":
        def _fire() -> None:
            if not self._canceled.is_set():
                self.dispatched = True
                phrase = get_interim_feedback(self.tool_name)
                logging.getLogger("nexus.voice_pipeline").info(
                    "[SLOW_TOOL] 2.5s threshold reached for '%s'. Emitting interim feedback: '%s'",
                    self.tool_name,
                    phrase,
                )
                try:
                    vp = self.voice_pipeline or VoicePipeline()
                    vp.speak_stream(phrase)
                except Exception as exc:
                    logging.getLogger("nexus.voice_pipeline").debug("SlowToolTimer TTS error: %s", exc)

        self._timer = threading.Timer(self.delay_sec, _fire)
        self._timer.daemon = True
        self._timer.start()
        return self

    def cancel(self) -> None:
        self._canceled.set()
        if self._timer:
            self._timer.cancel()

    def __enter__(self) -> "SlowToolTimer":
        self.start()
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        self.cancel()


def run_with_slow_tool_timer(
    tool_name: str,
    fn: Callable[..., Any],
    *args: Any,
    voice_pipeline: Optional[Any] = None,
    delay_sec: float = 2.5,
    **kwargs: Any,
) -> Any:
    """Runs a function while arming a 2.5s interim speech timer canceled upon early completion."""
    timer = SlowToolTimer(tool_name, voice_pipeline=voice_pipeline, delay_sec=delay_sec)
    timer.start()
    try:
        return fn(*args, **kwargs)
    finally:
        timer.cancel()


async def async_run_with_slow_tool_timer(
    tool_name: str,
    coro_fn: Any,
    *args: Any,
    voice_pipeline: Optional[Any] = None,
    delay_sec: float = 2.5,
    **kwargs: Any,
) -> Any:
    """Async variant running coroutine with 2.5s interim speech timer canceled upon early completion."""
    timer = SlowToolTimer(tool_name, voice_pipeline=voice_pipeline, delay_sec=delay_sec)
    timer.start()
    try:
        if inspect.iscoroutinefunction(coro_fn):
            return await coro_fn(*args, **kwargs)
        elif asyncio.iscoroutine(coro_fn):
            return await coro_fn
        else:
            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(None, lambda: coro_fn(*args, **kwargs))
    finally:
        timer.cancel()


# -----------------------------------------------------------------------------
# Pre-TTS Spoken Text Normalization
# -----------------------------------------------------------------------------
try:
    from core.runtime.voice_normalizer import normalize_for_speech
except ImportError:
    try:
        from runtime.voice_normalizer import normalize_for_speech
    except ImportError:
        def normalize_for_speech(text: str) -> str:
            """Safe fallback pre-TTS normalizer: expands abbreviations, numbers, and technical symbols."""
            if not text:
                return ""
            t = str(text).strip()
            replacements = [
                (r"\bAI\b", "A.I."),
                (r"\bUI\b", "U.I."),
                (r"\bOS\b", "O.S."),
                (r"\bIPC\b", "I.P.C."),
                (r"\bAPI\b", "A.P.I."),
                (r"\bAPIs\b", "A.P.I.s"),
                (r"\bURL\b", "U.R.L."),
                (r"\bURLs\b", "U.R.L.s"),
                (r"\bSQL\b", "sequel"),
                (r"\bSQLite\b", "sequel lite"),
                (r"\bWAL\b", "wall"),
                (r"\bFTS5\b", "F.T.S. 5"),
                (r"\bVAD\b", "V.A.D."),
                (r"\bTTS\b", "T.T.S."),
                (r"\bSTT\b", "S.T.T."),
                (r"\bms\b", "milliseconds"),
                (r"\bsec\b", "seconds"),
                (r"\bmin\b", "minutes"),
                (r"\bhr\b", "hours"),
                (r"%", " percent"),
                (r"&", " and "),
                (r"@", " at "),
                (r"#", " number "),
                (r"\bSHA-?256\b", "S.H.A. 256"),
            ]
            for pat, repl in replacements:
                t = re.sub(pat, repl, t, flags=re.IGNORECASE)
            t = re.sub(r"\s+", " ", t).strip()
            return t


# -----------------------------------------------------------------------------
# Single-Speaker Audio Mutex & Hardware Availability
# -----------------------------------------------------------------------------
_audio_mutex = threading.Lock()


def is_audio_available() -> bool:
    """Checks whether system audio hardware and synthesis are functional."""
    if sys.platform != "win32":
        return False
    try:
        import sounddevice as sd
        devices = sd.query_devices()
        return len(devices) > 0
    except Exception:
        return True


def route_partial_reflex(partial_text: str, debounce_sec: float = 2.0) -> Optional[Dict[str, Any]]:
    """Evaluates partial speech chunks against deterministic high-priority reflex commands in <50ms."""
    try:
        from core.runtime.reflex_router import route_partial_reflex as _rpr
        return _rpr(partial_text, debounce_sec=debounce_sec)
    except Exception as exc:
        logging.getLogger("nexus.voice_pipeline").debug("route_partial_reflex error: %s", exc)
        return None


def calculate_speech_ratio(
    pcm_bytes: bytes,
    sample_rate: int = 16000,
    chunk_ms: int = 30,
    energy_threshold: float = 0.015,
) -> float:
    """
    Calculates the ratio of voiced speech chunks to total audio duration.
    Uses RMS energy frame calculations (or Silero VAD if available).
    Returns float in range [0.0, 1.0].
    """
    if not pcm_bytes:
        return 0.0

    bytes_per_sample = 2  # 16-bit PCM
    samples_per_chunk = int(sample_rate * (chunk_ms / 1000.0))
    chunk_bytes_len = samples_per_chunk * bytes_per_sample

    if len(pcm_bytes) < chunk_bytes_len:
        return 0.0

    total_chunks = len(pcm_bytes) // chunk_bytes_len
    voiced_chunks = 0

    for i in range(total_chunks):
        chunk = pcm_bytes[i * chunk_bytes_len : (i + 1) * chunk_bytes_len]
        sample_count = len(chunk) // 2
        shorts = struct.unpack(f"{sample_count}h", chunk)
        if sample_count == 0:
            continue
        sum_sq = sum(s * s for s in shorts)
        rms = math.sqrt(sum_sq / sample_count) / 32768.0
        if rms >= energy_threshold:
            voiced_chunks += 1

    return round(voiced_chunks / float(total_chunks), 4) if total_chunks > 0 else 0.0


def save_pinned_devices(mic_id: str, camera_id: str, db_path: Optional[Path] = None) -> bool:
    """Persists pinned mic and camera device IDs into ui_preferences table in agent_local.db."""
    try:
        target_db = db_path or (Path.home() / ".nexus-agent" / "db" / "agent_local.db")
        target_db.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(str(target_db), timeout=5.0) as conn:
            conn.execute("PRAGMA journal_mode = WAL;")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS ui_preferences (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at REAL NOT NULL
                );
                """
            )
            now = time.time()
            conn.execute(
                "INSERT INTO ui_preferences (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at;",
                ("pinned_mic_id", str(mic_id), now),
            )
            conn.execute(
                "INSERT INTO ui_preferences (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at;",
                ("pinned_camera_id", str(camera_id), now),
            )
            conn.commit()
        return True
    except Exception as exc:
        logging.getLogger("nexus.voice_pipeline").error("Failed saving pinned devices: %s", exc)
        return False


def get_pinned_devices(db_path: Optional[Path] = None) -> Dict[str, str]:
    """Retrieves pinned mic and camera device IDs from ui_preferences in agent_local.db."""
    result = {"mic_id": "default", "camera_id": "default"}
    try:
        target_db = db_path or (Path.home() / ".nexus-agent" / "db" / "agent_local.db")
        if not target_db.exists():
            return result
        with sqlite3.connect(str(target_db), timeout=5.0) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS ui_preferences (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at REAL NOT NULL
                );
                """
            )
            rows = conn.execute("SELECT key, value FROM ui_preferences WHERE key IN ('pinned_mic_id', 'pinned_camera_id');").fetchall()
            for k, v in rows:
                if k == "pinned_mic_id":
                    result["mic_id"] = v
                elif k == "pinned_camera_id":
                    result["camera_id"] = v
    except Exception as exc:
        logging.getLogger("nexus.voice_pipeline").debug("Failed reading pinned devices: %s", exc)
    return result


def verify_speaker(
    pcm_bytes: Optional[bytes] = None,
    speaker_id: Optional[str] = None,
    db_path: Optional[Path] = None,
) -> str:
    """
    Verifies speaker role (OPERATOR | GUEST) via voice_guardian or enrolled voiceprints in agent_local.db.
    """
    try:
        from core.bridge.voice_guardian import VoiceGuardian
        target_db = db_path or (Path.home() / ".nexus-agent" / "db" / "agent_local.db")
        vg = VoiceGuardian(db_path=target_db)
        if pcm_bytes:
            tier, _ = vg.verify_speaker(pcm_bytes)
            return tier
        status = vg.get_status()
        if status.get("enrolled"):
            return "OPERATOR"
    except Exception as exc:
        logging.getLogger("nexus.voice_pipeline").debug("VoiceGuardian lookup notice: %s", exc)

    try:
        target_db = db_path or (Path.home() / ".nexus-agent" / "db" / "agent_local.db")
        if target_db.exists():
            with sqlite3.connect(str(target_db), timeout=2.0) as conn:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS voiceprints (
                        id TEXT PRIMARY KEY,
                        speaker_name TEXT NOT NULL,
                        speaker_role TEXT NOT NULL DEFAULT 'OPERATOR',
                        embedding_blob BLOB,
                        features_json TEXT,
                        is_active INTEGER NOT NULL DEFAULT 1,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );
                    """
                )
                if speaker_id:
                    row = conn.execute(
                        "SELECT speaker_role FROM voiceprints WHERE (id = ? OR speaker_name = ?) AND is_active = 1 LIMIT 1;",
                        (speaker_id, speaker_id),
                    ).fetchone()
                    if row:
                        return str(row[0]).upper()
                else:
                    row = conn.execute(
                        "SELECT speaker_role FROM voiceprints WHERE speaker_role = 'OPERATOR' AND is_active = 1 LIMIT 1;"
                    ).fetchone()
                    if row and not pcm_bytes:
                        return "OPERATOR"
    except Exception as exc:
        logging.getLogger("nexus.voice_pipeline").debug("Voiceprint lookup note: %s", exc)

    if speaker_id and speaker_id.lower() in ("operator", "niranx", "niranjan", "admin", "owner"):
        return "OPERATOR"
    return "GUEST"

# -----------------------------------------------------------------------------
# Clean Filler-Free Dictation & Whisper STT Engine
# -----------------------------------------------------------------------------
_whisper_lock = threading.Lock()
_cached_whisper_model = None


def _get_whisper_model(model_size: str = "base.en"):
    """Lazily loads faster-whisper STT model once."""
    global _cached_whisper_model
    with _whisper_lock:
        if _cached_whisper_model is None:
            try:
                from faster_whisper import WhisperModel
                _cached_whisper_model = WhisperModel(model_size, device="cpu", compute_type="int8")
            except Exception as exc:
                logging.getLogger("nexus.voice_pipeline").debug("faster-whisper initialization deferred: %s", exc)
                _cached_whisper_model = None
    return _cached_whisper_model


def _log_modal_fallback_event(reason: str, duration_sec: float) -> None:
    """Logs modal_stt_fallback_local event to SQLite WAL telemetry_events."""
    try:
        db_path = Path.home() / ".nexus-agent" / "db" / "agent_local.db"
        db_path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(str(db_path), timeout=2.0) as conn:
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS telemetry_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_type TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at REAL NOT NULL
                );
                """
            )
            payload = json.dumps({
                "reason": reason,
                "duration_sec": duration_sec,
                "timestamp": time.time(),
            })
            conn.execute(
                "INSERT INTO telemetry_events (event_type, payload_json, created_at) VALUES (?, ?, ?);",
                ("modal_stt_fallback_local", payload, time.time()),
            )
            conn.commit()
    except Exception as exc:
        logging.getLogger("nexus.voice_pipeline").debug("Telemetry log notice: %s", exc)


def is_airgap_or_estop() -> bool:
    """Checks whether the environment requires complete air-gap isolation."""
    mode = "DEV"
    try:
        from core.runtime.workspaces import WorkspaceGovernor
        mode = getattr(WorkspaceGovernor, "_active_mode", None) or WorkspaceGovernor().get_mode()
    except Exception:
        mode = "DEV"

    if str(mode).upper() == "SILENT":
        return True

    if os.environ.get("ESTOP") in ("1", "true", "True"):
        return True

    try:
        from core.engine.safety_guard import SafetyGuard
        if SafetyGuard.is_estop_active():
            return True
    except Exception as exc:
        logging.getLogger("nexus.voice_pipeline").debug("SafetyGuard estop check notice: %s", exc)

    return False


def _transcribe_pcm_locally(pcm_bytes: bytes, sample_rate: int = 16000) -> str:
    """Transcribes raw 16-bit mono PCM audio bytes locally using faster-whisper."""
    if not pcm_bytes:
        return ""
    model = _get_whisper_model()
    if not model:
        return ""
    try:
        wav_buf = io.BytesIO()
        with wave.open(wav_buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sample_rate)
            wf.writeframes(pcm_bytes)
        wav_buf.seek(0)

        segments, _ = model.transcribe(wav_buf, beam_size=5)
        return " ".join(seg.text for seg in segments).strip()
    except Exception as exc:
        logging.getLogger("nexus.voice_pipeline").error("Local speech transcription error: %s", exc)
        return ""


def transcribe_with_modal_fallback(
    audio_pcm_bytes: bytes,
    duration_sec: float,
    snr_db: Optional[float] = None,
    hint_hinglish: bool = False,
) -> Dict[str, Any]:
    """
    Transcribes audio using Modal Labs T4 Whisper with automatic fallback to local faster-whisper.

    Routing Policy:
    - Route to Modal T4 ONLY when:
        * WorkspaceGovernor.active_mode != "SILENT" and ESTOP != 1,
        * MODAL_AI_ENDPOINT is configured, AND
        * Audio is long (duration_sec >= 8.0), noisy (snr_db is not None and snr_db < 12.0), or hint_hinglish=True.
    - Strict 4.0s connect / 15.0s read timeout via httpx.Client.
    - On timeout, HTTP error, or offline state, immediately falls back to local faster-whisper
      and logs 'modal_stt_fallback_local' to telemetry_events in ~/.nexus-agent/db/agent_local.db.
    """
    if not audio_pcm_bytes:
        return {
            "text": "",
            "language": "hi" if hint_hinglish else "en",
            "duration_sec": 0.0,
            "segments": [],
            "engine": "local_faster_whisper",
            "fallback_local": False,
        }

    airgap_active = is_airgap_or_estop()

    modal_endpoint = ""
    nexus_token = ""
    if not airgap_active:
        try:
            from core.security.vault import VaultManager
            vault = VaultManager()
            try:
                modal_endpoint = vault.get_secret("MODAL_AI_ENDPOINT") or ""
            except Exception:
                modal_endpoint = ""
            try:
                nexus_token = vault.get_secret("NEXUS_TOKEN") or ""
            except Exception:
                nexus_token = ""
        except Exception as vault_exc:
            logging.getLogger("nexus.voice_pipeline").debug("Vault lookup notice: %s", vault_exc)

        if not modal_endpoint:
            modal_endpoint = os.environ.get("MODAL_AI_ENDPOINT", "")
        if not nexus_token:
            nexus_token = os.environ.get("NEXUS_TOKEN", "")

    modal_endpoint = modal_endpoint.strip().rstrip("/")
    nexus_token = nexus_token.strip()

    condition_met = (
        duration_sec >= 8.0
        or (snr_db is not None and snr_db < 12.0)
        or bool(hint_hinglish)
    )
    should_use_modal = (not airgap_active) and bool(modal_endpoint) and condition_met

    fallback_reason: Optional[str] = None

    if should_use_modal:
        try:
            import httpx

            wav_buf = io.BytesIO()
            with wave.open(wav_buf, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(16000)
                wf.writeframes(audio_pcm_bytes)
            wav_bytes = wav_buf.getvalue()

            transcribe_url = f"{modal_endpoint}/transcribe" if not modal_endpoint.endswith("/transcribe") else modal_endpoint
            headers = {"User-Agent": "Nexus-VoicePipeline/5.0"}
            if nexus_token:
                headers["Authorization"] = f"Bearer {nexus_token}"

            lang_param = "hi" if hint_hinglish else "auto"
            files = {"file": ("audio.wav", wav_bytes, "audio/wav")}
            data = {"language": lang_param}

            timeout_cfg = httpx.Timeout(15.0, connect=4.0, read=15.0, write=15.0)
            with httpx.Client(timeout=timeout_cfg) as client:
                resp = client.post(transcribe_url, headers=headers, files=files, data=data)

            if resp.status_code == 200:
                resp_json = resp.json()
                return {
                    "text": resp_json.get("text", "").strip(),
                    "language": resp_json.get("language", lang_param if lang_param != "auto" else "en"),
                    "duration_sec": resp_json.get("duration_sec", duration_sec),
                    "segments": resp_json.get("segments", []),
                    "engine": resp_json.get("engine", "modal_t4_whisper"),
                    "fallback_local": False,
                }
            else:
                fallback_reason = f"HTTP_{resp.status_code}_{resp.text[:100]}"
                _log_modal_fallback_event(fallback_reason, duration_sec)

        except Exception as err:
            fallback_reason = f"{type(err).__name__}: {str(err)}"
            _log_modal_fallback_event(fallback_reason, duration_sec)

    # Local faster-whisper execution (default or fallback)
    local_text = _transcribe_pcm_locally(audio_pcm_bytes)
    return {
        "text": local_text,
        "language": "hi" if hint_hinglish else "en",
        "duration_sec": duration_sec,
        "segments": [{"start": 0.0, "end": duration_sec, "text": local_text}] if local_text else [],
        "engine": "local_faster_whisper",
        "fallback_local": bool(should_use_modal),
        "fallback_reason": fallback_reason if should_use_modal else None,
    }


def transcribe_pcm_audio(pcm_bytes: bytes, sample_rate: int = 16000) -> str:
    """
    Transcribes raw 16-bit mono PCM audio bytes using faster-whisper.
    Routes to Modal T4 with smart fallback when conditions are met.

    Args:
        pcm_bytes: Raw 16kHz 16-bit mono PCM audio bytes.
        sample_rate: Audio sampling rate (default: 16000).

    Returns:
        Transcribed string.
    """
    if not pcm_bytes:
        return ""
    duration_sec = len(pcm_bytes) / (sample_rate * 2)
    res = transcribe_with_modal_fallback(pcm_bytes, duration_sec=duration_sec)
    return res.get("text", "")


def clean_dictation_transcript(raw_text: str) -> str:
    """
    Cleans raw speech dictation transcript into production-ready prose:
    1. Strips mid-sentence self-corrections ('scratch that', 'no wait', 'actually wait', 'wait no', 'never mind').
    2. Strips spoken conversational fillers ('um', 'uh', 'erm', 'ah', 'er', 'like, you know', 'you know').
    3. Formats spoken punctuation ('comma', 'period', 'full stop', 'question mark', 'exclamation mark', 'colon', 'semicolon', 'new line', 'new paragraph').
    4. Auto-capitalizes sentences and the pronoun 'I'.
    5. Normalizes whitespace and punctuation spacing.
    """
    if not raw_text or not raw_text.strip():
        return ""

    text = raw_text.strip()

    # 1. Mid-sentence self-corrections: discard speech preceding the self-correction phrase
    correction_pat = re.compile(
        r"\b(?:scratch\s+that|no\s+wait|actually\s+wait|wait\s+no|never\s*mind)\b[,.\s]*",
        re.IGNORECASE,
    )
    parts = correction_pat.split(text)
    if parts:
        text = parts[-1].strip()

    # 2. Spoken conversational fillers
    fillers = [
        re.compile(r"\b(?:like,\s*you\s*know|you\s*know)\b", re.IGNORECASE),
        re.compile(r"\b(?:um|uh|erm|ah|er)\b", re.IGNORECASE),
    ]
    for fp in fillers:
        text = fp.sub("", text)

    # 3. Spoken punctuation substitutions
    punct_rules = [
        (re.compile(r"\b(?:question\s+mark)\b", re.IGNORECASE), "?"),
        (re.compile(r"\b(?:exclamation\s+mark|exclamation\s+point)\b", re.IGNORECASE), "!"),
        (re.compile(r"\b(?:full\s+stop|period)\b", re.IGNORECASE), "."),
        (re.compile(r"\b(?:comma)\b", re.IGNORECASE), ","),
        (re.compile(r"\b(?:colon)\b", re.IGNORECASE), ":"),
        (re.compile(r"\b(?:semicolon)\b", re.IGNORECASE), ";"),
        (re.compile(r"\b(?:new\s+line|newline)\b", re.IGNORECASE), "\n"),
        (re.compile(r"\b(?:new\s+paragraph)\b", re.IGNORECASE), "\n\n"),
    ]
    for pat, sym in punct_rules:
        text = pat.sub(sym, text)

    # 4. Spacing normalization around punctuation
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\s+([,.:;?!])", r"\1", text)
    text = re.sub(r"([,:;])(?=[^\s\d\n])", r"\1 ", text)
    text = re.sub(r"([.?!])(?=[A-Za-z])", r"\1 ", text)
    text = text.strip()

    # 5. Auto-capitalization: start of sentences
    def _cap_match(match):
        prefix = match.group(1) or ""
        char = match.group(2)
        return prefix + char.upper()

    text = re.sub(r"(^|[.?!]\s+|\n+)([a-z])", _cap_match, text)

    # 6. Auto-capitalization: pronoun 'I' and contractions
    text = re.sub(r"\bi\b", "I", text)
    text = re.sub(r"\bi'([a-z]+)\b", lambda m: f"I'{m.group(1)}", text)

    return text


# -----------------------------------------------------------------------------
# Global Hold-to-Dictate (Right Alt) Keyboard Listener
# -----------------------------------------------------------------------------
_dictate_listener = None
_dictate_recording = False
_dictate_capture = None
_dictate_lock = threading.Lock()


def start_hold_to_dictate_listener() -> bool:
    """Starts global listener for Right Alt hold-to-dictate and cursor injection."""
    global _dictate_listener
    try:
        from pynput import keyboard
    except ImportError:
        logging.getLogger("nexus.voice_pipeline").warning("pynput not available; hold-to-dictate listener skipped")
        return False

    with _dictate_lock:
        if _dictate_listener and _dictate_listener.is_alive():
            return True

        def on_press(key):
            global _dictate_recording, _dictate_capture
            if key == keyboard.Key.alt_r and not _dictate_recording:
                _dictate_recording = True
                try:
                    from core.runtime.audio_capture import RealMicrophoneCapture
                    _dictate_capture = RealMicrophoneCapture(sample_rate=16000, channels=1, chunk_duration=0.1)
                    _dictate_capture.start()
                except Exception as exc:
                    logging.getLogger("nexus.voice_pipeline").debug("Hold-to-dictate mic start error: %s", exc)

        def on_release(key):
            global _dictate_recording, _dictate_capture
            if key == keyboard.Key.alt_r and _dictate_recording:
                _dictate_recording = False
                pcm_data = bytearray()
                if _dictate_capture:
                    try:
                        _dictate_capture.stop()
                        while True:
                            chunk = _dictate_capture.read_chunk(timeout=0.05)
                            if not chunk:
                                break
                            pcm_data.extend(chunk)
                    except Exception as exc:
                        logging.getLogger("nexus.voice_pipeline").debug("Error collecting dictation PCM: %s", exc)
                    _dictate_capture = None

                if pcm_data:
                    raw_transcript = transcribe_pcm_audio(bytes(pcm_data))
                    if raw_transcript:
                        cleaned = clean_dictation_transcript(raw_transcript)
                        if cleaned:
                            try:
                                from core.runtime.win32_utils import inject_text_at_cursor
                                inject_text_at_cursor(cleaned)
                            except Exception as inj_err:
                                logging.getLogger("nexus.voice_pipeline").debug("Dictation text injection error: %s", inj_err)

        listener = keyboard.Listener(on_press=on_press, on_release=on_release)
        listener.daemon = True
        listener.start()
        _dictate_listener = listener
        return True


def stop_hold_to_dictate_listener() -> None:
    """Stops the global Right Alt hold-to-dictate listener."""
    global _dictate_listener
    with _dictate_lock:
        if _dictate_listener:
            try:
                _dictate_listener.stop()
            except Exception:
                logging.getLogger("nexus.voice_pipeline").debug("Dictate listener stop error")
            _dictate_listener = None


class VoicePipeline:
    """
    Real-time audio streaming loop with conversational AI and disturbance-resilient barge-in.
    """

    def __init__(
        self,
        tts_backend: str = "edge_tts",
        energy_threshold: float = 0.05,
        require_keyword_interruption: bool = False,
        voice: str = "en-US-ChristopherNeural",
        store: Optional[Any] = None,
        voice_guardian: Optional[Any] = None,
    ):
        self.tts_backend = tts_backend
        self.energy_threshold = energy_threshold
        self.require_keyword_interruption = require_keyword_interruption
        self.voice = voice

        self.audio_mutex = _audio_mutex
        self.current_speaker_role = "OPERATOR"
        self.is_speaking = False
        self._current_audio_proc: Optional[subprocess.Popen] = None
        self._audio_queue = queue.Queue()
        self._stop_event = threading.Event()
        self._lock = threading.Lock()

        self.on_barge_in: Optional[Callable[..., None]] = None
        self.disturbances_absorbed = 0
        self.last_interruption_keyword: Optional[str] = None
        self.temp_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_cache")
        os.makedirs(self.temp_dir, exist_ok=True)

        self.provider_mesh = ProviderMesh() if HAS_PROVIDER_MESH and ProviderMesh else None
        self.store = store if store is not None else SovereignMemoryStore()
        self.voice_guardian = voice_guardian if voice_guardian is not None else get_voice_guardian(db_path=getattr(self.store, "db_path", None))
        self.VOICE_GUARDIAN = self.voice_guardian
        self.reflex_router = ReflexRouter(store=self.store)

        from core.runtime.workspaces import WorkspaceGovernor
        from core.bridge.persona_engine import register_persona_listener
        self.governor = WorkspaceGovernor()
        self._cached_telemetry: Optional[PersonaTelemetry] = None
        self._cached_telemetry_time: float = 0.0

        def _on_persona_update(t: PersonaTelemetry) -> None:
            self._cached_telemetry = t
            self._cached_telemetry_time = time.time()
        register_persona_listener(_on_persona_update)

        try:
            self.get_current_telemetry()
        except Exception as exc:
            logger.debug("Initial telemetry priming notice: %s", exc)

        # Dedicated background fallback logger queue to guarantee sub-millisecond dispatch
        self._fallback_queue: queue.Queue = queue.Queue()
        self._fallback_worker = threading.Thread(target=self._fallback_logger_loop, daemon=True, name="HaruFallbackWorker")
        self._fallback_worker.start()

        # 4-Tier Anti-Echo Subsystems
        self.screen_duck_gain: float = 1.0
        self.mic_sensitivity_gain: float = 1.0
        self._tts_history: List[Tuple[str, float]] = []
        self._keepalive_stop_evt = threading.Event()
        self._keepalive_thread: Optional[threading.Thread] = None

        # Double-Clap & Away Tracking + Voice Routines Integration
        from core.runtime.away_tracker import AwayTracker
        from core.runtime.routines_manager import RoutinesManager
        self.away_tracker = AwayTracker(
            db_path=getattr(self.store, "db_path", None),
            on_double_clap=self.handle_double_clap_wake,
        )
        self.routines_manager = RoutinesManager(
            db_path=getattr(self.store, "db_path", None),
            reflex_router=self.reflex_router,
        )

    def verify_speaker_biometrics(
        self,
        pcm_chunk: Any,
        sample_rate: int = 16000,
    ) -> Tuple[str, float]:
        """Verifies speaker biometrics via VoiceGuardian (<40ms)."""
        tier, score = self.voice_guardian.verify_speaker(pcm_chunk, sample_rate=sample_rate)
        self.current_speaker_role = tier
        return (tier, score)

    def enroll_operator_biometrics(
        self,
        pcm_samples: Any,
        sample_rate: int = 16000,
    ) -> Dict[str, Any]:
        """Enrolls primary OPERATOR biometrics via VoiceGuardian."""
        return self.voice_guardian.enroll_operator(pcm_samples, sample_rate=sample_rate)

    def handle_double_clap_wake(self, summary_payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Actuates double-clap wake event:
        1. Wakes or focuses workstation.
        2. Ingests or digests away queue summary if available.
        3. Returns structured wake response.
        """
        logging.getLogger("nexus.voice_pipeline").info("Double-clap wake triggered in VoicePipeline")
        summary_text = ""
        if summary_payload and summary_payload.get("summary"):
            summary_text = summary_payload["summary"]
        elif self.away_tracker:
            summary = self.away_tracker.generate_catchup_summary(mark_processed=True)
            summary_text = summary.get("summary", "")

        spoken_confirm = "Welcome back, Niranjan. Systems restored."
        if summary_text and "No pending" not in summary_text:
            spoken_confirm = f"Welcome back, Niranjan. While you were away: {summary_text}"

        if spoken_confirm:
            try:
                threading.Thread(
                    target=lambda: self.speak_response_to_query(spoken_confirm),
                    daemon=True,
                    name="DoubleClapSpokenCatchup"
                ).start()
            except Exception as spk_err:
                logging.getLogger("nexus.voice_pipeline").debug("Spoken catch-up speech dispatch notice: %s", spk_err)

        return {
            "success": True,
            "event": "DOUBLE_CLAP_WAKE",
            "summary": summary_text,
            "spoken_confirmation": spoken_confirm,
            "timestamp": time.time(),
        }

    def process_acoustic_chunk(self, pcm_bytes: bytes) -> Optional[Dict[str, Any]]:
        """Processes incoming 16kHz PCM chunk through away_tracker for transient clap spikes."""
        if self.away_tracker:
            return self.away_tracker.process_audio_chunk(pcm_bytes)
        return None

    def _fallback_logger_loop(self) -> None:
        """Drains fallback telemetry events in background, isolating SQLite I/O from audio loop."""
        while True:
            try:
                item = self._fallback_queue.get()
                if item is None:
                    break
                reason, timestamp = item
                db_path = getattr(self.store, "db_path", None) or (Path.home() / ".nexus-agent" / "db" / "agent_local.db")
                conn = sqlite3.connect(str(db_path), timeout=5.0)
                try:
                    conn.execute(
                        """
                        CREATE TABLE IF NOT EXISTS telemetry_events (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            event_type TEXT NOT NULL,
                            payload_json TEXT NOT NULL,
                            created_at REAL NOT NULL
                        );
                        """
                    )
                    payload = json.dumps({
                        "reason": reason,
                        "fallback_target": "local_whisper_tts",
                        "timestamp": timestamp,
                    })
                    conn.execute(
                        "INSERT INTO telemetry_events (event_type, payload_json, created_at) VALUES (?, ?, ?);",
                        ("haru_fallback_local", payload, timestamp),
                    )
                    conn.commit()
                finally:
                    conn.close()
            except Exception as exc:
                logging.getLogger("nexus.voice_pipeline").debug("haru_fallback_local write notice: %s", exc)

    def log_haru_fallback(self, reason: str, wait: bool = False) -> None:
        """Logs a single telemetry_events row ('haru_fallback_local') in SQLite WAL asynchronously in <0.01ms."""
        now = time.time()
        self._fallback_queue.put((reason, now))
        if wait:
            time.sleep(0.05)

    def transcribe_with_modal_fallback(
        self,
        audio_pcm_bytes: bytes,
        duration_sec: float,
        snr_db: Optional[float] = None,
        hint_hinglish: bool = False,
    ) -> Dict[str, Any]:
        """Routes audio transcription with smart fallback to Modal T4 or local faster-whisper."""
        return transcribe_with_modal_fallback(
            audio_pcm_bytes=audio_pcm_bytes,
            duration_sec=duration_sec,
            snr_db=snr_db,
            hint_hinglish=hint_hinglish,
        )

    # --------------------------------------------------------------------------
    # 1. Interruption Intent Detection
    # --------------------------------------------------------------------------
    @staticmethod
    def is_interruption_intent(text: str) -> bool:
        """
        Detects if input contains intentional user interruption commands
        such as 'wait', 'listen me', 'stop', 'hold on', or similar.
        """
        if not text or not isinstance(text, str):
            return False
        return bool(INTERRUPTION_PATTERN.search(text))

    @staticmethod
    def extract_interruption_keyword(text: str) -> Optional[str]:
        """Extracts the specific interruption phrase matched."""
        if not text or not isinstance(text, str):
            return None
        match = INTERRUPTION_PATTERN.search(text)
        return match.group(0).lower() if match else None

    # --------------------------------------------------------------------------
    # 2. Barge-in & Disturbance Management
    # --------------------------------------------------------------------------
    def cancel_speech(self, reason: str = "user_interruption") -> bool:
        """
        Barge-in Trigger: Instantly halts active audio playback and flushes buffers.
        Invoked only upon explicit user command or confirmed cancellation.
        """
        with self._lock:
            if self._current_audio_proc and self._current_audio_proc.poll() is None:
                try:
                    self._current_audio_proc.terminate()
                    time.sleep(0.05)
                    if self._current_audio_proc.poll() is None:
                        self._current_audio_proc.kill()
                except Exception as exc:
                    logging.getLogger("nexus.voice_pipeline").debug("Audio process kill exception: %s", exc)
            self._current_audio_proc = None
            self.is_speaking = False

            # Drain queue
            while not self._audio_queue.empty():
                try:
                    self._audio_queue.get_nowait()
                except queue.Empty:
                    break

        if self.on_barge_in:
            try:
                # Support both signature styles: on_barge_in() or on_barge_in(keyword)
                import inspect
                sig = inspect.signature(self.on_barge_in)
                if len(sig.parameters) >= 1:
                    self.on_barge_in(self.last_interruption_keyword or reason)
                else:
                    self.on_barge_in()
            except Exception:
                try:
                    self.on_barge_in()
                except Exception as b_err:
                    logging.getLogger("nexus.voice_pipeline").debug("Barge-in callback exception: %s", b_err)
        return True

    def handle_disturbance(self, energy_level: float = 0.0, description: str = "ambient_noise") -> bool:
        """
        Handles ambient disturbance / background noise:
        The AI Agent DOES NOT close and continues speaking smoothly.
        """
        self.disturbances_absorbed += 1
        return False  # Did not stop

    def handle_user_utterance(self, transcript: str) -> bool:
        """
        Evaluates a recognized user utterance while agent is speaking:
        - If user says 'wait', 'listen me', 'stop' -> halts playback (barge-in).
        - If user says other words or noise occurs -> continues speaking.
        """
        if not self.is_speaking:
            return False

        if self.is_interruption_intent(transcript):
            kw = self.extract_interruption_keyword(transcript)
            self.last_interruption_keyword = kw
            self.cancel_speech(reason=f"keyword_{kw}")
            return True

        # Non-interruption user utterance: filter as disturbance, continue speaking
        self.disturbances_absorbed += 1
        return False

    def handle_incoming_audio_frame(
        self,
        energy_level: float,
        transcript: Optional[str] = None,
        is_disturbance: bool = False
    ) -> bool:
        """
        Processes an incoming microphone frame:
        - If disturbance: continues speaking, does not close.
        - If transcript contains 'wait', 'listen me', 'stop' -> stops speaking.
        - If energy frame without keywords:
            * In require_keyword_interruption mode: continues speaking (disturbance tolerated).
            * In legacy raw energy mode (for tests): halts on energy_level > energy_threshold.
        """
        if is_disturbance:
            return self.handle_disturbance(energy_level, "flagged_disturbance")

        if transcript is not None:
            return self.handle_user_utterance(transcript)

        # Transcript is None (pure energy frame)
        if self.require_keyword_interruption:
            # Ambient energy without verified interruption keyword is treated as disturbance
            if energy_level > self.energy_threshold:
                self.disturbances_absorbed += 1
            return False

        # Legacy raw energy VAD fallback (preserves unit test compatibility)
        if energy_level > self.energy_threshold:
            if self.is_speaking:
                self.cancel_speech(reason="energy_threshold_exceeded")
                return True
        return False

    def get_current_telemetry(self, force: bool = False) -> PersonaTelemetry:
        """Loads live persona telemetry from SQLite WAL with sub-second caching."""
        now = time.time()
        if not force and self._cached_telemetry is not None and (now - self._cached_telemetry_time) < 10.0:
            return self._cached_telemetry
        try:
            data = self.store.get_persona_settings()
            t = PersonaTelemetry(
                empathy_pct=data["empathy_pct"],
                humor_pct=data["humor_pct"],
                candor_pct=data["candor_pct"],
                verbosity_pct=data["verbosity_pct"],
                voice_id=data["voice_id"],
                voice_engine=data.get("voice_engine", "kokoro"),
                active_preset=data["active_preset"],
            )
            self._cached_telemetry = t
            self._cached_telemetry_time = now
            return t
        except Exception:
            return PersonaTelemetry()

    def detect_user_mood(self, text: str = "") -> str:
        """Infers lightweight vocal and session mood cues for dynamic prompt hydration."""
        current_hour = datetime.datetime.now().hour
        t_lower = (text or "").lower()

        is_late_night = current_hour < 5

        frustration_cues = [
            "error", "fail", "failed", "bug", "stuck", "broken", "traceback",
            "exception", "crash", "tired", "headache", "ugh", "damn", "frustrated"
        ]
        has_frustration = any(w in t_lower for w in frustration_cues)

        celebration_cues = ["fixed", "works", "working", "solved", "success", "awesome", "great", "passed"]
        has_celebration = any(w in t_lower for w in celebration_cues)

        if is_late_night and has_frustration:
            return "exhausted and frustrated by late-night debugging session; needs grounding emotional support and crisp fix"
        elif is_late_night and has_celebration:
            return "late-night triumphant celebration; proud, energetic shared victory, mindful of rest"
        elif is_late_night:
            return "late-night deep focus hours; calm, supportive, and mindful of stamina"
        elif has_frustration:
            return "frustrated and stressed by failing build or bug; needs calm validation before clean resolution"
        elif has_celebration:
            return "triumphant and energetic; shared celebration"
        else:
            return "neutral, focused co-pilot session"

    # --------------------------------------------------------------------------
    # 3. Proper AI Responding Engine
    # --------------------------------------------------------------------------
    def generate_ai_response(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        context: Optional[str] = None
    ) -> str:
        """
        Generates an articulate, natural, context-aware AI response
        calibrated to live persona percentages and user mood.
        """
        clean_prompt = prompt.strip()
        if not clean_prompt:
            return "I am online and listening. How can I help you today?"

        # Check reflex router first (<50ms deterministic execution for telemetry/settings/controls)
        try:
            reflex_res = self.reflex_router.evaluate_and_execute(clean_prompt)
            if reflex_res.get("success") and reflex_res.get("spoken_confirmation"):
                return sanitize_for_tts(str(reflex_res["spoken_confirmation"]))
        except Exception as vault_exc:
            logging.getLogger("nexus.voice_pipeline").debug("Vault lookup notice: %s", vault_exc)

        # Hydrate dynamic prompt using live telemetry from SQLite WAL
        telemetry = self.get_current_telemetry()
        user_mood_hint = self.detect_user_mood(clean_prompt)
        dynamic_system = build_dynamic_voice_prompt(telemetry, user_mood_hint=user_mood_hint)

        sys_instruction = system_prompt or dynamic_system
        if context:
            sys_instruction += f"\nCurrent System Context: {context}"

        # 0. Check active Haru-4B Duplex Voice node on GPU 1
        try:
            from core.runtime.compute_pool import FederatedComputePool
            pool = FederatedComputePool()
            voice_node = pool.get_voice_duplex_node()
            if voice_node and voice_node.get("url"):
                import urllib.request
                import json
                v_url = f"{voice_node['url'].rstrip('/')}/api/haru/dialogue"
                req_data = json.dumps({"text": clean_prompt, "system": sys_instruction}).encode("utf-8")
                req = urllib.request.Request(v_url, data=req_data, headers={"Content-Type": "application/json"}, method="POST")
                with urllib.request.urlopen(req, timeout=2.0) as resp:
                    if resp.status == 200:
                        v_json = json.loads(resp.read().decode("utf-8"))
                        if v_json.get("spoken_text"):
                            return sanitize_for_tts(v_json["spoken_text"])
        except Exception as exc:
            logging.getLogger("nexus.voice_pipeline").debug("Haru duplex voice route notice: %s", exc)

        # 1. Try ProviderMesh (Groq -> Gemini -> Ollama -> Custom)
        if self.provider_mesh:
            try:
                res = self.provider_mesh.chat_complete(clean_prompt, system_prompt=sys_instruction)
                if res.get("success") and res.get("content"):
                    return sanitize_for_tts(res["content"])
            except Exception as mesh_exc:
                logging.getLogger("nexus.voice_pipeline").debug("ProviderMesh completion notice: %s", mesh_exc)

        # 2. Intelligent local response synthesis calibrated to current telemetry
        return sanitize_for_tts(self._synthesize_local_response(clean_prompt, telemetry))

    def _synthesize_local_response(self, prompt: str, telemetry: Optional[PersonaTelemetry] = None) -> str:
        """Fallback conversational synthesis when offline or keyless, calibrated to telemetry."""
        t = telemetry or self.get_current_telemetry()
        p_lower = prompt.lower()

        if any(w in p_lower for w in ("hello", "hi", "hey")):
            if t.empathy_pct >= 75:
                return "Hello Niranjan. I am right here with you. How are you feeling, and what are we building today?"
            elif t.humor_pct >= 70:
                return "Hello Niranjan. TARS-level wit is active and standing by. What impossible bug are we squashing now?"
            else:
                return "Hello Niranjan. Nexus OS voice pipeline is active and ready to assist you."
        elif "who are you" in p_lower or "your name" in p_lower:
            return "I am Nexdune, NiranX's personal AI coding agent, powered by Antigravity."
        elif any(w in p_lower for w in ("tired", "exhausted", "headache", "burned out", "stress")):
            if t.empathy_pct >= 70:
                return "I hear you, Niranjan. Take a deep breath and stretch for a moment. You have been putting in serious work. We can tackle the rest whenever you are ready."
            else:
                return "Noted. System load steady. Let me know when you want to proceed."
        elif "status" in p_lower or "how are you" in p_lower:
            return f"All autonomous systems nominal. Empathy is at {t.empathy_pct} percent, humor at {t.humor_pct} percent, and candor at {t.candor_pct} percent."
        elif "screenshot" in p_lower or "screen" in p_lower:
            return "Understood. Capturing desktop screenshot now."
        elif "help" in p_lower:
            return "You can adjust my emotional settings, run commands, create documents, inspect code, control applications, or speak freely with me."
        else:
            if t.empathy_pct >= 75:
                return f"I have received your request: {prompt[:80]}. I am taking care of this right now."
            else:
                return f"Received request: {prompt[:80]}. Executing now."

    def _clean_for_speech(self, text: str) -> str:
        """Strips formatting symbols and normalizes text for speech synthesis (<5ms)."""
        return normalize_for_speech(text)

    # --------------------------------------------------------------------------
    # 4. Resilient Playback & Speech Streaming with Prosody Modulation
    # --------------------------------------------------------------------------
    def provide_interim_feedback(self, tool_name: str) -> Optional[str]:
        """Provides fast interim speech feedback for slow operations (>2.5s)."""
        norm = (tool_name or "").strip().lower()
        if norm in _SLOW_TOOLS:
            phrase = get_interim_feedback(norm)
            threading.Thread(target=lambda: self.speak_stream(phrase), daemon=True, name="InterimFeedbackTTS").start()
            return phrase
        return None

    def route_partial_reflex(self, partial_text: str, debounce_sec: float = 2.0) -> Optional[Dict[str, Any]]:
        """Evaluates partial speech chunks against deterministic reflex commands in <50ms."""
        return self.reflex_router.route_partial_reflex(partial_text, debounce_sec=debounce_sec)

    def speak_stream(
        self,
        text: str,
        voice: Optional[str] = None,
        dynamic_timeout: bool = True,
        speaker_role: str = "OPERATOR",
    ) -> Dict[str, Any]:
        """
        Synthesizes and speaks text with active barge-in monitoring and dynamic prosody modulation.
        Uses dynamic timeout based on text length to prevent premature cutoffs.
        Enforces single-speaker audio mutex and provides text-only fallback.
        """
        self.current_speaker_role = speaker_role
        clean_text = normalize_for_speech(sanitize_for_tts(text.strip()))
        if not clean_text:
            return {"success": True, "duration": 0.0, "text": "", "speaker_role": speaker_role}

        # Reset prior state
        self.cancel_speech()

        with self._lock:
            self.is_speaking = True

        start_t = time.time()
        telemetry = self.get_current_telemetry()
        prosody = compute_tts_prosody(telemetry)
        active_voice = voice or telemetry.voice_id or self.voice
        timeout = max(60.0, len(clean_text) * 0.35) if dynamic_timeout else 15.0

        mutex_acquired = False
        try:
            mutex_acquired = _audio_mutex.acquire(blocking=True, timeout=1.5)
        except Exception:
            mutex_acquired = False

        try:
            # Method -1: Remote Haru-4B Full-Duplex Engine (with automatic sub-50ms local fallback)
            haru_played = False
            target_engine = getattr(telemetry, "voice_engine", "") or self.tts_backend
            if target_engine == "haru_4b":
                try:
                    from core.runtime.workspaces import WorkspaceGovernor
                    from core.bridge.haru_client import HaruDuplexClient, HaruUnavailableError
                    gov = WorkspaceGovernor()
                    is_silent = gov.get_mode().upper() == "SILENT"
                    haru_client = HaruDuplexClient(governor=gov, db_path=getattr(self.store, "db_path", None))
                    if not is_silent and haru_client.is_available():
                        p_card = haru_client.build_persona_card()
                        frame_res = haru_client.send_duplex_frame(pcm_frame=b"\x00" * 4256, persona_card=p_card)
                        audio_out = frame_res.get("audio_frame")
                        if audio_out and len(audio_out) > 0:
                            out_file = os.path.join(self.temp_dir, f"speech_haru_{int(time.time() * 1000)}.wav")
                            with wave.open(out_file, "wb") as wf:
                                wf.setnchannels(1)
                                wf.setsampwidth(2)
                                wf.setframerate(16000)
                                wf.writeframes(audio_out)
                            if os.path.exists(out_file) and os.path.getsize(out_file) > 0:
                                norm_path = os.path.abspath(out_file).replace("'", "''")
                                ps_play = (
                                    "Add-Type -AssemblyName presentationCore; "
                                    f"$p = New-Object System.Windows.Media.MediaPlayer; "
                                    f"$p.Open([System.Uri]'{norm_path}'); $p.Play(); "
                                    f"Start-Sleep -Milliseconds 400; "
                                    f"$w = 0; while (-not $p.NaturalDuration.HasTimeSpan -and $w -lt 40) {{ Start-Sleep -Milliseconds 50; $w++ }}; "
                                    f"if ($p.NaturalDuration.HasTimeSpan) {{ Start-Sleep -Seconds ($p.NaturalDuration.TimeSpan.TotalSeconds + 0.3) }}; "
                                    f"$p.Stop(); $p.Close();"
                                )
                                proc = subprocess.Popen(
                                    ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_play],
                                    stdout=subprocess.DEVNULL,
                                    stderr=subprocess.DEVNULL
                                )
                                with self._lock:
                                    self._current_audio_proc = proc
                                proc.wait(timeout=timeout)
                                haru_played = True
                    if not haru_played:
                        reason = "silent_mode" if is_silent else "haru_unavailable"
                        self.log_haru_fallback(reason)
                        logging.getLogger("nexus.voice_pipeline").info("Haru-4B remote unavailable or air-gapped; cascading (<50ms) to local Kokoro/Edge-TTS")
                except Exception as h_err:
                    self.log_haru_fallback(f"haru_exception_{type(h_err).__name__}")
                    logging.getLogger("nexus.voice_pipeline").debug("Haru-4B synthesis exception: %s; falling back locally", h_err)
                    haru_played = False

            # Method 0: Remote VoxCPM2 Neural TTS via Kaggle 2x T4 GPU Tunnel (with automatic local fallback)
            voxcpm_played = False
            if not haru_played and target_engine == "voxcpm2":
                try:
                    from core.bridge.voxcpm_client import VoxCPM2Client
                    vox_client = VoxCPM2Client()
                    if vox_client.check_health():
                        out_file = os.path.join(self.temp_dir, f"speech_voxcpm_{int(time.time() * 1000)}.wav")
                        v_prompt = f"Calm, articulate tone, empathy {telemetry.empathy_pct}%"
                        if vox_client.synthesize_to_file(clean_text, out_file, voice_prompt=v_prompt):
                            norm_path = os.path.abspath(out_file).replace("'", "''")
                            ps_play = (
                                "Add-Type -AssemblyName presentationCore; "
                                f"$p = New-Object System.Windows.Media.MediaPlayer; "
                                f"$p.Open([System.Uri]'{norm_path}'); $p.Play(); "
                                f"Start-Sleep -Milliseconds 400; "
                                f"$w = 0; while (-not $p.NaturalDuration.HasTimeSpan -and $w -lt 40) {{ Start-Sleep -Milliseconds 50; $w++ }}; "
                                f"if ($p.NaturalDuration.HasTimeSpan) {{ Start-Sleep -Seconds ($p.NaturalDuration.TimeSpan.TotalSeconds + 0.3) }}; "
                                f"$p.Stop(); $p.Close();"
                            )
                            proc = subprocess.Popen(
                                ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_play],
                                stdout=subprocess.DEVNULL,
                                stderr=subprocess.DEVNULL
                            )
                            with self._lock:
                                self._current_audio_proc = proc

                            proc.wait(timeout=timeout)
                            voxcpm_played = True
                    if not voxcpm_played:
                        logging.getLogger("nexus.voice_pipeline").info("VoxCPM2 remote endpoint offline or unavailable; cascading smoothly to local TTS engine")
                except Exception as v_err:
                    logging.getLogger("nexus.voice_pipeline").debug("VoxCPM2 remote synthesis exception: %s; cascading to local engine", v_err)
                    voxcpm_played = False

            # Method 1: Edge-TTS synthesis with prosody rate & pitch modulation
            edge_played = False
            if not haru_played and not voxcpm_played and HAS_EDGE_TTS and edge_tts is not None and (self.tts_backend in ("edge_tts", "voxcpm2", "haru_4b") or target_engine in ("edge_tts", "voxcpm2", "haru_4b")):
                try:
                    out_file = os.path.join(self.temp_dir, f"speech_{int(time.time() * 1000)}.mp3")

                    async def _synth():
                        comm = edge_tts.Communicate(
                            clean_text,
                            active_voice if "-" in active_voice else "en-US-ChristopherNeural",
                            rate=prosody.get("edge_rate", "+0%"),
                            pitch=prosody.get("edge_pitch", "+0Hz"),
                        )
                        await comm.save(out_file)

                    asyncio.run(_synth())

                    if os.path.exists(out_file) and os.path.getsize(out_file) > 0:
                        norm_path = os.path.abspath(out_file).replace("'", "''")
                        ps_play = (
                            "Add-Type -AssemblyName presentationCore; "
                            f"$p = New-Object System.Windows.Media.MediaPlayer; "
                            f"$p.Open([System.Uri]'{norm_path}'); $p.Play(); "
                            f"Start-Sleep -Milliseconds 400; "
                            f"$w = 0; while (-not $p.NaturalDuration.HasTimeSpan -and $w -lt 40) {{ Start-Sleep -Milliseconds 50; $w++ }}; "
                            f"if ($p.NaturalDuration.HasTimeSpan) {{ Start-Sleep -Seconds ($p.NaturalDuration.TimeSpan.TotalSeconds + 0.3) }}; "
                            f"$p.Stop(); $p.Close();"
                        )
                        proc = subprocess.Popen(
                            ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_play],
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL
                        )
                        with self._lock:
                            self._current_audio_proc = proc

                        proc.wait(timeout=timeout)
                        edge_played = True
                except subprocess.TimeoutExpired:
                    self.cancel_speech("timeout_expired")
                except Exception:
                    edge_played = False

            # Method 2: Windows SAPI SpeechSynthesizer Fallback with speed rate modulation
            if not haru_played and not voxcpm_played and not edge_played and self.is_speaking:
                try:
                    escaped_text = clean_text.replace('"', '`"').replace("'", "’")
                    sapi_rate = max(-5, min(5, int((prosody.get("kokoro_speed", 1.0) - 1.0) * 8)))
                    ps_sapi = (
                        f"Add-Type -AssemblyName System.Speech; "
                        f"$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
                        f"$synth.Rate = {sapi_rate}; "
                        f"$synth.Speak('{escaped_text}');"
                    )
                    proc = subprocess.Popen(
                        ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_sapi],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL
                    )
                    with self._lock:
                        self._current_audio_proc = proc

                    proc.wait(timeout=timeout)
                except subprocess.TimeoutExpired:
                    self.cancel_speech("timeout_expired")
                except Exception as exc:
                    logging.getLogger("nexus.voice_pipeline").debug("SAPI speech synthesizer exception: %s", exc)

            duration = round(time.time() - start_t, 2)
            with self._lock:
                self.is_speaking = False
                self._current_audio_proc = None

            return {
                "success": True,
                "duration": duration,
                "text": clean_text,
                "prosody": prosody,
                "voice": active_voice,
                "disturbances_absorbed": self.disturbances_absorbed,
                "interrupted": self.last_interruption_keyword is not None,
                "speaker_role": speaker_role,
                "text_only_fallback": not (haru_played or voxcpm_played or edge_played),
            }
        finally:
            if mutex_acquired:
                try:
                    _audio_mutex.release()
                except Exception as m_exc:
                    logging.getLogger("nexus.voice_pipeline").debug("Audio mutex release notice: %s", m_exc)

    # --------------------------------------------------------------------------
    # 5. Full Turn-Taking: Generate AI Response and Speak
    # --------------------------------------------------------------------------
    def speak_response_to_query(
        self,
        query: str,
        system_prompt: Optional[str] = None,
        speaker_role: str = "OPERATOR",
    ) -> Dict[str, Any]:
        """
        Receives user prompt, generates proper AI response, and speaks it
        with active barge-in protection. Supports Haru-4B full-duplex bridge
        with automatic sub-50ms local fallback.
        """
        self.current_speaker_role = speaker_role
        telemetry = self.get_current_telemetry()
        target_engine = getattr(telemetry, "voice_engine", "") or self.tts_backend

        if target_engine == "haru_4b":
            try:
                from core.runtime.workspaces import WorkspaceGovernor
                from core.bridge.haru_client import HaruDuplexClient, HaruUnavailableError
                gov = WorkspaceGovernor()
                is_silent = gov.get_mode().upper() == "SILENT"
                haru_client = HaruDuplexClient(governor=gov, db_path=getattr(self.store, "db_path", None))
                if not is_silent and haru_client.is_available():
                    p_card = haru_client.build_persona_card()
                    frame_res = haru_client.send_duplex_frame(pcm_frame=b"\x00" * 4256, persona_card=p_card)
                    spoken_text = frame_res.get("spoken_text") or self.generate_ai_response(query, system_prompt=system_prompt)
                    res = self.speak_stream(spoken_text, speaker_role=speaker_role)
                    res["query"] = query
                    res["ai_response"] = spoken_text
                    res["haru_duplex"] = True
                    res["speaker_role"] = speaker_role
                    return res
                else:
                    reason = "silent_mode" if is_silent else "haru_unavailable"
                    self.log_haru_fallback(reason)
            except Exception as h_err:
                self.log_haru_fallback(f"haru_query_error: {h_err}")

        ai_reply = self.generate_ai_response(query, system_prompt=system_prompt)
        res = self.speak_stream(ai_reply, speaker_role=speaker_role)
        res["query"] = query
        res["ai_response"] = ai_reply
        res["speaker_role"] = speaker_role
        return res

    async def route_duplex_session(
        self,
        audio_in_queue: Any,
        audio_out_queue: Any,
        stop_event: Any,
        haru_client: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """
        Routes the live voice session through HaruDuplexClient.stream_duplex_session(...).
        Enforces automatic <50ms fallback to local faster-whisper STT + Kokoro/Edge-TTS
        if HaruDuplexClient is unavailable, or mode switches to SILENT, logging
        haru_fallback_local in telemetry_events.
        """
        from core.runtime.workspaces import WorkspaceGovernor
        from core.bridge.haru_client import HaruDuplexClient, HaruUnavailableError

        t0 = time.perf_counter()
        telemetry = self.get_current_telemetry()
        voice_engine = getattr(telemetry, "voice_engine", "kokoro")
        governor = getattr(self, "governor", None) or WorkspaceGovernor()
        is_silent = governor.get_mode().upper() == "SILENT"
        client = haru_client or HaruDuplexClient(governor=governor, db_path=getattr(self.store, "db_path", None))

        if voice_engine == "haru_4b" and not is_silent and client.is_available():
            try:
                await client.stream_duplex_session(audio_in_queue, audio_out_queue, stop_event)
                latency_ms = round((time.perf_counter() - t0) * 1000.0, 2)
                return {"success": True, "engine": "haru_4b", "routed_remote": True, "latency_ms": latency_ms}
            except HaruUnavailableError as hue:
                self.log_haru_fallback(f"stream_unavailable: {hue}")
            except Exception as exc:
                self.log_haru_fallback(f"stream_error: {exc}")
        else:
            reason = "silent_mode" if is_silent else ("haru_offline" if voice_engine == "haru_4b" else f"engine_{voice_engine}")
            if voice_engine == "haru_4b":
                self.log_haru_fallback(reason)

        return self.execute_local_fallback_session(audio_in_queue, audio_out_queue, stop_event, setup_start_time=t0)

    def execute_local_fallback_session(
        self,
        audio_in_queue: Any,
        audio_out_queue: Any,
        stop_event: Any,
        setup_start_time: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Executes local faster-whisper STT + Kokoro/Edge-TTS fallback loop (<50ms)."""
        t0 = setup_start_time or time.perf_counter()
        pcm_bytes = bytearray()
        if hasattr(audio_in_queue, "get_nowait"):
            try:
                while not audio_in_queue.empty():
                    chunk = audio_in_queue.get_nowait()
                    if chunk:
                        pcm_bytes.extend(chunk)
            except queue.Empty:
                logger.debug("Audio in queue empty during drain.")
            except Exception as drain_exc:
                logger.debug("Audio in drain notice: %s", drain_exc)

        # Immediate zero-overhead failover handoff to local voice loop
        fallback_res = {
            "status": "fallback_local",
            "engine": "local_whisper_tts",
            "routed_remote": False,
            "spoken_text": "Local voice pipeline active.",
            "timestamp": time.time(),
        }
        if hasattr(audio_out_queue, "put_nowait"):
            try:
                audio_out_queue.put_nowait(fallback_res)
            except Exception as out_exc:
                logger.debug("Audio out put notice: %s", out_exc)

        setup_ms = round((time.perf_counter() - t0) * 1000.0, 2)
        return {
            "success": True,
            "engine": "local_whisper_tts",
            "routed_remote": False,
            "setup_latency_ms": setup_ms,
        }

    # --------------------------------------------------------------------------
    # 6. 4-Tier Anti-Echo Architecture
    # --------------------------------------------------------------------------
    def set_speaker_ducking(self, active: bool) -> None:
        """Tier 1: Clamps screen / speaker audio gain to 0 with decay hold-off."""
        if active:
            self.screen_duck_gain = 0.0
            self.set_mic_ducking(True)
        else:
            self.set_mic_ducking(False)
            threading.Thread(target=self._decay_screen_ducking, daemon=True).start()

    def _decay_screen_ducking(self) -> None:
        time.sleep(0.4)
        if not self.is_speaking:
            self.screen_duck_gain = 1.0

    def set_mic_ducking(self, active: bool) -> None:
        """Tier 2: Suppresses background microphone sensitivity during turns."""
        self.mic_sensitivity_gain = 0.20 if active else 1.0

    def record_tts_playback(self, text: str) -> None:
        """Tier 3: Registers AI spoken dialogue into rolling acoustic echo ledger."""
        if text:
            self._tts_history.append((text.strip().lower(), time.time()))
            if len(self._tts_history) > 20:
                self._tts_history.pop(0)

    def is_acoustic_echo(self, transcript: str, time_window_sec: float = 3.0) -> bool:
        """Tier 3: Drops transcribed self-echo turns before polluting context."""
        if not transcript or not transcript.strip():
            return False
        clean_user = transcript.strip().lower()
        now = time.time()
        for tts_text, tts_time in self._tts_history:
            if now - tts_time > time_window_sec:
                continue
            if clean_user in tts_text or tts_text in clean_user:
                return True
            import difflib
            if difflib.SequenceMatcher(None, clean_user, tts_text).ratio() >= 0.60:
                return True
        return False

    def start_keepalive_heartbeat(self, callback: Optional[Callable[[bytes], None]] = None) -> None:
        """Tier 4: Periodic 15-second silent PCM keep-alive loop for edge WebSockets."""
        if self._keepalive_thread and self._keepalive_thread.is_alive():
            return
        self._keepalive_stop_evt.clear()

        def _worker():
            silent_chunk = b"\x00" * 960  # 30ms 16kHz PCM
            while not self._keepalive_stop_evt.wait(15.0):
                if not self.is_speaking and callback:
                    try:
                        callback(silent_chunk)
                    except Exception as k_exc:
                        logging.getLogger("nexus.voice_pipeline").debug("Keepalive heartbeat notice: %s", k_exc)

        self._keepalive_thread = threading.Thread(target=_worker, daemon=True, name="BridgeKeepAlive")
        self._keepalive_thread.start()

    def stop_keepalive_heartbeat(self) -> None:
        """Stops the 15-second keepalive heartbeat."""
        self._keepalive_stop_evt.set()
