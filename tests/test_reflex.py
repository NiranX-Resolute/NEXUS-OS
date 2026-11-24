"""Nexus OS v5.0 - Reflex Intent Router Test Suite.

Verifies deterministic sub-100ms execution for local OS reflexes:
- evaluate_and_execute("mute audio")
- evaluate_and_execute("inject timestamp")
- evaluate_and_execute("lock workstation")
"""

from __future__ import annotations

import time
import pytest
from core.reflex.router import ReflexRouter


@pytest.fixture
def reflex_router() -> ReflexRouter:
    """Fixture providing a ReflexRouter instance in dry_run mode."""
    return ReflexRouter(dry_run=True)


def test_reflex_mute_audio_latency_under_100ms(reflex_router: ReflexRouter) -> None:
    """Verifies that 'mute audio' executes in < 100ms with success output."""
    t0 = time.perf_counter()
    res = reflex_router.evaluate_and_execute("mute audio")
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    assert res["success"] is True
    assert res["action"] == "MUTE_AUDIO"
    assert "toggled" in res["output"] or "audio" in res["output"].lower()
    assert res["latency_ms"] < 100.0
    assert elapsed_ms < 100.0


def test_reflex_inject_timestamp_latency_under_100ms(reflex_router: ReflexRouter) -> None:
    """Verifies that 'inject timestamp' generates an ISO timestamp in < 100ms."""
    t0 = time.perf_counter()
    res = reflex_router.evaluate_and_execute("inject timestamp")
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    assert res["success"] is True
    assert res["action"] == "INJECT_TIMESTAMP"
    assert "timestamp" in res
    assert res["timestamp"].endswith("Z")
    assert res["latency_ms"] < 100.0
    assert elapsed_ms < 100.0


def test_reflex_lock_workstation_latency_under_100ms(reflex_router: ReflexRouter) -> None:
    """Verifies that 'lock workstation' dispatches in < 100ms."""
    t0 = time.perf_counter()
    res = reflex_router.evaluate_and_execute("lock workstation")
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    assert res["success"] is True
    assert res["action"] == "LOCK_WORKSTATION"
    assert res["latency_ms"] < 100.0
    assert elapsed_ms < 100.0


def test_reflex_unhandled_prompt_fallback(reflex_router: ReflexRouter) -> None:
    """Verifies that non-reflex complex prompts gracefully return failure for LLM fallback."""
    res = reflex_router.evaluate_and_execute("refactor the neural network architecture in PyTorch")
    assert res["success"] is False
    assert "fallback" in res["error"].lower()
    assert res["latency_ms"] < 100.0


if __name__ == "__main__":
    router = ReflexRouter(dry_run=True)
    test_reflex_mute_audio_latency_under_100ms(router)
    test_reflex_inject_timestamp_latency_under_100ms(router)
    test_reflex_lock_workstation_latency_under_100ms(router)
    test_reflex_unhandled_prompt_fallback(router)
    print("ALL REFLEX TESTS PASSED IN <100ms")

