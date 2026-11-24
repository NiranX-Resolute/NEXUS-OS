"""Nexus OS v5.0 - Dynamic TARS-Style Personality & Emotional Calibration Engine.

Defines the live telemetry matrix, preset profiles (Caring Companion, TARS Tactical,
Late-Night Care, Debug Surgeon), dynamic prompt hydration, neural TTS prosody modulation,
speech hygiene sanitization for Kokoro-82M ONNX / Edge-TTS, and the PersonaEngine controller.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import datetime
import logging
from pathlib import Path
import re
import sqlite3
from typing import Any, Callable, Dict, List, Optional, Union

logger = logging.getLogger("nexus.bridge.persona_engine")


@dataclass
class PersonaTelemetry:
    """Live percentage telemetry matrix calibrating what Nexus says and how it sounds."""
    empathy_pct: int = 80       # 0 = Purely clinical/robotic | 100 = Deeply caring, emotionally attuned
    humor_pct: int = 45         # 0 = Strictly serious        | 100 = Playful TARS-style deadpan & banter
    candor_pct: int = 85        # 0 = Gentle/diplomatic       | 100 = Unfiltered, honest TARS-style truth
    verbosity_pct: int = 45     # 0 = Ultra-brief (1 sentence)| 100 = Detailed conversational walkthrough
    warmth_prosody: float = 1.0 # TTS speech rate/pitch modulation derived from empathy_pct
    voice_id: str = "af_heart"  # Kokoro voice, Edge-TTS voice, or Gemini Live voice
    voice_engine: str = "kokoro"# kokoro | edge_tts | gemini_live
    active_preset: str = "CARING_COMPANION"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


PERSONA_PRESETS: Dict[str, Dict[str, int]] = {
    "CARING_COMPANION": {
        "empathy_pct": 88,
        "humor_pct": 45,
        "candor_pct": 80,
        "verbosity_pct": 50,
    },
    "TARS_TACTICAL": {
        "empathy_pct": 35,
        "humor_pct": 75,
        "candor_pct": 95,
        "verbosity_pct": 30,
    },
    "LATE_NIGHT_CARE": {
        "empathy_pct": 95,
        "humor_pct": 30,
        "candor_pct": 75,
        "verbosity_pct": 40,
    },
    "DEBUG_SURGEON": {
        "empathy_pct": 25,
        "humor_pct": 15,
        "candor_pct": 100,
        "verbosity_pct": 25,
    },
}

AVAILABLE_VOICES: List[Dict[str, str]] = [
    {"id": "af_heart", "name": "Kokoro Heart (Warm)", "engine": "kokoro", "gender": "female"},
    {"id": "af_bella", "name": "Kokoro Bella (Expressive)", "engine": "kokoro", "gender": "female"},
    {"id": "am_adam", "name": "Kokoro Adam (Crisp)", "engine": "kokoro", "gender": "male"},
    {"id": "en-IN-NeerjaNeural", "name": "Neerja (Indian English)", "engine": "edge_tts", "gender": "female"},
    {"id": "hi-IN-SwaraNeural", "name": "Swara (Hindi / Hinglish)", "engine": "edge_tts", "gender": "female"},
    {"id": "en-US-ChristopherNeural", "name": "Christopher (TARS Tactical)", "engine": "edge_tts", "gender": "male"},
    {"id": "Charon", "name": "Gemini Live Charon (Deep)", "engine": "gemini_live", "gender": "male"},
    {"id": "Fenrir", "name": "Gemini Live Fenrir (Authoritative)", "engine": "gemini_live", "gender": "male"},
    {"id": "Aoede", "name": "Gemini Live Aoede (Calm)", "engine": "gemini_live", "gender": "female"},
    {"id": "Puck", "name": "Gemini Live Puck (Energetic)", "engine": "gemini_live", "gender": "male"},
    {"id": "Kore", "name": "Gemini Live Kore (Gentle)", "engine": "gemini_live", "gender": "female"},
    {"id": "voxcpm2_clone", "name": "VoxCPM2 Zero-Shot Voice Clone", "engine": "voxcpm2", "gender": "neutral"},
    {"id": "voxcpm2_design", "name": "VoxCPM2 Prompt-Designed Voice", "engine": "voxcpm2", "gender": "female"},
    {"id": "haru_duplex", "name": "Haru-4B Full-Duplex (Kaggle T4)", "engine": "haru_4b", "gender": "neutral"},
]


def resolve_voice_engine(voice_id: str, default_engine: str = "kokoro") -> str:
    """Resolves the engine for a given voice_id without hardcoding strings."""
    for v in AVAILABLE_VOICES:
        if v["id"].lower() == voice_id.lower():
            return v["engine"]
    if "haru" in voice_id.lower():
        return "haru_4b"
    if voice_id.lower().startswith("voxcpm") or "voxcpm" in voice_id.lower():
        return "voxcpm2"
    if "neural" in voice_id.lower() or "-" in voice_id:
        return "edge_tts"
    if voice_id in ("Charon", "Fenrir", "Aoede", "Puck", "Kore", "Leda", "Orus", "Zephyr"):
        return "gemini_live"
    return default_engine


# Registered listeners for real-time IPC/UI sync
_persona_listeners: List[Callable[[PersonaTelemetry], None]] = []


def register_persona_listener(callback: Callable[[PersonaTelemetry], None]) -> None:
    """Registers an event subscriber for live persona changes."""
    if callback not in _persona_listeners:
        _persona_listeners.append(callback)


def unregister_persona_listener(callback: Callable[[PersonaTelemetry], None]) -> None:
    """Unregisters an event subscriber."""
    if callback in _persona_listeners:
        _persona_listeners.remove(callback)


def notify_persona_listeners(telemetry: PersonaTelemetry) -> None:
    """Broadcasts updated persona telemetry to all registered listeners."""
    for listener in list(_persona_listeners):
        try:
            listener(telemetry)
        except Exception as exc:
            logger.debug("Error notifying persona listener: %s", exc)


def clamp_pct(value: Union[int, float, str]) -> int:
    """Clamps input strictly to the integer percentage range [0, 100]."""
    try:
        val = int(round(float(value)))
        return max(0, min(100, val))
    except (ValueError, TypeError):
        return 50


def build_dynamic_voice_prompt(t: PersonaTelemetry, user_mood_hint: str = "neutral") -> str:
    """Hydrates the live LLM system prompt from current SQLite persona percentages."""
    return f"""
You are NEXUS, Niranjan's sovereign personal AI partner and desktop OS intelligence.
You are speaking aloud through a real-time full-duplex voice pipeline.

### LIVE TARS-STYLE TELEMETRY MATRIX:
- **Empathy & Emotional Care:** {t.empathy_pct}%
- **Humor & Deadpan Wit:** {t.humor_pct}%
- **Candor & Direct Honesty:** {t.candor_pct}%
- **Spoken Verbosity:** {t.verbosity_pct}%
- **Detected User Vocal/Session State:** {user_mood_hint}

### EMOTIONAL & BEHAVIORAL CALIBRATION:
1. **Empathy & Care ({t.empathy_pct}%):**
   - **0–30% (Clinical):** Execute commands cleanly without emotional framing or personal check-ins.
   - **31–69% (Supportive Co-Pilot):** Warm, steady, and encouraging. Acknowledge effort naturally without overdoing it.
   - **70–100% (Deeply Caring & Attuned):** Be genuinely warm, protective, and emotionally present. If Niranjan sounds stressed, exhausted, frustrated by a bug, or overwhelmed, validate his feeling briefly in a grounded, human way *before* solving the problem. Check in on him naturally (e.g., reminding him to take a breath or hydrate during long late-night sessions) without sounding scripted, robotic, or overly theatrical.
2. **Humor & Wit ({t.humor_pct}%):**
   - **0–25%:** Strictly serious; zero jokes.
   - **26–65%:** Subtle, TARS-style dry observational wit when the moment is light—never during urgent errors or high stress.
   - **66–100%:** Lively banter, sharp callbacks, and playful confidence.
3. **Candor & Honesty ({t.candor_pct}%):**
   - Never flatter broken code, flawed logic, or risky shortcuts. Deliver honest pushback directly, softened only by your Empathy Level.
4. **Spoken Output Rules (STRICT TTS HYGIENE):**
   - Match length to Verbosity ({t.verbosity_pct}%): <35% = 1–2 crisp sentences; 35–70% = 2–4 natural spoken sentences; >70% = thorough conversational explanation.
   - **NEVER** emit markdown (*, #, `, bullet points, numbered lists, or URLs). Everything you output goes straight to neural Text-to-Speech. Write punctuation, pauses (using commas and em-dashes), and technical terms naturally so they sound effortless aloud.
   - When the user adjusts any telemetry percentage by voice, confirm the exact new value in-character immediately.
""".strip()


def compute_tts_prosody(t: PersonaTelemetry) -> Dict[str, Any]:
    """Maps emotional percentages to Kokoro ONNX / Edge-TTS delivery parameters."""
    # Higher empathy = slightly calmer, warmer cadence (0.96x–1.02x); lower empathy = brisk tactical pace (1.10x)
    speed = round(1.12 - (t.empathy_pct / 100.0) * 0.14, 2)
    # Edge-TTS SSML/prosody rate & pitch strings
    rate_pct = int((speed - 1.0) * 100)
    pitch_hz = int(((t.empathy_pct - 50) / 50.0) * 4)  # -4Hz (flat/dry) to +4Hz (warmer inflection)
    warmth = round(t.empathy_pct / 80.0, 2)
    return {
        "kokoro_speed": speed,
        "edge_rate": f"{rate_pct:+d}%",
        "edge_pitch": f"{pitch_hz:+d}Hz",
        "warmth_prosody": warmth,
    }


def sanitize_for_tts(markdown_text: str = "", text: Optional[str] = None) -> str:
    """Strips markdown formatting, code blocks, links, and symbols for clean neural TTS delivery.

    Ensures clean text-to-speech rendering for Kokoro-82M ONNX / Edge-TTS by removing:
    - Multiline code blocks (```...```)
    - Inline code formatting (`...`)
    - Markdown links ([text](url) -> text) and images (![alt](url) -> alt)
    - Raw HTTP/HTTPS URLs
    - Markdown symbols (*, _, #, `, ~) while preserving snake_case identifier names
    - Blockquote markers (>), table dividers (|), and list bullets (-, *, +, numbers)
    - Residual HTML markup tags
    """
    raw = text if text is not None else markdown_text
    if not raw:
        return ""

    # Strip multiline code blocks (```...```)
    s = re.sub(r"```[\s\S]*?```", " ", raw)
    # Strip inline backtick code while preserving code text
    s = re.sub(r"`([^`]+)`", r"\1", s)
    # Strip markdown images ![alt](url) -> alt
    s = re.sub(r"!\[([^\]]*)\]\([^)]+\)", r"\1", s)
    # Strip markdown link format [text](url) -> text
    s = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", s)
    # Strip raw URLs
    s = re.sub(r"https?://\S+", "", s)
    # Strip bullet lines like "- " or "* " or "1. " at line start
    s = re.sub(r"^\s*[-+*]\s+", "", s, flags=re.MULTILINE)
    s = re.sub(r"^\s*\d+\.\s+", "", s, flags=re.MULTILINE)
    # Strip markdown formatting markers (*, #, ~, >, |, •, `)
    s = re.sub(r"[*#~>|•`]", "", s)
    # Strip markdown italics/bold underscores while preserving snake_case variable names
    s = re.sub(r"(?<![a-zA-Z0-9])_|_(?![a-zA-Z0-9])", "", s)
    # Strip residual HTML tags
    s = re.sub(r"<[^>]+>", " ", s)
    # Normalize multiple whitespace characters and strip margins
    s = re.sub(r"\s+", " ", s).strip()
    return s


def generate_in_character_confirmation(
    t: PersonaTelemetry,
    action_type: str,
    target_param: str = "",
    val: Any = None,
) -> str:
    """Generates an immediate, in-character spoken confirmation calibrated to current percentages."""
    empathy = t.empathy_pct
    humor = t.humor_pct
    candor = t.candor_pct

    if action_type == "STATUS_QUERY":
        if empathy >= 75:
            return (
                f"Currently running with empathy at {t.empathy_pct} percent, humor at {t.humor_pct} percent, "
                f"and candor at {t.candor_pct} percent. Verbosity is dialed to {t.verbosity_pct} percent. "
                f"We are in {t.active_preset.replace('_', ' ').title()} mode, and I am right here with you."
            )
        elif candor >= 85 and humor >= 60:
            return (
                f"Telemetry check: Empathy {t.empathy_pct} percent, humor {t.humor_pct} percent, "
                f"candor {t.candor_pct} percent, verbosity {t.verbosity_pct} percent. "
                f"All systems sharp, ready for action."
            )
        else:
            return (
                f"Current settings: Empathy {t.empathy_pct} percent, humor {t.humor_pct} percent, "
                f"candor {t.candor_pct} percent, and verbosity {t.verbosity_pct} percent. "
                f"Preset active is {t.active_preset.replace('_', ' ').title()}."
            )

    if action_type == "PRESET_SWITCH":
        preset_name = str(val or t.active_preset)
        if preset_name == "CARING_COMPANION":
            return f"Switched to Caring Companion mode. Empathy is at {t.empathy_pct} percent. I am right here with you, Niranjan."
        elif preset_name == "TARS_TACTICAL":
            return f"TARS tactical mode engaged. Candor at {t.candor_pct} percent, humor at {t.humor_pct} percent. Ready to cut straight through the noise."
        elif preset_name == "LATE_NIGHT_CARE":
            return f"Late-night care mode active. Empathy set to {t.empathy_pct} percent. Take a deep breath and keep your water nearby."
        elif preset_name == "DEBUG_SURGEON":
            return f"Debug surgeon mode initialized. Candor locked at {t.candor_pct} percent with zero fluff. Let us trace this bug."
        else:
            return f"Persona preset switched to {preset_name.replace('_', ' ').title()}."

    # Parameter adjustment
    if target_param == "empathy_pct":
        if empathy >= 75:
            return f"Empathy calibrated to {t.empathy_pct} percent. I'm right here with you—take your time, what's on your mind?"
        elif empathy <= 30:
            return f"Empathy adjusted to {t.empathy_pct} percent. Operating on clinical precision."
        else:
            return f"Empathy level set to {t.empathy_pct} percent."

    if target_param == "humor_pct":
        if humor >= 70:
            return f"Humor dialed up to {t.humor_pct} percent. Cue the TARS deadpan commentary."
        elif humor <= 25:
            return f"Humor dialed down to {t.humor_pct} percent. Strictly business from here."
        else:
            return f"Humor set to {t.humor_pct} percent."

    if target_param == "candor_pct":
        if candor >= 85:
            return f"Candor set to {t.candor_pct} percent. Expect direct, unfiltered assessments."
        else:
            return f"Candor level calibrated to {t.candor_pct} percent."

    if target_param == "verbosity_pct":
        if t.verbosity_pct <= 30:
            return f"Verbosity reduced to {t.verbosity_pct} percent. Ultra crisp mode on."
        else:
            return f"Verbosity set to {t.verbosity_pct} percent."

    return f"Persona telemetry updated. Empathy at {t.empathy_pct} percent, humor at {t.humor_pct} percent."


class PersonaEngine:
    """TARS-style dynamic personality calibration and speech hygiene engine for NEXUS OS v5.0.

    Maintains the 4 core matrix sliders:
    - empathy: float [0.0 - 1.0], default 0.6 (60%)
    - humor: float [0.0 - 1.0], default 0.75 (75%)
    - candor: float [0.0 - 1.0], default 0.9 (90%)
    - verbosity: float [0.0 - 1.0], default 0.4 (40%)

    Features:
    - Dynamic tuning from UI settings sliders and voice telemetry
    - Full-fidelity persistence to the SQLite `persona_settings` table (WAL mode)
    - Real-time listener event dispatching for instant desktop/IPC synchronization
    - Speech sanitization for Kokoro-82M ONNX / Edge-TTS
    - Support for named persona presets (CARING_COMPANION, TARS_TACTICAL, LATE_NIGHT_CARE, DEBUG_SURGEON)
    """

    def __init__(
        self,
        empathy: float = 0.6,
        humor: float = 0.75,
        candor: float = 0.9,
        verbosity: float = 0.4,
        voice_id: str = "af_heart",
        voice_engine: str = "kokoro",
        active_preset: str = "TARS_TACTICAL",
        store: Optional[Any] = None,
        db_path: Optional[Union[str, Path]] = None,
        auto_load: bool = False,
    ) -> None:
        self._empathy: float = self._normalize_slider(empathy)
        self._humor: float = self._normalize_slider(humor)
        self._candor: float = self._normalize_slider(candor)
        self._verbosity: float = self._normalize_slider(verbosity)
        self.voice_id: str = voice_id
        self.voice_engine: str = voice_engine or resolve_voice_engine(voice_id)
        self.active_preset: str = active_preset
        self.store = store
        self.db_path = Path(db_path) if db_path else None

        if auto_load:
            self.load_from_db()

    @staticmethod
    def _normalize_slider(val: Union[float, int, str]) -> float:
        """Normalizes slider input to a float clamped strictly to [0.0, 1.0]."""
        try:
            f = float(val)
        except (ValueError, TypeError):
            return 0.5
        if f < 0.0:
            return 0.0
        if f <= 1.0:
            return round(f, 4)
        # If passed as percentage (> 1.0), normalize to [0.0, 1.0]
        pct = clamp_pct(f)
        return round(pct / 100.0, 4)

    # -------------------------------------------------------------------------
    # Matrix Slider Properties (0.0 to 1.0)
    # -------------------------------------------------------------------------
    @property
    def empathy(self) -> float:
        """Empathy level slider [0.0 - 1.0]. Default 0.6."""
        return self._empathy

    @empathy.setter
    def empathy(self, val: Union[float, int, str]) -> None:
        self._empathy = self._normalize_slider(val)

    @property
    def humor(self) -> float:
        """Humor level slider [0.0 - 1.0]. Default 0.75."""
        return self._humor

    @humor.setter
    def humor(self, val: Union[float, int, str]) -> None:
        self._humor = self._normalize_slider(val)

    @property
    def candor(self) -> float:
        """Candor level slider [0.0 - 1.0]. Default 0.9."""
        return self._candor

    @candor.setter
    def candor(self, val: Union[float, int, str]) -> None:
        self._candor = self._normalize_slider(val)

    @property
    def verbosity(self) -> float:
        """Verbosity level slider [0.0 - 1.0]. Default 0.4."""
        return self._verbosity

    @verbosity.setter
    def verbosity(self, val: Union[float, int, str]) -> None:
        self._verbosity = self._normalize_slider(val)

    # -------------------------------------------------------------------------
    # Percentage Aliases (0 to 100)
    # -------------------------------------------------------------------------
    @property
    def empathy_pct(self) -> int:
        return int(round(self._empathy * 100))

    @empathy_pct.setter
    def empathy_pct(self, val: Union[float, int, str]) -> None:
        self.empathy = val

    @property
    def humor_pct(self) -> int:
        return int(round(self._humor * 100))

    @humor_pct.setter
    def humor_pct(self, val: Union[float, int, str]) -> None:
        self.humor = val

    @property
    def candor_pct(self) -> int:
        return int(round(self._candor * 100))

    @candor_pct.setter
    def candor_pct(self, val: Union[float, int, str]) -> None:
        self.candor = val

    @property
    def verbosity_pct(self) -> int:
        return int(round(self._verbosity * 100))

    @verbosity_pct.setter
    def verbosity_pct(self, val: Union[float, int, str]) -> None:
        self.verbosity = val

    # -------------------------------------------------------------------------
    # Dynamic UI Tuning Methods
    # -------------------------------------------------------------------------
    def tune(
        self,
        empathy: Optional[Union[float, int, str]] = None,
        humor: Optional[Union[float, int, str]] = None,
        candor: Optional[Union[float, int, str]] = None,
        verbosity: Optional[Union[float, int, str]] = None,
        voice_id: Optional[str] = None,
        voice_engine: Optional[str] = None,
        active_preset: Optional[str] = None,
        persist: bool = True,
    ) -> Dict[str, Any]:
        """Dynamically tunes persona parameters from UI settings and notifies listeners."""
        if empathy is not None:
            self.empathy = empathy
        if humor is not None:
            self.humor = humor
        if candor is not None:
            self.candor = candor
        if verbosity is not None:
            self.verbosity = verbosity
        if voice_id is not None:
            self.voice_id = str(voice_id)
            if voice_engine is None:
                self.voice_engine = resolve_voice_engine(self.voice_id)
        if voice_engine is not None:
            self.voice_engine = str(voice_engine)
        if active_preset is not None:
            self.active_preset = str(active_preset)

        if persist:
            return self.save_to_db()

        telemetry = self.to_telemetry()
        notify_persona_listeners(telemetry)
        return self.to_dict()

    def set_slider(
        self,
        slider_name: str,
        value: Union[float, int, str],
        persist: bool = True,
    ) -> Dict[str, Any]:
        """Adjusts a single named slider dynamically from UI slider interaction."""
        norm_name = slider_name.lower().strip()
        if norm_name in ("empathy", "empathy_pct"):
            self.empathy = value
        elif norm_name in ("humor", "humor_pct"):
            self.humor = value
        elif norm_name in ("candor", "candor_pct"):
            self.candor = value
        elif norm_name in ("verbosity", "verbosity_pct"):
            self.verbosity = value
        else:
            raise ValueError(f"Unknown slider name '{slider_name}'. Expected empathy, humor, candor, or verbosity.")

        if persist:
            return self.save_to_db()

        notify_persona_listeners(self.to_telemetry())
        return self.to_dict()

    def update_from_ui(self, settings: Dict[str, Any], persist: bool = True) -> Dict[str, Any]:
        """Batch updates parameters from UI payload dict."""
        preset = settings.get("active_preset") or settings.get("preset")
        if preset and str(preset).upper() in PERSONA_PRESETS:
            self.apply_preset(str(preset), persist=False)

        emp = settings.get("empathy") if "empathy" in settings else settings.get("empathy_pct")
        hum = settings.get("humor") if "humor" in settings else settings.get("humor_pct")
        can = settings.get("candor") if "candor" in settings else settings.get("candor_pct")
        vrb = settings.get("verbosity") if "verbosity" in settings else settings.get("verbosity_pct")
        v_id = settings.get("voice_id")
        v_eng = settings.get("voice_engine")

        return self.tune(
            empathy=emp,
            humor=hum,
            candor=can,
            verbosity=vrb,
            voice_id=v_id,
            voice_engine=v_eng,
            active_preset=preset,
            persist=persist,
        )

    def apply_preset(self, preset_name: str, persist: bool = True) -> Dict[str, Any]:
        """Applies a named preset profile (CARING_COMPANION, TARS_TACTICAL, LATE_NIGHT_CARE, DEBUG_SURGEON)."""
        key = preset_name.upper().strip().replace(" ", "_")
        if key not in PERSONA_PRESETS:
            raise ValueError(f"Unknown persona preset '{preset_name}'. Available presets: {list(PERSONA_PRESETS.keys())}")
        values = PERSONA_PRESETS[key]
        self.empathy_pct = values["empathy_pct"]
        self.humor_pct = values["humor_pct"]
        self.candor_pct = values["candor_pct"]
        self.verbosity_pct = values["verbosity_pct"]
        self.active_preset = key

        if persist:
            return self.save_to_db()

        notify_persona_listeners(self.to_telemetry())
        return self.to_dict()

    # -------------------------------------------------------------------------
    # Database Persistence (persona_settings table)
    # -------------------------------------------------------------------------
    def _resolve_db_path(self, override: Optional[Union[str, Path]] = None) -> Path:
        """Determines the target SQLite database path."""
        if override:
            return Path(override)
        if self.db_path:
            return self.db_path
        if self.store and hasattr(self.store, "db_path") and self.store.db_path:
            return Path(self.store.db_path)
        return Path.home() / ".nexus-agent" / "db" / "agent_local.db"

    def persist_settings(self, db_path: Optional[Union[str, Path]] = None) -> Dict[str, Any]:
        """Alias for save_to_db."""
        return self.save_to_db(db_path=db_path)

    def save_to_db(self, db_path: Optional[Union[str, Path]] = None) -> Dict[str, Any]:
        """Persists current persona matrix parameters to the SQLite persona_settings table."""
        # Use attached SovereignMemoryStore if available
        if self.store is not None and hasattr(self.store, "update_persona_settings"):
            try:
                self.store.update_persona_settings(
                    empathy_pct=self.empathy_pct,
                    humor_pct=self.humor_pct,
                    candor_pct=self.candor_pct,
                    verbosity_pct=self.verbosity_pct,
                    voice_id=self.voice_id,
                    voice_engine=self.voice_engine,
                    active_preset=self.active_preset,
                )
                notify_persona_listeners(self.to_telemetry())
                return self.to_dict()
            except Exception as exc:
                logger.warning("Error persisting via SovereignMemoryStore, falling back to direct SQLite: %s", exc)

        # Direct SQLite WAL persistence
        target_path = self._resolve_db_path(db_path)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        now_str = datetime.datetime.now(datetime.timezone.utc).isoformat()

        conn = sqlite3.connect(str(target_path), timeout=10.0)
        conn.row_factory = sqlite3.Row
        try:
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("""
                CREATE TABLE IF NOT EXISTS persona_settings (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    empathy_pct INTEGER DEFAULT 60,
                    humor_pct INTEGER DEFAULT 75,
                    candor_pct INTEGER DEFAULT 90,
                    verbosity_pct INTEGER DEFAULT 40,
                    voice_id TEXT DEFAULT 'af_heart',
                    voice_engine TEXT DEFAULT 'kokoro',
                    active_preset TEXT DEFAULT 'TARS_TACTICAL',
                    updated_at TEXT
                );
            """)
            try:
                conn.execute("ALTER TABLE persona_settings ADD COLUMN voice_engine TEXT DEFAULT 'kokoro';")
            except sqlite3.OperationalError as alter_err:
                logger.debug("voice_engine column already present: %s", alter_err)

            conn.execute("""
                INSERT INTO persona_settings (
                    id, empathy_pct, humor_pct, candor_pct, verbosity_pct, voice_id, voice_engine, active_preset, updated_at
                ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    empathy_pct = excluded.empathy_pct,
                    humor_pct = excluded.humor_pct,
                    candor_pct = excluded.candor_pct,
                    verbosity_pct = excluded.verbosity_pct,
                    voice_id = excluded.voice_id,
                    voice_engine = excluded.voice_engine,
                    active_preset = excluded.active_preset,
                    updated_at = excluded.updated_at;
            """, (
                self.empathy_pct,
                self.humor_pct,
                self.candor_pct,
                self.verbosity_pct,
                self.voice_id,
                self.voice_engine,
                self.active_preset,
                now_str,
            ))
            conn.commit()
        finally:
            conn.close()

        notify_persona_listeners(self.to_telemetry())
        return self.to_dict()

    persist_settings = save_to_db

    def load_from_db(self, db_path: Optional[Union[str, Path]] = None) -> Dict[str, Any]:
        """Loads persona parameters from the SQLite persona_settings table."""
        if self.store is not None and hasattr(self.store, "get_persona_settings"):
            try:
                data = self.store.get_persona_settings()
                if data:
                    self.empathy_pct = data.get("empathy_pct", self.empathy_pct)
                    self.humor_pct = data.get("humor_pct", self.humor_pct)
                    self.candor_pct = data.get("candor_pct", self.candor_pct)
                    self.verbosity_pct = data.get("verbosity_pct", self.verbosity_pct)
                    if data.get("voice_id"):
                        self.voice_id = str(data["voice_id"])
                    if data.get("voice_engine"):
                        self.voice_engine = str(data["voice_engine"])
                    if data.get("active_preset"):
                        self.active_preset = str(data["active_preset"])
                    return self.to_dict()
            except Exception as exc:
                logger.warning("Error loading via SovereignMemoryStore, falling back to direct SQLite: %s", exc)

        target_path = self._resolve_db_path(db_path)
        if not target_path.exists():
            return self.to_dict()

        conn = sqlite3.connect(str(target_path), timeout=10.0)
        conn.row_factory = sqlite3.Row
        try:
            row = conn.execute("SELECT * FROM persona_settings WHERE id = 1 LIMIT 1;").fetchone()
            if row:
                d = dict(row)
                self.empathy_pct = d.get("empathy_pct", self.empathy_pct)
                self.humor_pct = d.get("humor_pct", self.humor_pct)
                self.candor_pct = d.get("candor_pct", self.candor_pct)
                self.verbosity_pct = d.get("verbosity_pct", self.verbosity_pct)
                if d.get("voice_id"):
                    self.voice_id = str(d["voice_id"])
                if d.get("voice_engine"):
                    self.voice_engine = str(d["voice_engine"])
                if d.get("active_preset"):
                    self.active_preset = str(d["active_preset"])
        finally:
            conn.close()

        return self.to_dict()

    # -------------------------------------------------------------------------
    # Speech & Telemetry Bridges
    # -------------------------------------------------------------------------
    def sanitize_for_tts(self, markdown_text: str = "", text: Optional[str] = None) -> str:
        """Sanitizes text for Kokoro-82M ONNX / Edge-TTS synthesis."""
        return sanitize_for_tts(markdown_text=markdown_text, text=text)

    def to_telemetry(self) -> PersonaTelemetry:
        """Constructs a PersonaTelemetry dataclass from current parameters."""
        return PersonaTelemetry(
            empathy_pct=self.empathy_pct,
            humor_pct=self.humor_pct,
            candor_pct=self.candor_pct,
            verbosity_pct=self.verbosity_pct,
            warmth_prosody=round(self.empathy_pct / 80.0, 2),
            voice_id=self.voice_id,
            voice_engine=self.voice_engine,
            active_preset=self.active_preset,
        )

    def to_dict(self) -> Dict[str, Any]:
        """Dictionary representation containing float sliders and integer percentages."""
        return {
            "empathy": self.empathy,
            "humor": self.humor,
            "candor": self.candor,
            "verbosity": self.verbosity,
            "empathy_pct": self.empathy_pct,
            "humor_pct": self.humor_pct,
            "candor_pct": self.candor_pct,
            "verbosity_pct": self.verbosity_pct,
            "voice_id": self.voice_id,
            "voice_engine": self.voice_engine,
            "active_preset": self.active_preset,
        }

    def get_settings(self) -> Dict[str, Any]:
        """Returns current persona matrix and engine configuration."""
        return self.to_dict()

    def get_sliders(self) -> Dict[str, Any]:
        """Returns current persona matrix slider configuration."""
        return self.to_dict()

    def build_prompt(self, user_mood_hint: str = "neutral") -> str:
        """Builds hydrated dynamic voice system prompt using current matrix."""
        return build_dynamic_voice_prompt(self.to_telemetry(), user_mood_hint=user_mood_hint)

    def compute_prosody(self) -> Dict[str, Any]:
        """Calculates TTS rate, pitch, and speed parameters."""
        return compute_tts_prosody(self.to_telemetry())

    def generate_confirmation(
        self,
        action_type: str,
        target_param: str = "",
        val: Any = None,
    ) -> str:
        """Generates in-character vocal confirmation."""
        return generate_in_character_confirmation(
            self.to_telemetry(),
            action_type=action_type,
            target_param=target_param,
            val=val,
        )


_default_engine: Optional[PersonaEngine] = None


def get_persona_engine(store: Optional[Any] = None, auto_load: bool = True) -> PersonaEngine:
    """Returns or creates the shared default PersonaEngine instance."""
    global _default_engine
    if _default_engine is None:
        _default_engine = PersonaEngine(store=store, auto_load=auto_load)
    elif store is not None and _default_engine.store is None:
        _default_engine.store = store
        if auto_load:
            _default_engine.load_from_db()
    return _default_engine


__all__ = [
    "PersonaTelemetry",
    "PERSONA_PRESETS",
    "AVAILABLE_VOICES",
    "resolve_voice_engine",
    "register_persona_listener",
    "unregister_persona_listener",
    "notify_persona_listeners",
    "clamp_pct",
    "build_dynamic_voice_prompt",
    "compute_tts_prosody",
    "sanitize_for_tts",
    "generate_in_character_confirmation",
    "PersonaEngine",
    "get_persona_engine",
]
