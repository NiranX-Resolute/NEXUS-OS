"""
Direct verification runner for Nexus MCP and Agent modules.
"""

import sys
from pathlib import Path

# Setup paths
CORE_DIR = Path(__file__).parent.parent.resolve()
REPO_ROOT = CORE_DIR.parent.resolve()
sys.path.insert(0, str(CORE_DIR))
sys.path.insert(0, str(REPO_ROOT))

from core.tests.test_mcp_and_agents import (
    test_obscura_constants_and_helpers,
    test_tool_synthesizer_ast_validation_and_registration,
    test_mcp_bus_filesystem_and_guardrails,
    test_developer_agent_ast_validated_edit_and_symbol_map,
    test_multi_agent_orchestrator,
    test_scout_agent,
    test_briefing_cron,
    test_voice_agent_coordinator
)

def run():
    import tempfile
    passed = 0
    tests = [
        ("Obscura Browser Constants", lambda: test_obscura_constants_and_helpers()),
        ("Tool Synthesizer AST & Dynamic Load", lambda: test_tool_synthesizer_ast_validation_and_registration(Path(tempfile.mkdtemp()))),
        ("Nexus MCP Bus Filesystem & Git", lambda: test_mcp_bus_filesystem_and_guardrails(Path(tempfile.mkdtemp()))),
        ("Developer Agent AST Edits & Symbol Map", lambda: test_developer_agent_ast_validated_edit_and_symbol_map(Path(tempfile.mkdtemp()))),
        ("Multi-Agent Orchestrator", lambda: test_multi_agent_orchestrator(Path(tempfile.mkdtemp()))),
        ("Scout Agent Reconnaissance", lambda: test_scout_agent(Path(tempfile.mkdtemp()))),
        ("Briefing Cron Engine", lambda: test_briefing_cron(Path(tempfile.mkdtemp()))),
        ("Voice Agent Coordinator", lambda: test_voice_agent_coordinator())
    ]

    print("=================================================================")
    print("  NEXUS OS v5.0 - MCP & AGENT SUITE VERIFICATION RUNNER")
    print("=================================================================")
    for name, fn in tests:
        print(f">> Starting: {name}", flush=True)
        try:
            fn()
            print(f"[PASS] {name}", flush=True)
            passed += 1
        except Exception as e:
            print(f"[FAIL] {name}: {e}", flush=True)
            import traceback
            traceback.print_exc()

    print("=================================================================")
    print(f"RESULTS: {passed}/{len(tests)} passed.")
    if passed == len(tests):
        print("ALL VERIFICATIONS PASSED SUCCESSFULLY.")
        sys.exit(0)
    else:
        print("SOME VERIFICATIONS FAILED.")
        sys.exit(1)

if __name__ == "__main__":
    run()
