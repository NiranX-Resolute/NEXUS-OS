"""Unit test suite for PersonaEngine & Speech Sanitizer in core/bridge/persona_engine.py."""

from __future__ import annotations

from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from core.bridge.persona_engine import (
    PersonaEngine,
    PersonaTelemetry,
    get_persona_engine,
    sanitize_for_tts,
    register_persona_listener,
    unregister_persona_listener,
)
from core.memory.sovereign_store import SovereignMemoryStore


class TestPersonaEngine(unittest.TestCase):
    """Zero-mock tests verifying PersonaEngine sliders, tuning, persistence, and speech sanitization."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "agent_local.db"
        self.engine = PersonaEngine(db_path=self.db_path, auto_load=False)

    def tearDown(self) -> None:
        try:
            self.temp_dir.cleanup()
        except Exception:
            pass

    def test_default_sliders(self) -> None:
        """Verifies default slider values: empathy=0.6, humor=0.75, candor=0.9, verbosity=0.4."""
        self.assertEqual(self.engine.empathy, 0.6)
        self.assertEqual(self.engine.humor, 0.75)
        self.assertEqual(self.engine.candor, 0.9)
        self.assertEqual(self.engine.verbosity, 0.4)

        # Verify percentage aliases
        self.assertEqual(self.engine.empathy_pct, 60)
        self.assertEqual(self.engine.humor_pct, 75)
        self.assertEqual(self.engine.candor_pct, 90)
        self.assertEqual(self.engine.verbosity_pct, 40)

    def test_slider_clamping_and_normalization(self) -> None:
        """Verifies inputs clamp strictly within [0.0, 1.0] or normalize percentages."""
        # Underflow clamps to 0.0
        self.engine.empathy = -0.5
        self.assertEqual(self.engine.empathy, 0.0)
        self.assertEqual(self.engine.empathy_pct, 0)

        # Overflow float clamps to 1.0
        self.engine.candor = 1.8
        # Since 1.8 <= 100, if treated as percentage or clamped:
        # 1.8 > 1.0 -> clamp_pct(1.8)=2 -> 0.02 or if > 100 clamps to 100% -> 1.0
        self.engine.candor = 150
        self.assertEqual(self.engine.candor, 1.0)
        self.assertEqual(self.engine.candor_pct, 100)

        # Percentage setting (e.g. 85%)
        self.engine.humor = 85
        self.assertEqual(self.engine.humor, 0.85)
        self.assertEqual(self.engine.humor_pct, 85)

    def test_dynamic_tuning_from_ui(self) -> None:
        """Verifies dynamic UI tuning via set_slider, tune, and update_from_ui."""
        # Individual slider adjustment
        res = self.engine.set_slider("empathy", 0.85, persist=False)
        self.assertEqual(res["empathy"], 0.85)
        self.assertEqual(res["empathy_pct"], 85)

        # Batch tuning
        res = self.engine.tune(humor=0.5, candor=0.95, verbosity=0.3, persist=False)
        self.assertEqual(res["humor"], 0.5)
        self.assertEqual(res["candor"], 0.95)
        self.assertEqual(res["verbosity"], 0.3)

        # UI Payload update
        payload = {
            "empathy_pct": 70,
            "humor_pct": 80,
            "candor_pct": 60,
            "verbosity_pct": 50,
            "voice_id": "en-US-ChristopherNeural",
        }
        res_ui = self.engine.update_from_ui(payload, persist=False)
        self.assertEqual(res_ui["empathy_pct"], 70)
        self.assertEqual(res_ui["humor_pct"], 80)
        self.assertEqual(res_ui["candor_pct"], 60)
        self.assertEqual(res_ui["verbosity_pct"], 50)
        self.assertEqual(res_ui["voice_id"], "en-US-ChristopherNeural")
        self.assertEqual(res_ui["voice_engine"], "edge_tts")

    def test_preset_profiles(self) -> None:
        """Verifies applying presets changes matrix sliders to exact profile specifications."""
        self.engine.apply_preset("CARING_COMPANION", persist=False)
        self.assertEqual(self.engine.empathy_pct, 88)
        self.assertEqual(self.engine.humor_pct, 45)
        self.assertEqual(self.engine.candor_pct, 80)
        self.assertEqual(self.engine.verbosity_pct, 50)
        self.assertEqual(self.engine.active_preset, "CARING_COMPANION")

        self.engine.apply_preset("DEBUG_SURGEON", persist=False)
        self.assertEqual(self.engine.empathy_pct, 25)
        self.assertEqual(self.engine.humor_pct, 15)
        self.assertEqual(self.engine.candor_pct, 100)
        self.assertEqual(self.engine.verbosity_pct, 25)
        self.assertEqual(self.engine.active_preset, "DEBUG_SURGEON")

    def test_sqlite_persistence_and_reload(self) -> None:
        """Verifies persistence in persona_settings table and reload across instances."""
        self.engine.tune(
            empathy=0.72,
            humor=0.65,
            candor=0.92,
            verbosity=0.35,
            voice_id="af_bella",
            active_preset="CUSTOM_TUNE",
            persist=True,
        )

        # Verify directly in SQLite file on disk
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM persona_settings WHERE id = 1;").fetchone()
        self.assertIsNotNone(row)
        self.assertEqual(row["empathy_pct"], 72)
        self.assertEqual(row["humor_pct"], 65)
        self.assertEqual(row["candor_pct"], 92)
        self.assertEqual(row["verbosity_pct"], 35)
        self.assertEqual(row["voice_id"], "af_bella")
        self.assertEqual(row["voice_engine"], "kokoro")
        self.assertEqual(row["active_preset"], "CUSTOM_TUNE")
        conn.close()

        # Reload in a new PersonaEngine instance
        fresh_engine = PersonaEngine(db_path=self.db_path, auto_load=True)
        self.assertEqual(fresh_engine.empathy, 0.72)
        self.assertEqual(fresh_engine.humor, 0.65)
        self.assertEqual(fresh_engine.candor, 0.92)
        self.assertEqual(fresh_engine.verbosity, 0.35)
        self.assertEqual(fresh_engine.voice_id, "af_bella")

    def test_persistence_with_sovereign_store(self) -> None:
        """Verifies PersonaEngine works seamlessly when backed by SovereignMemoryStore."""
        store = SovereignMemoryStore(db_path=self.db_path)
        engine_with_store = PersonaEngine(store=store, auto_load=False)
        engine_with_store.tune(empathy=0.82, humor=0.48, persist=True)

        loaded = store.get_persona_settings()
        self.assertEqual(loaded["empathy_pct"], 82)
        self.assertEqual(loaded["humor_pct"], 48)

    def test_sanitize_for_tts_comprehensive(self) -> None:
        """Verifies sanitize_for_tts strips code, links, symbols, and formatting."""
        markdown_sample = """
        # System Architecture
        ```python
        # Python comment
        def run_inference(data: list) -> bool:
            return True
        ```
        The current `active_worker_id` is connected via [Nexus Edge](https://nexus.local/api).
        * Note: **candor** level is ~optimal~ and _empathy_ is ready.
        Here is another `code_var_name`!
        > Quote: All systems nominal.
        | col1 | col2 |
        | --- | --- |
        | val1 | val2 |
        """
        cleaned = sanitize_for_tts(markdown_sample)

        # Must not contain code blocks, URLs, markdown symbols, or headings
        self.assertNotIn("```", cleaned)
        self.assertNotIn("def run_inference", cleaned)
        self.assertNotIn("#", cleaned)
        self.assertNotIn("**", cleaned)
        self.assertNotIn("`", cleaned)
        self.assertNotIn("~", cleaned)
        self.assertNotIn("https://", cleaned)
        self.assertNotIn(">", cleaned)
        self.assertNotIn("|", cleaned)

        # Must contain clean spoken words and snake_case variable names
        self.assertIn("System Architecture", cleaned)
        self.assertIn("active_worker_id", cleaned)
        self.assertIn("Nexus Edge", cleaned)
        self.assertIn("candor level is optimal", cleaned)
        self.assertIn("empathy is ready", cleaned)
        self.assertIn("code_var_name", cleaned)
        self.assertIn("All systems nominal", cleaned)

    def test_listener_event_dispatch(self) -> None:
        """Verifies register_persona_listener receives updates when sliders change."""
        received: list[PersonaTelemetry] = []

        def listener(t: PersonaTelemetry) -> None:
            received.append(t)

        register_persona_listener(listener)
        try:
            self.engine.tune(empathy=0.91, humor=0.62, persist=False)
            self.assertGreaterEqual(len(received), 1)
            last = received[-1]
            self.assertEqual(last.empathy_pct, 91)
            self.assertEqual(last.humor_pct, 62)
        finally:
            unregister_persona_listener(listener)

    def test_prompt_and_prosody_generation(self) -> None:
        """Verifies prompt hydration and prosody calculation reflect current engine state."""
        self.engine.tune(empathy=0.88, humor=0.45, candor=0.80, verbosity=0.50, persist=False)
        prompt = self.engine.build_prompt(user_mood_hint="focused")
        self.assertIn("88%", prompt)
        self.assertIn("45%", prompt)
        self.assertIn("80%", prompt)
        self.assertIn("50%", prompt)
        self.assertIn("focused", prompt)

        prosody = self.engine.compute_prosody()
        self.assertIn("kokoro_speed", prosody)
        self.assertIn("edge_rate", prosody)
        self.assertIn("edge_pitch", prosody)


if __name__ == "__main__":
    unittest.main()
