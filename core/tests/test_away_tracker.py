"""
Unit tests for Nexus OS v5.0 AwayTracker and Acoustic Transient Detection.
Verifies double-clap recognition, temporal window gating [110ms, 420ms],
RMS calculation, refractory suppression, and Win32 session state monitoring.
"""

from __future__ import annotations

import time
import unittest

from core.runtime.away_tracker import (
    AwayTracker,
    DEFAULT_MAX_CLAP_INTERVAL_MS,
    DEFAULT_MIN_CLAP_INTERVAL_MS,
    DEFAULT_SPIKE_THRESHOLD,
    check_workstation_locked,
    create_pcm_frame,
    wake_or_focus_workstation,
)


class TestAwayTracker(unittest.TestCase):
    """Test suite for AwayTracker and acoustic transient recognition."""

    def setUp(self) -> None:
        self.tracker = AwayTracker(
            spike_threshold=0.45,
            min_clap_interval_ms=110.0,
            max_clap_interval_ms=420.0,
            cooldown_ms=500.0,
            auto_wake=False,
        )

    def tearDown(self) -> None:
        self.tracker.stop()

    def test_rms_silence_and_empty(self) -> None:
        """Verifies RMS calculation on empty and zero-amplitude audio buffers."""
        self.assertEqual(AwayTracker.calculate_rms(b""), 0.0)
        silence = create_pcm_frame(amplitude=0.0, duration_ms=30.0)
        self.assertEqual(AwayTracker.calculate_rms(silence), 0.0)

    def test_rms_high_amplitude_transient(self) -> None:
        """Verifies RMS calculation on high-amplitude synthetic bursts."""
        high_frame = create_pcm_frame(amplitude=0.9, duration_ms=30.0)
        rms = AwayTracker.calculate_rms(high_frame)
        self.assertGreater(rms, 0.45)
        self.assertLessEqual(rms, 1.0)

    def test_single_clap_does_not_trigger(self) -> None:
        """A single acoustic spike must not trigger a double-clap event."""
        clap = create_pcm_frame(amplitude=0.8, duration_ms=20.0)
        detected = self.tracker.process_audio_chunk(clap, timestamp=100.0)
        self.assertFalse(detected)
        self.assertEqual(self.tracker.get_status()["double_clap_count"], 0)

    def test_valid_double_clap_detection(self) -> None:
        """Two acoustic spikes within [110ms, 420ms] must trigger detection."""
        callback_called = False

        def _on_double():
            nonlocal callback_called
            callback_called = True

        self.tracker.on_double_clap = _on_double

        t0 = 1000.0
        spike1 = create_pcm_frame(amplitude=0.85, duration_ms=20.0)
        silence = create_pcm_frame(amplitude=0.0, duration_ms=20.0)
        spike2 = create_pcm_frame(amplitude=0.90, duration_ms=20.0)

        # First clap at t0
        det1 = self.tracker.process_audio_chunk(spike1, timestamp=t0)
        self.assertFalse(det1)

        # Intermediary silence at t0 + 50ms
        self.tracker.process_audio_chunk(silence, timestamp=t0 + 0.05)

        # Second clap at t0 + 250ms (inside [110ms, 420ms] window)
        det2 = self.tracker.process_audio_chunk(spike2, timestamp=t0 + 0.25)
        self.assertTrue(det2)

        status = self.tracker.get_status()
        self.assertEqual(status["double_clap_count"], 1)
        self.assertFalse(status["is_away"])

        # Allow background callback thread to run
        time.sleep(0.05)
        self.assertTrue(callback_called)

    def test_rejection_when_interval_too_short(self) -> None:
        """Spikes occurring faster than 110ms (echo/reverberation) must be rejected."""
        t0 = 2000.0
        spike1 = create_pcm_frame(amplitude=0.85, duration_ms=20.0)
        spike2 = create_pcm_frame(amplitude=0.85, duration_ms=20.0)

        self.tracker.process_audio_chunk(spike1, timestamp=t0)
        # Second spike at 60ms (< 110ms)
        det = self.tracker.process_audio_chunk(spike2, timestamp=t0 + 0.060)
        self.assertFalse(det)
        self.assertEqual(self.tracker.get_status()["double_clap_count"], 0)

    def test_rejection_when_interval_too_long(self) -> None:
        """Spikes separated by more than 420ms must reset the candidate window."""
        t0 = 3000.0
        spike1 = create_pcm_frame(amplitude=0.85, duration_ms=20.0)
        spike2 = create_pcm_frame(amplitude=0.85, duration_ms=20.0)
        spike3 = create_pcm_frame(amplitude=0.85, duration_ms=20.0)

        # First clap at t0
        self.tracker.process_audio_chunk(spike1, timestamp=t0)

        # Second clap at t0 + 500ms (> 420ms: window expired, becomes new candidate)
        det1 = self.tracker.process_audio_chunk(spike2, timestamp=t0 + 0.500)
        self.assertFalse(det1)
        self.assertEqual(self.tracker.get_status()["double_clap_count"], 0)

        # Third clap at t0 + 720ms (220ms after spike2: valid double clap!)
        det2 = self.tracker.process_audio_chunk(spike3, timestamp=t0 + 0.720)
        self.assertTrue(det2)
        self.assertEqual(self.tracker.get_status()["double_clap_count"], 1)

    def test_continuous_noise_rejection(self) -> None:
        """Sustained loud audio frames without onset gap must not trigger double-clap."""
        t0 = 4000.0
        loud_frame = create_pcm_frame(amplitude=0.8, duration_ms=30.0)

        # Feed 10 consecutive frames (300ms of sustained continuous loud noise)
        for i in range(10):
            timestamp = t0 + (i * 0.030)
            det = self.tracker.process_audio_chunk(loud_frame, timestamp=timestamp)
            self.assertFalse(det, f"Falsely triggered on sustained frame {i}")

        self.assertEqual(self.tracker.get_status()["double_clap_count"], 0)

    def test_post_detection_cooldown(self) -> None:
        """Additional spikes occurring during the 500ms cooldown must be ignored."""
        t0 = 5000.0
        spike = create_pcm_frame(amplitude=0.85, duration_ms=20.0)
        silence = create_pcm_frame(amplitude=0.0, duration_ms=20.0)

        # Valid double-clap
        self.tracker.process_audio_chunk(spike, timestamp=t0)
        self.tracker.process_audio_chunk(silence, timestamp=t0 + 0.05)
        self.tracker.process_audio_chunk(spike, timestamp=t0 + 0.20)
        self.assertEqual(self.tracker.get_status()["double_clap_count"], 1)

        # Trailing spike during cooldown (t0 + 0.35 is inside 500ms cooldown)
        det = self.tracker.process_audio_chunk(spike, timestamp=t0 + 0.35)
        self.assertFalse(det)
        self.assertEqual(self.tracker.get_status()["double_clap_count"], 1)

    def test_simulate_lock_and_unlock(self) -> None:
        """Verifies session lock/unlock simulation and callback execution."""
        locked_called = False
        unlocked_called = False

        def _on_lock():
            nonlocal locked_called
            locked_called = True

        def _on_unlock():
            nonlocal unlocked_called
            unlocked_called = True

        self.tracker.on_lock = _on_lock
        self.tracker.on_unlock = _on_unlock

        # Simulate lock
        self.tracker.simulate_lock()
        self.assertTrue(self.tracker.is_locked)
        self.assertTrue(self.tracker.is_away)
        self.assertTrue(locked_called)

        # Simulate unlock
        self.tracker.simulate_unlock()
        self.assertFalse(self.tracker.is_locked)
        self.assertFalse(self.tracker.is_away)
        self.assertTrue(unlocked_called)

    def test_wake_or_focus_workstation_function(self) -> None:
        """Verifies that wake_or_focus_workstation executes without crashing."""
        res = wake_or_focus_workstation()
        self.assertIn("success", res)
        self.assertTrue(res["success"])

    def test_check_workstation_locked_function(self) -> None:
        """Verifies check_workstation_locked returns a boolean."""
        locked = check_workstation_locked()
        self.assertIsInstance(locked, bool)

    def test_context_manager_and_status(self) -> None:
        """Verifies context manager lifecycle and diagnostic telemetry dict."""
        with AwayTracker(auto_wake=False) as tracker:
            self.assertTrue(tracker.is_monitoring)
            status = tracker.get_status()
            self.assertIn("is_locked", status)
            self.assertIn("is_away", status)
            self.assertIn("double_clap_count", status)
            self.assertIn("spike_threshold", status)
            self.assertEqual(status["spike_threshold"], DEFAULT_SPIKE_THRESHOLD)
            self.assertEqual(status["min_clap_interval_ms"], DEFAULT_MIN_CLAP_INTERVAL_MS)
            self.assertEqual(status["max_clap_interval_ms"], DEFAULT_MAX_CLAP_INTERVAL_MS)

        self.assertFalse(tracker.is_monitoring)


if __name__ == "__main__":
    unittest.main()
