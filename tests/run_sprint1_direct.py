"""Direct execution runner for Sprint 1 verification."""
import sys
import os
import time
from pathlib import Path

# Ensure workspace root is in sys.path
root_dir = str(Path(__file__).parent.parent.resolve())
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

print("[STEP] Importing modules...", flush=True)
from core.runtime.ipc_server import NexusIPCServer
print("[STEP] Imported NexusIPCServer", flush=True)
from core.memory.sovereign_store import SovereignMemoryStore
print("[STEP] Imported SovereignMemoryStore", flush=True)
from apps.notch_hud.drag_shelf import IngestedFile
print("[STEP] Imported IngestedFile", flush=True)
from apps.notch_hud.notch_window import NexusNotchWindow
print("[STEP] Imported NexusNotchWindow", flush=True)

import tests.test_sprint1_wiring_real as t

print("[STEP] Running all 5 tests directly...", flush=True)
# Create server fixture manually
gen = t.make_live_sprint1_server()
server_ctx = next(gen)
print(f"[STEP] Server started on {server_ctx['base_url']}", flush=True)

try:
    print("[RUN] test_01_tasks_and_telemetry_live_sqlite...", flush=True)
    t.test_01_tasks_and_telemetry_live_sqlite(server_ctx)
    print("[PASS] test_01 passed!", flush=True)

    print("[RUN] test_02_filesystem_and_git_status...", flush=True)
    t.test_02_filesystem_and_git_status(server_ctx)
    print("[PASS] test_02 passed!", flush=True)

    print("[RUN] test_03_real_exec_verify...", flush=True)
    t.test_03_real_exec_verify(server_ctx)
    print("[PASS] test_03 passed!", flush=True)

    print("[RUN] test_04_scholar_search_synthesis_and_persistence...", flush=True)
    t.test_04_scholar_search_synthesis_and_persistence(server_ctx)
    print("[PASS] test_04 passed!", flush=True)

    print("[RUN] test_05_notch_hud_mcp_share_to_sovereign_store...", flush=True)
    t.test_05_notch_hud_mcp_share_to_sovereign_store(server_ctx)
    print("[PASS] test_05 passed!", flush=True)

    print("\nALL 5 ZERO-MOCK SPRINT 1 TESTS PASSED PERFECTLY!\n", flush=True)
finally:
    try:
        next(gen)
    except StopIteration:
        pass
    print("[STEP] Teardown complete.", flush=True)
