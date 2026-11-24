"""
Nexus OS v5.0 - MCP Tooling & AI Agent Ecosystem Verification Test Suite
=============================================================================
Tests all newly created MCP tools and agent persona modules:
1. Obscura Stealth Browser MCP Server & CDP helpers.
2. ToolSynthesizer AST validation and dynamic tool compilation.
3. NexusMCPBus filesystem guardrails, git tools, and synthesizer integration.
4. DeveloperAgent AST-validated edits and bounded symbol map generation.
5. MultiAgentOrchestrator goal decomposition and persona routing.
6. ScoutAgent codebase survey and dependency auditing.
7. BriefingCron digest compilation and archive creation.
8. VoiceAgentCoordinator audio frame analysis and barge-in interruption.
=============================================================================
"""

import os
import sys
from pathlib import Path

# Ensure core and repo root are in python path
CORE_DIR = Path(__file__).parent.parent.resolve()
REPO_ROOT = CORE_DIR.parent.resolve()
if str(CORE_DIR) not in sys.path:
    sys.path.insert(0, str(CORE_DIR))
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from core.mcp.obscura_mcp_server import (
    resolve_obscura_binary,
    is_cdp_port_open,
    ensure_obscura_running,
    ObscuraStealthBrowser,
    MAX_LLM_TEXT_LENGTH
)
from core.mcp.tool_synthesizer import ToolSynthesizer
from core.mcp.mcp_bus import NexusMCPBus, fs_read_file, fs_write_file, _is_path_safe, git_status
from core.agents.dev_agent import DeveloperAgent
from core.agents.orchestrator import MultiAgentOrchestrator, AgentPersona, TaskStatus
from core.agents.scout_agent import ScoutAgent
from core.agents.briefing_cron import BriefingCron
from core.agents.voice_agent import VoiceAgentCoordinator, VoiceState, FRAME_BYTES


# =============================================================================
# 1. Obscura Stealth Browser Tests
# =============================================================================
def test_obscura_constants_and_helpers():
    assert MAX_LLM_TEXT_LENGTH == 10000
    # Port checking should not throw unhandled exception
    port_open = is_cdp_port_open("127.0.0.1", 9222, timeout=0.2)
    assert isinstance(port_open, bool)

    browser = ObscuraStealthBrowser()
    assert browser.cdp_url == "http://127.0.0.1:9222"


# =============================================================================
# 2. Tool Synthesizer Tests
# =============================================================================
def test_tool_synthesizer_ast_validation_and_registration(tmp_path):
    synth = ToolSynthesizer(tools_dir=str(tmp_path))

    # Test 1: Invalid syntax must fail AST validation
    invalid_code = "def broken_func(:\n    pass"
    success_invalid = synth.synthesize_and_register("test_broken", invalid_code)
    assert success_invalid is False

    # Test 2: Valid code must compile, persist, and execute
    valid_code = '''
def execute(x: int, y: int) -> int:
    """Adds two integers."""
    return x + y
'''
    success_valid = synth.synthesize_and_register("math_adder", valid_code)
    assert success_valid is True

    # Test 3: List tools
    tools = synth.list_tools()
    tool_names = [t["name"] for t in tools]
    assert "math_adder" in tool_names

    # Test 4: Execution
    res = synth.execute_tool("math_adder", x=10, y=32)
    assert res == 42

    # Test 5: Unregister
    synth.unregister_tool("math_adder")
    tools_after = synth.list_tools()
    assert "math_adder" not in [t["name"] for t in tools_after]


# =============================================================================
# 3. Nexus MCP Bus Tests
# =============================================================================
def test_mcp_bus_filesystem_and_guardrails(tmp_path):
    bus = NexusMCPBus()

    # Guardrails: Forbidden directories
    assert _is_path_safe(r"C:\Windows\System32\cmd.exe") is False
    assert _is_path_safe("/etc/passwd") is False
    assert _is_path_safe(str(tmp_path / "safe.txt")) is True

    # Write and read within safe boundary
    test_file = str(tmp_path / "test_bus.txt")
    write_res = fs_write_file(test_file, "Hello Nexus MCP Bus")
    assert "Success" in write_res

    read_res = fs_read_file(test_file)
    assert read_res == "Hello Nexus MCP Bus"

    # Git status
    status = git_status()
    assert isinstance(status, str)


# =============================================================================
# 4. Developer Agent Tests
# =============================================================================
def test_developer_agent_ast_validated_edit_and_symbol_map(tmp_path):
    dev = DeveloperAgent(repo_path=str(tmp_path))

    # Test 1: Invalid code throws ValueError
    caught = False
    try:
        dev.apply_ast_validated_edit("broken.py", "def bad_syntax( pass")
    except ValueError as excinfo:
        caught = True
        assert "AST Syntax Validation Error" in str(excinfo)
    assert caught, "DeveloperAgent failed to raise ValueError on invalid AST syntax"

    # Test 2: Valid code is saved
    sample_code = '''"""Sample Module"""
class DataProcessor:
    def process(self, val: int) -> int:
        return val * 2

def standalone_helper(msg: str) -> str:
    return msg.upper()
'''
    success = dev.apply_ast_validated_edit("processor.py", sample_code)
    assert success is True
    assert (tmp_path / "processor.py").exists()

    # Test 3: Symbol map generation
    symbol_map = dev.generate_symbol_map()
    assert "class DataProcessor" in symbol_map
    assert "def process(self, val)" in symbol_map
    assert "def standalone_helper(msg)" in symbol_map


# =============================================================================
# 5. Multi-Agent Orchestrator Tests
# =============================================================================
def test_multi_agent_orchestrator(tmp_path):
    orchestrator = MultiAgentOrchestrator(repo_path=str(tmp_path))

    # Test decomposition
    tasks = orchestrator.decompose_goal("Implement new telemetry dashboard and deploy to cloudflare")
    assert len(tasks) >= 3
    personas = [t.assigned_persona for t in tasks]
    assert AgentPersona.SCOUT in personas
    assert AgentPersona.DEV in personas
    assert AgentPersona.SYS in personas
    assert AgentPersona.OPS in personas

    # Test team status
    status = orchestrator.get_team_status()
    assert status["orchestrator"] == "Active"
    assert "DEV" in status["personas"]
    assert "SCOUT" in status["personas"]
    assert "SYS" in status["personas"]
    assert "OPS" in status["personas"]


# =============================================================================
# 6. Scout Agent Tests
# =============================================================================
def test_scout_agent(tmp_path):
    (tmp_path / "main.py").write_text("class DeveloperAgent:\n    pass\n", encoding="utf-8")
    (tmp_path / "pyproject.toml").write_text('[project]\nname = "test"\ndependencies = ["fastmcp>=0.1.0"]\n', encoding="utf-8")
    (tmp_path / "package.json").write_text('{"dependencies": {"react": "^18.0.0"}}', encoding="utf-8")

    scout = ScoutAgent(repo_path=str(tmp_path))

    # Quick scan
    scan = scout.quick_scan()
    assert scan["total_files"] >= 3
    assert ".py" in scan["top_extensions"]

    # Search
    results = scout.search_codebase("DeveloperAgent", max_results=5)
    assert len(results) > 0
    assert results[0]["file"] == "main.py"

    # Recon report
    report = scout.generate_recon_report()
    assert report["agent"] == "SCOUT-01"
    assert report["status"] == "OPERATIONAL"


# =============================================================================
# 7. Briefing Cron Tests
# =============================================================================
def test_briefing_cron(tmp_path):
    (tmp_path / "app.py").write_text("print('test')", encoding="utf-8")
    cron = BriefingCron(repo_path=str(tmp_path))

    digest = cron.compile_full_digest()
    assert "core" in digest
    assert "dev" in digest
    assert "sys" in digest
    assert "scout" in digest
    assert "ops" in digest

    md = cron.format_markdown(digest)
    assert "NEXUS OS v5.0 - DAILY MORNING BRIEFING" in md
    assert "DEV-01" in md
    assert "SYS-01" in md

    # Run one briefing cycle and verify local file creation
    cycle_res = cron.run_briefing_cycle()
    assert cycle_res["success"] is True
    assert Path(cycle_res["archive_path"]).exists()


# =============================================================================
# 8. Voice Agent Coordinator Tests
# =============================================================================
def test_voice_agent_coordinator():
    coord = VoiceAgentCoordinator()

    # RMS of silence
    silence_frame = b"\x00" * FRAME_BYTES
    rms_silence = coord.calculate_frame_rms(silence_frame)
    assert rms_silence == 0.0

    # State transitions
    assert coord.state == VoiceState.IDLE

    # Barge-in interruption
    coord._is_speaking_tts = True
    coord.interrupt_speech(reason="test_barge_in")
    assert coord.state == VoiceState.INTERRUPTED
    assert coord._is_speaking_tts is False
