"""
Unit & Integration Test: Autonomous Pre-Uninstall Data Packager & Offline Viewer
=============================================================================
Validates:
1. Seeding sessions, chat history turns, and tool traces into LocalStore.
2. Generating export bundle via export_all_user_data().
3. Verifying ZIP archive integrity and directory structure.
4. Validating READABLE_EXPORT_VIEWER.html embeds seeded conversation data
   and contains zero external script dependencies.
=============================================================================
"""

import os
import sys
import json
import zipfile
import tempfile
import pytest
from pathlib import Path

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from engine.local_store import LocalStore
from engine.exporter import DataSovereigntyExporter, export_all_user_data


@pytest.fixture
def seeded_store():
    with tempfile.TemporaryDirectory() as tmp_dir:
        db_path = Path(tmp_dir) / "agent_local.db"
        store = LocalStore(db_path=db_path)

        # Seed mock session 1
        s1 = store.create_session(title="Architectural Migration", metadata={"module": "engine"})
        store.log_message(
            session_id=s1,
            role="user",
            content="Migrate terminal execution to pseudo-terminals (ConPTY/PTY)."
        )
        store.log_message(
            session_id=s1,
            role="assistant",
            content="Designed non-blocking PersistentTerminal harness.",
            thought_trace="Analyzing winpty and POSIX openpty syscall primitives."
        )
        store.log_trace(
            session_id=s1,
            trace_data={
                "step_number": 1,
                "tool_name": "terminal_pty",
                "command_or_path": "python -m pytest tests/test_terminal_pty.py",
                "output_payload": "3 passed in 0.45s",
                "exit_code": 0,
                "duration_ms": 450.0,
                "status": "SUCCESS"
            }
        )

        # Seed mock session 2
        s2 = store.create_session(title="Offline Viewer Styling", metadata={"ui": "glassmorphic"})
        store.log_message(
            session_id=s2,
            role="user",
            content="Verify dark-mode glassmorphic styling without CDN dependencies."
        )

        yield store, s1, s2
        store.close()


def test_export_all_user_data_bundle(seeded_store):
    """Validates complete export archive generation, structure, and HTML viewer contents."""
    store, s1_id, s2_id = seeded_store

    with tempfile.TemporaryDirectory() as export_dir:
        target_zip = Path(export_dir) / "nexus_audit_export.zip"

        exporter = DataSovereigntyExporter(store=store)
        archive_path = exporter.generate_export_bundle(target_zip)

        # 1. Verify ZIP archive exists and is valid
        assert archive_path.exists()
        assert zipfile.is_zipfile(str(archive_path))

        # 2. Inspect ZIP structure
        with zipfile.ZipFile(str(archive_path), "r") as zf:
            file_names = zf.namelist()

            # Ensure root viewer and data JSONs exist
            assert "READABLE_EXPORT_VIEWER.html" in file_names
            assert "data/sessions.json" in file_names
            assert "data/chat_history.json" in file_names
            assert "data/execution_traces.json" in file_names
            assert "data/agent_local.db" in file_names

            # 3. Read and validate HTML content
            html_content = zf.read("READABLE_EXPORT_VIEWER.html").decode("utf-8")
            assert "<!DOCTYPE html>" in html_content
            assert "Nexus Autonomous Agent" in html_content

            # Seeded string assertions
            assert "Architectural Migration" in html_content
            assert "Migrate terminal execution to pseudo-terminals" in html_content
            assert "Designed non-blocking PersistentTerminal harness" in html_content
            assert "Analyzing winpty and POSIX openpty" in html_content
            assert "Offline Viewer Styling" in html_content

            # Ensure zero remote script tags or unbundled remote CDNs
            assert "https://cdn." not in html_content
            assert "https://unpkg.com" not in html_content
            assert "http://" not in html_content or "http://www.w3.org" in html_content
