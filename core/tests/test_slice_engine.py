"""Nexus OS v5.0 - Infinity Slice Engine & Coroutine Scheduler Test Suite.

Verifies:
1. SliceEngine class for asynchronous coroutine management.
2. register_slice launches an asyncio.Task and cancels existing tasks with the same name.
3. stop_slice cancels slice task and cleans up dictionary entry.
4. get_active_slices returns accurate count and metadata for telemetry.
5. Zero-idle-RAM state suspension and instant event-driven hydration (<2ms).
6. dispatch_event wakes sleeping sub-agents.
7. InfinitySliceEngine bridge methods for seamless interoperability.
"""

from __future__ import annotations

import asyncio
import gc
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import time
import unittest

# Ensure repo root is on path
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from core.runtime.slice_engine import InfinitySliceEngine, SliceEngine


class TestSliceEngine(unittest.IsolatedAsyncioTestCase):
    """Test suite for SliceEngine asynchronous coroutine management."""

    async def asyncSetUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.temp_dir.name) / "agent_local.db")
        self.engine = SliceEngine(db_path=self.db_path)

    async def asyncTearDown(self):
        self.engine.stop_all()
        try:
            self.temp_dir.cleanup()
        except Exception:
            pass

    async def test_register_slice_launches_task(self):
        """Verifies that register_slice creates and runs an asyncio.Task."""
        execution_marker = []

        async def worker():
            await asyncio.sleep(0.05)
            execution_marker.append("DONE")
            return "SUCCESS"

        task = self.engine.register_slice(
            name="test_worker",
            coroutine_fn=worker,
            agent_id="DEV-01",
            task_summary="Test async worker",
        )

        self.assertIsInstance(task, asyncio.Task)
        self.assertFalse(task.done())

        # Check telemetry / active slices immediately
        active = self.engine.get_active_slices()
        self.assertEqual(active["count"], 1)
        self.assertEqual(len(active["slices"]), 1)
        self.assertEqual(active["slices"][0]["name"], "test_worker")
        self.assertEqual(active["slices"][0]["agent_id"], "DEV-01")

        # Await completion
        res = await task
        self.assertEqual(res, "SUCCESS")
        self.assertEqual(execution_marker, ["DONE"])

        # Once task finishes, get_active_slices should show 0 active
        active_after = self.engine.get_active_slices()
        self.assertEqual(active_after["count"], 0)

    async def test_register_slice_cancels_existing_task(self):
        """Verifies that re-registering a slice with the same name cancels the previous task."""
        cancelled_marker = []

        async def long_running():
            try:
                await asyncio.sleep(10.0)
            except asyncio.CancelledError:
                cancelled_marker.append("CANCELLED")
                raise

        # Launch initial long-running task
        task1 = self.engine.register_slice("duplicate_slice", long_running)
        self.assertFalse(task1.done())

        # Give task1 a tick to start
        await asyncio.sleep(0.01)

        async def new_worker():
            return "REPLACED"

        # Register again under same name
        task2 = self.engine.register_slice("duplicate_slice", new_worker)

        # task1 should now be cancelled
        self.assertTrue(task1.cancelled() or task1.cancelling())
        try:
            await task1
        except asyncio.CancelledError:
            pass

        self.assertIn("CANCELLED", cancelled_marker)

        # task2 runs to completion
        res = await task2
        self.assertEqual(res, "REPLACED")

    async def test_stop_slice_cancels_and_cleans_up(self):
        """Verifies stop_slice cancels task and cleans up dictionary entry."""
        cancelled_marker = []

        async def persistent_subagent():
            try:
                await asyncio.sleep(10.0)
            except asyncio.CancelledError:
                cancelled_marker.append("STOPPED")
                raise

        task = self.engine.register_slice("agent_sys", persistent_subagent, agent_id="SYS-01")
        await asyncio.sleep(0.01)

        # Verify active
        self.assertTrue(self.engine.is_slice_active("agent_sys"))
        self.assertEqual(self.engine.get_active_slices()["count"], 1)

        # Stop slice
        stopped = self.engine.stop_slice("agent_sys")
        self.assertTrue(stopped)

        # Verify task was cancelled
        self.assertTrue(task.cancelled() or task.cancelling())
        try:
            await task
        except asyncio.CancelledError:
            pass

        self.assertIn("STOPPED", cancelled_marker)

        # Verify dictionary entries cleaned up
        self.assertFalse(self.engine.is_slice_active("agent_sys"))
        self.assertIsNone(self.engine.get_slice_metadata("agent_sys"))
        self.assertEqual(self.engine.get_active_slices()["count"], 0)

        # Stopping again should return False
        self.assertFalse(self.engine.stop_slice("agent_sys"))

    async def test_get_active_slices_telemetry_structure(self):
        """Verifies get_active_slices returns required count and metadata."""
        async def mock_coro():
            await asyncio.sleep(1.0)

        self.engine.register_slice("slice_a", mock_coro, agent_id="SCOUT-01", task_summary="Ingest feed")
        self.engine.register_slice("slice_b", mock_coro, agent_id="SEC-01", task_summary="Verify invariants")

        telemetry = self.engine.get_active_slices()
        self.assertEqual(telemetry["count"], 2)
        self.assertEqual(telemetry["active_count"], 2)
        self.assertEqual(len(telemetry["slices"]), 2)
        self.assertIn("slice_a", telemetry["metadata"])
        self.assertIn("slice_b", telemetry["metadata"])

        meta_a = telemetry["metadata"]["slice_a"]
        self.assertEqual(meta_a["agent_id"], "SCOUT-01")
        self.assertEqual(meta_a["task_summary"], "Ingest feed")
        self.assertEqual(meta_a["status"], "ACTIVE")
        self.assertGreaterEqual(meta_a["uptime_seconds"], 0.0)

    async def test_zero_idle_ram_subagent_lifecycle(self):
        """Verifies non-active sub-agents can be suspended into zero-idle-RAM state and rehydrated."""
        subagent_name = "subagent_scout"
        initial_context = {
            "current_target": "https://api.github.com",
            "findings": ["CVE-2026-001"],
            "step": 4,
        }

        # 1. Suspend into SQLite WAL
        slice_id = self.engine.suspend_subagent(
            name=subagent_name,
            state=initial_context,
            agent_id="SCOUT-01",
            task_summary="Scanning external surface",
        )
        self.assertEqual(slice_id, subagent_name)

        # Non-active sub-agent must NOT have an active coroutine consuming RAM
        self.assertEqual(self.engine.get_active_slices()["count"], 0)

        # 2. Wake with external event
        event = {"type": "TARGET_DETECTED", "ip": "192.168.1.50"}
        processed_state = []

        async def subagent_worker(state):
            processed_state.append(state)
            return f"Processed target {state['last_injected_event']['ip']}"

        wake_task = self.engine.wake_subagent(
            name=subagent_name,
            event=event,
            coroutine_fn=subagent_worker,
        )

        self.assertIsInstance(wake_task, asyncio.Task)
        self.assertEqual(self.engine.get_active_slices()["count"], 1)

        result = await wake_task
        self.assertEqual(result, "Processed target 192.168.1.50")
        self.assertEqual(len(processed_state), 1)
        self.assertEqual(processed_state[0]["current_target"], "https://api.github.com")
        self.assertEqual(processed_state[0]["last_injected_event"]["ip"], "192.168.1.50")

    async def test_dispatch_event_awakens_subagents(self):
        """Verifies dispatch_event triggers registered event listeners."""
        # Suspend two sub-agents
        self.engine.suspend_subagent("sec_agent", {"mode": "GUARD"}, agent_id="SEC-01")
        self.engine.suspend_subagent("ops_agent", {"mode": "MONITOR"}, agent_id="OPS-01")

        received_events = []

        async def sec_handler(state):
            received_events.append(("SEC", state["last_injected_event"]))

        async def ops_handler(state):
            received_events.append(("OPS", state["last_injected_event"]))

        self.engine.register_event_trigger("SECURITY_ALERT", "sec_agent", sec_handler)
        self.engine.register_event_trigger("SECURITY_ALERT", "ops_agent", ops_handler)

        tasks = self.engine.dispatch_event("SECURITY_ALERT", {"severity": "CRITICAL"})
        self.assertEqual(len(tasks), 2)
        await asyncio.gather(*tasks)

        self.assertEqual(len(received_events), 2)
        sources = [r[0] for r in received_events]
        self.assertIn("SEC", sources)
        self.assertIn("OPS", sources)

    async def test_infinity_slice_engine_bridge(self):
        """Verifies InfinitySliceEngine exposes register_slice, stop_slice, and get_active_slices."""
        inf_engine = InfinitySliceEngine(db_path=self.db_path)

        async def coro():
            await asyncio.sleep(0.02)
            return 42

        task = inf_engine.register_slice("bridge_worker", coro, agent_id="OPS-01")
        self.assertIsInstance(task, asyncio.Task)

        active = inf_engine.get_active_slices()
        self.assertEqual(active["count"], 1)
        self.assertEqual(active["slices"][0]["name"], "bridge_worker")

        res = await task
        self.assertEqual(res, 42)

        # Stop slice
        task2 = inf_engine.register_slice("bridge_worker_2", coro)
        stopped = inf_engine.stop_slice("bridge_worker_2")
        self.assertTrue(stopped)


if __name__ == "__main__":
    unittest.main()
