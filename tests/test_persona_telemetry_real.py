"""Nexus OS v5.0 - Production-Grade Real Persona & Voice Telemetry Test Suite.

ZERO MOCKS: Operates directly against SQLite WAL on disk, real reflex router regex parsing,
real prompt hydration, real prosody computation, and persistent reload verification.
"""

from __future__ import annotations

import os
from pathlib import Path
import sys
import tempfile
import time
import unittest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CORE_DIR = PROJECT_ROOT / "core"
for p in [str(PROJECT_ROOT), str(CORE_DIR)]:
    if p not in sys.path:
        sys.path.insert(0, p)

from core.bridge.persona_engine import (
    AVAILABLE_VOICES,
    PERSONA_PRESETS,
    PersonaTelemetry,
    build_dynamic_voice_prompt,
    clamp_pct,
    compute_tts_prosody,
    generate_in_character_confirmation,
    sanitize_for_tts,
)
from core.bridge.voice_pipeline import VoicePipeline
from core.memory.sovereign_store import SovereignMemoryStore
from core.runtime.reflex_router import ReflexRouter


class TestPersonaTelemetryReal(unittest.TestCase):
    """Zero-mock end-to-end verification of TARS personality & emotional calibration."""

    def setUp(self) -> None:
        # Create a dedicated temporary database file on disk for isolated WAL testing
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test_agent_local.db"
        self.store = SovereignMemoryStore(db_path=self.db_path)
        # Pre-seed row 1 and warm SQLite WAL cache
        self.store.get_persona_settings()
        self.router = ReflexRouter(dry_run=False, store=self.store)

    def tearDown(self) -> None:
        try:
            self.temp_dir.cleanup()
        except Exception:
            pass

    def test_voice_command_interception_and_disk_update_latency(self) -> None:
        """Verifies voice command updates agent_local.db on disk in <50ms."""
        # Warmup regex compilation and statement execution
        self.router.evaluate_and_execute("check personality levels")
        self.router.evaluate_and_execute("set empathy level to 50 percent")

        cmd = "set empathy level to 92 percent"
        start_t = time.perf_counter()
        res = self.router.evaluate_and_execute(cmd)
        elapsed_ms = (time.perf_counter() - start_t) * 1000

        self.assertTrue(res["success"])
        self.assertEqual(res["action"], "PERSONA_SET_EMPATHY")
        self.assertLess(elapsed_ms, 50.0, f"Execution latency {elapsed_ms}ms exceeded 50ms requirement")
        self.assertIn("92", res["spoken_confirmation"])

        # Verify on-disk persistence
        row = self.store.get_persona_settings()
        self.assertEqual(row["empathy_pct"], 92)

    def test_clamping_out_of_range_telemetry(self) -> None:
        """Verifies out-of-range inputs clamp strictly to [0, 100]."""
        # Upper clamp: 140% -> 100%
        res_upper = self.router.evaluate_and_execute("set empathy to 140%")
        self.assertTrue(res_upper["success"])
        row_upper = self.store.get_persona_settings()
        self.assertEqual(row_upper["empathy_pct"], 100)

        # Lower clamp: -5% -> 0% via clamp_pct and store update
        clamped_low = clamp_pct(-5)
        self.assertEqual(clamped_low, 0)
        self.store.update_persona_settings(empathy_pct=-5)
        row_lower = self.store.get_persona_settings()
        self.assertEqual(row_lower["empathy_pct"], 0)

        # Extreme positive clamp
        clamped_high = clamp_pct(250)
        self.assertEqual(clamped_high, 100)

    def test_relative_adjustments_and_compound_commands(self) -> None:
        """Verifies relative delta increments/decrements and multi-variable voice commands."""
        # Set base empathy to 70%
        self.store.update_persona_settings(empathy_pct=70, humor_pct=40)

        # Relative increase: "increase empathy by 15 percent" -> 85%
        res_inc = self.router.evaluate_and_execute("increase empathy by 15 percent")
        self.assertTrue(res_inc["success"])
        self.assertEqual(self.store.get_persona_settings()["empathy_pct"], 85)

        # Relative lower: "lower humor by 20%" -> 20%
        res_dec = self.router.evaluate_and_execute("lower humor by 20%")
        self.assertTrue(res_dec["success"])
        self.assertEqual(self.store.get_persona_settings()["humor_pct"], 20)

        # Relative verbosity down: "dial down verbosity to 25 percent"
        res_verb = self.router.evaluate_and_execute("dial down verbosity to 25 percent")
        self.assertTrue(res_verb["success"])
        self.assertEqual(self.store.get_persona_settings()["verbosity_pct"], 25)

        # Compound set: "set empathy to 90 percent and humor to 40 percent"
        res_compound = self.router.evaluate_and_execute("set empathy to 90 percent and humor to 40 percent")
        self.assertTrue(res_compound["success"])
        current = self.store.get_persona_settings()
        self.assertEqual(current["empathy_pct"], 90)
        self.assertEqual(current["humor_pct"], 40)

    def test_preset_switches(self) -> None:
        """Verifies 1-click & spoken preset activations match exact specification."""
        # 1. Caring Companion
        res_cc = self.router.evaluate_and_execute("switch to caring companion mode")
        self.assertTrue(res_cc["success"])
        row_cc = self.store.get_persona_settings()
        self.assertEqual(row_cc["active_preset"], "CARING_COMPANION")
        self.assertEqual(row_cc["empathy_pct"], 88)
        self.assertEqual(row_cc["humor_pct"], 45)
        self.assertEqual(row_cc["candor_pct"], 80)
        self.assertEqual(row_cc["verbosity_pct"], 50)

        # 2. TARS Tactical
        res_tars = self.router.evaluate_and_execute("activate TARS tactical mode")
        self.assertTrue(res_tars["success"])
        row_tars = self.store.get_persona_settings()
        self.assertEqual(row_tars["active_preset"], "TARS_TACTICAL")
        self.assertEqual(row_tars["empathy_pct"], 35)
        self.assertEqual(row_tars["humor_pct"], 75)
        self.assertEqual(row_tars["candor_pct"], 95)
        self.assertEqual(row_tars["verbosity_pct"], 30)

        # 3. Late-Night Care
        res_ln = self.router.evaluate_and_execute("late night care mode")
        self.assertTrue(res_ln["success"])
        row_ln = self.store.get_persona_settings()
        self.assertEqual(row_ln["active_preset"], "LATE_NIGHT_CARE")
        self.assertEqual(row_ln["empathy_pct"], 95)
        self.assertEqual(row_ln["humor_pct"], 30)

        # 4. Debug Surgeon
        res_ds = self.router.evaluate_and_execute("debug surgeon mode")
        self.assertTrue(res_ds["success"])
        row_ds = self.store.get_persona_settings()
        self.assertEqual(row_ds["active_preset"], "DEBUG_SURGEON")
        self.assertEqual(row_ds["candor_pct"], 100)
        self.assertEqual(row_ds["verbosity_pct"], 25)

    def test_status_query_confirmation(self) -> None:
        """Verifies spoken personality query returns in-character confirmation."""
        self.store.update_persona_settings(active_preset="TARS_TACTICAL")
        res = self.router.evaluate_and_execute("what are your current emotional settings?")
        self.assertTrue(res["success"])
        self.assertIn("percent", res["spoken_confirmation"])
        self.assertIn("candor", res["spoken_confirmation"].lower())

    def test_prompt_hydration_and_tts_prosody(self) -> None:
        """Verifies build_dynamic_voice_prompt and compute_tts_prosody reflect SQLite state."""
        self.store.update_persona_settings(
            empathy_pct=92,
            humor_pct=38,
            candor_pct=82,
            verbosity_pct=35,
            active_preset="CARING_COMPANION",
        )
        settings = self.store.get_persona_settings()
        t = PersonaTelemetry(
            empathy_pct=settings["empathy_pct"],
            humor_pct=settings["humor_pct"],
            candor_pct=settings["candor_pct"],
            verbosity_pct=settings["verbosity_pct"],
            voice_id=settings["voice_id"],
            active_preset=settings["active_preset"],
        )

        prompt = build_dynamic_voice_prompt(t, user_mood_hint="debugging frustration")
        self.assertIn("92%", prompt)
        self.assertIn("38%", prompt)
        self.assertIn("82%", prompt)
        self.assertIn("35%", prompt)
        self.assertIn("debugging frustration", prompt)

        prosody = compute_tts_prosody(t)
        # speed = round(1.12 - (92 / 100) * 0.14, 2) = round(1.12 - 0.1288, 2) = 0.99
        self.assertAlmostEqual(prosody["kokoro_speed"], 0.99, places=2)
        self.assertIn("edge_rate", prosody)
        self.assertIn("edge_pitch", prosody)
        self.assertGreater(prosody["warmth_prosody"], 1.0)

    def test_persistence_across_fresh_store_connection_reload(self) -> None:
        """Verifies settings survive closing and reopening SQLite connection on disk."""
        self.store.update_persona_settings(
            empathy_pct=87,
            humor_pct=52,
            candor_pct=91,
            verbosity_pct=60,
            voice_id="en-IN-NeerjaNeural",
            active_preset="CUSTOM_CALIBRATION",
        )

        # Fresh SovereignMemoryStore instance pointing to the exact same file
        reloaded_store = SovereignMemoryStore(db_path=self.db_path)
        reloaded = reloaded_store.get_persona_settings()

        self.assertEqual(reloaded["empathy_pct"], 87)
        self.assertEqual(reloaded["humor_pct"], 52)
        self.assertEqual(reloaded["candor_pct"], 91)
        self.assertEqual(reloaded["verbosity_pct"], 60)
        self.assertEqual(reloaded["voice_id"], "en-IN-NeerjaNeural")
        self.assertEqual(reloaded["active_preset"], "CUSTOM_CALIBRATION")

    def test_sanitize_for_tts_strips_markdown_cleanly(self) -> None:
        """Verifies TTS sanitizer strips code, symbols, links, and markdown formatting."""
        raw = """
        # System Header
        Hello **Niranjan**, check this `variable_name`:
        ```python
        def broken():
            return None
        ```
        - Item 1 with *emphasis*
        - Item 2 with [Documentation](https://nexus.local/docs)
        > Caution: high latency
        """
        cleaned = sanitize_for_tts(raw)
        self.assertNotIn("#", cleaned)
        self.assertNotIn("**", cleaned)
        self.assertNotIn("`", cleaned)
        self.assertNotIn("```", cleaned)
        self.assertNotIn("https://", cleaned)
        self.assertNotIn(">", cleaned)
        self.assertIn("Hello Niranjan", cleaned)
        self.assertIn("variable_name", cleaned)
        self.assertIn("Documentation", cleaned)

    def test_voice_pipeline_mood_and_interception(self) -> None:
        """Verifies VoicePipeline integrates telemetry, mood detection, and reflex interception."""
        vp = VoicePipeline()
        vp.store = self.store
        vp.reflex_router = self.router

        # Intercepts spoken command directly before calling LLM
        reply = vp.generate_ai_response("Nexus, set empathy to 88 percent")
        self.assertIn("88 percent", reply)
        self.assertEqual(self.store.get_persona_settings()["empathy_pct"], 88)

        # Mood detection
        frustrated_mood = vp.detect_user_mood("I am stuck on this error traceback and it failed again")
        self.assertIn("frustrated", frustrated_mood)

        celebrating_mood = vp.detect_user_mood("Awesome, all unit tests passed and it finally works!")
        self.assertIn("triumphant", celebrating_mood)


if __name__ == "__main__":
    unittest.main()
