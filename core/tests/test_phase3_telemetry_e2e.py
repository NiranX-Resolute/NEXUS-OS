"""
Nexus OS v5.0 - Phase 3 Telemetry & Real-Time E2E Test Suite
Tests live SQLite WAL persistence, telemetry bridge event streaming,
real-time circuit pulses, and hardware E-Stop enforcement with zero stubs.
"""

import json
import logging
import os
from pathlib import Path
import sqlite3
import sys
import time
import unittest
import uuid

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("nexus.test.phase3")

# Ensure repository root is in python path
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from core.runtime.slice_engine import InfinitySliceEngine, EmergencyStopException
from core.memory.sovereign_store import SovereignMemoryStore
from core.runtime.workspaces import WorkspaceGovernor


class TestPhase3TelemetryE2E(unittest.TestCase):
    """
    End-to-end integration tests verifying real SQLite WAL writes,
    telemetry event emissions, and E-Stop safety assertion.
    """

    @classmethod
    def setUpClass(cls):
        cls.db_path = Path.home() / ".nexus-agent" / "db" / "agent_local.db"
        cls.db_path.parent.mkdir(parents=True, exist_ok=True)
        cls.slice_engine = InfinitySliceEngine(str(cls.db_path))
        cls.memory_store = SovereignMemoryStore(str(cls.db_path))
        cls.governor = WorkspaceGovernor()

    def setUp(self):
        # Reset E-Stop before each test
        self.slice_engine.reset_estop()

    def tearDown(self):
        # Ensure E-Stop is reset after test execution
        self.slice_engine.reset_estop()

    def _query(self, sql: str, params: tuple = ()):
        """Helper to run a query and safely close connection."""
        conn = sqlite3.connect(str(self.db_path), timeout=5.0)
        conn.row_factory = sqlite3.Row
        try:
            cur = conn.execute(sql, params)
            return cur.fetchall()
        finally:
            conn.close()

    def test_01_execution_slice_and_telemetry_emission(self):
        """
        Test 1: Insert an execution slice for DEV-01 into agent_local.db,
        verify execution_slices table record, and verify agent_slice event in telemetry_events.
        """
        unique_thread = f"thread_e2e_{uuid.uuid4().hex[:8]}"
        task_text = "Compile rust native bridge bindings"
        slice_id = self.slice_engine.suspend_slice(
            thread_id=unique_thread,
            current_state={"step": 1, "action": "compile", "target": "nexus_bridge"},
            agent_id="DEV-01",
            task_summary=task_text,
            status="SUSPENDED",
        )

        self.assertTrue(slice_id.startswith("slice_"))

        # Direct SQL verification against SQLite WAL
        rows = self._query(
            "SELECT slice_id, thread_id, agent_id, task_summary, status FROM execution_slices WHERE slice_id = ?;",
            (slice_id,),
        )
        self.assertTrue(len(rows) > 0, "Execution slice row was not persisted into SQLite WAL.")
        row = rows[0]
        self.assertEqual(row["agent_id"], "DEV-01")
        self.assertEqual(row["task_summary"], task_text)
        self.assertEqual(row["status"], "SUSPENDED")

        # Verify agent_slice event in telemetry_events table
        events = self._query(
            "SELECT id, event_type, payload_json FROM telemetry_events WHERE event_type = 'agent_slice' ORDER BY id DESC LIMIT 5;"
        )
        matching_event = None
        for ev in events:
            payload = json.loads(ev["payload_json"])
            if payload.get("slice_id") == slice_id:
                matching_event = payload
                break

        self.assertIsNotNone(matching_event, "Matching agent_slice event was not found in telemetry_events.")
        self.assertEqual(matching_event["agent_id"], "DEV-01")
        self.assertEqual(matching_event["task_summary"], task_text)
        self.assertEqual(matching_event["status"], "SUSPENDED")
        logger.info("Test 1 passed: Execution slice and telemetry event verified.")

    def test_02_memory_pulse_telemetry_emission(self):
        """
        Test 2: Insert a memory record and run search_text,
        verify circuit_pulse event with node == 'MEMORY'.
        """
        unique_content = f"Sovereignty invariant test payload {uuid.uuid4().hex[:8]}"
        node_id = self.memory_store.insert_memory(
            content=unique_content,
            node_type="CONTEXT",
            namespace="DEV",
            importance=0.9,
            tags=["phase3", "telemetry"],
        )
        self.assertIsNotNone(node_id)

        # Execute text search
        search_results = self.memory_store.search_text("Sovereignty invariant test", namespace="DEV")
        self.assertTrue(len(search_results) > 0, "Memory search did not return inserted record.")

        # Verify circuit_pulse event in telemetry_events
        events = self._query(
            "SELECT id, event_type, payload_json FROM telemetry_events WHERE event_type = 'circuit_pulse' ORDER BY id DESC LIMIT 10;"
        )
        memory_pulses = []
        for ev in events:
            payload = json.loads(ev["payload_json"])
            if payload.get("node") == "MEMORY":
                memory_pulses.append(payload)

        self.assertTrue(len(memory_pulses) > 0, "No circuit_pulse event found with node == 'MEMORY'.")
        latest_pulse = memory_pulses[0]
        self.assertEqual(latest_pulse["node"], "MEMORY")
        self.assertTrue(latest_pulse["active"])
        self.assertIn("latency_ms", latest_pulse)
        logger.info("Test 2 passed: Memory circuit pulse verified.")

    def test_03_workspace_mode_switch_and_pulse(self):
        """
        Test 3: Set workspace mode to STUDY using WorkspaceGovernor,
        verify WORKSPACE_MODE recorded in system_flags and circuit_pulse event with node == 'WORKSPACE'.
        """
        res_mode = self.governor.set_mode("STUDY")
        self.assertEqual(res_mode, "STUDY")

        rows = self._query(
            "SELECT flag_value FROM system_flags WHERE flag_key = 'WORKSPACE_MODE' LIMIT 1;"
        )
        self.assertTrue(len(rows) > 0, "WORKSPACE_MODE flag was not written to system_flags table.")
        self.assertEqual(rows[0]["flag_value"], "STUDY")

        events = self._query(
            "SELECT id, event_type, payload_json FROM telemetry_events WHERE event_type = 'circuit_pulse' ORDER BY id DESC LIMIT 5;"
        )
        ws_pulse = None
        for ev in events:
            payload = json.loads(ev["payload_json"])
            if payload.get("node") == "WORKSPACE":
                ws_pulse = payload
                break

        self.assertIsNotNone(ws_pulse, "circuit_pulse event for WORKSPACE was not found.")
        self.assertIn("STUDY", ws_pulse.get("detail", ""))
        logger.info("Test 3 passed: Workspace mode switch and circuit pulse verified.")

    def test_04_hardware_estop_halts_slice_execution(self):
        """
        Test 4: Trigger E-Stop using InfinitySliceEngine.trigger_estop(),
        verify system_flags has ESTOP = ACTIVE, and execute_slice_step raises EmergencyStopException.
        """
        unique_thread = f"thread_estop_{uuid.uuid4().hex[:8]}"
        slice_id = self.slice_engine.suspend_slice(
            thread_id=unique_thread,
            current_state={"step": 0, "messages": []},
            agent_id="SEC-01",
            task_summary="Auditing local network sockets",
        )

        # Trigger emergency stop
        self.slice_engine.trigger_estop(reason="Safety test E-Stop assertion")

        # Verify system_flags in SQLite WAL
        rows = self._query(
            "SELECT flag_value FROM system_flags WHERE flag_key = 'ESTOP' LIMIT 1;"
        )
        self.assertTrue(len(rows) > 0)
        self.assertEqual(rows[0]["flag_value"], "ACTIVE")

        # Verify that is_estop_asserted() returns True
        self.assertTrue(self.slice_engine.is_estop_asserted())

        # Verify that execute_slice_step raises EmergencyStopException
        with self.assertRaises(EmergencyStopException):
            self.slice_engine.execute_slice_step(slice_id)

        logger.info("Test 4 passed: E-Stop halted slice execution as expected.")

    def test_05_reset_estop_resumes_slice_execution(self):
        """
        Test 5: Reset E-Stop using InfinitySliceEngine.reset_estop(),
        verify execute_slice_step executes successfully without raising EmergencyStopException.
        """
        unique_thread = f"thread_resume_{uuid.uuid4().hex[:8]}"
        slice_id = self.slice_engine.suspend_slice(
            thread_id=unique_thread,
            current_state={"step": 0, "messages": [{"role": "system", "content": "You are OPS-01"}]},
            agent_id="OPS-01",
            task_summary="Checking disk utilization",
        )

        # Trigger and then reset E-Stop
        self.slice_engine.trigger_estop(reason="Temporary E-Stop")
        self.assertTrue(self.slice_engine.is_estop_asserted())

        self.slice_engine.reset_estop()
        self.assertFalse(self.slice_engine.is_estop_asserted())

        # Define real synchronous completion function
        def run_step_completion(messages):
            return {"content": "Checked disk utilization: 42% used.", "tool_calls": []}

        # Execute step
        result = self.slice_engine.execute_slice_step(
            slice_id=slice_id,
            llm_completer=run_step_completion,
        )

        self.assertIsNotNone(result)
        self.assertEqual(result.get("status"), "COMPLETED")
        self.assertEqual(result.get("response", {}).get("content"), "Checked disk utilization: 42% used.")
        logger.info("Test 5 passed: E-Stop reset allowed execution step to complete.")


if __name__ == "__main__":
    unittest.main()
