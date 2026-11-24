"""
Unit Tests for Voice Pipeline & Disturbance-Resilient Conversational Engine
=============================================================================
Verifies:
1. Disturbance & Noise Tolerance: Agent does NOT stop speaking when ambient noise occurs.
2. Keyword-Only Interruption: Agent halts speech ONLY when user commands ("wait", "listen me", "stop").
3. Proper AI Responding: Context-aware conversational responses stripped of awkward markdown.
4. Non-Interruption Speech Filtering: Casual talk or background speech does not halt playback.
=============================================================================
"""

import unittest
from bridge.voice_pipeline import VoicePipeline


class TestVoicePipelineDisturbanceAndBargeIn(unittest.TestCase):

    def test_legacy_vad_barge_in(self):
        pipe = VoicePipeline(energy_threshold=0.1, require_keyword_interruption=False)
        interrupted = False

        def on_interrupt(reason=None):
            nonlocal interrupted
            interrupted = True

        pipe.on_barge_in = on_interrupt
        pipe.is_speaking = True

        pipe.handle_incoming_audio_frame(0.25)
        self.assertTrue(interrupted)
        self.assertFalse(pipe.is_speaking)

    def test_disturbance_tolerance(self):
        pipe = VoicePipeline(energy_threshold=0.1, require_keyword_interruption=True)
        interrupted = False

        def on_interrupt(reason=None):
            nonlocal interrupted
            interrupted = True

        pipe.on_barge_in = on_interrupt
        pipe.is_speaking = True

        # Ambient noise spikes do NOT halt speech
        res1 = pipe.handle_incoming_audio_frame(0.40)
        self.assertFalse(res1)
        self.assertFalse(interrupted)
        self.assertTrue(pipe.is_speaking)

        # Disturbance flagged frames do NOT halt speech
        res2 = pipe.handle_disturbance(0.70, "loud_ambient_noise")
        self.assertFalse(res2)
        self.assertFalse(interrupted)
        self.assertTrue(pipe.is_speaking)
        self.assertGreater(pipe.disturbances_absorbed, 0)

        # Casual talk does NOT halt speech
        res3 = pipe.handle_user_utterance("i am listening keep speaking")
        self.assertFalse(res3)
        self.assertFalse(interrupted)
        self.assertTrue(pipe.is_speaking)

    def test_keyword_interruption_stop_wait_listen(self):
        keywords = ["wait", "listen me", "listen to me", "stop", "hold on", "pause", "be quiet"]
        for kw in keywords:
            pipe = VoicePipeline(energy_threshold=0.1, require_keyword_interruption=True)
            interrupted = False

            def on_interrupt(reason=None):
                nonlocal interrupted
                interrupted = True

            pipe.on_barge_in = on_interrupt
            pipe.is_speaking = True

            res = pipe.handle_user_utterance(f"agent please {kw}")
            self.assertTrue(res)
            self.assertTrue(interrupted)
            self.assertFalse(pipe.is_speaking)

    def test_proper_ai_responding(self):
        pipe = VoicePipeline()
        rep1 = pipe.generate_ai_response("who are you")
        self.assertIn("Nexdune", rep1)

        rep2 = pipe.generate_ai_response("what is the system status")
        self.assertTrue(len(rep2) > 10)
        self.assertNotIn("**", rep2)
        self.assertNotIn("```", rep2)


if __name__ == "__main__":
    unittest.main()
