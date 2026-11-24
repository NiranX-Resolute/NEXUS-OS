"""
Nexus OS v5.0 - Dynamic MCP Plugin Loader Verification Test Suite
=============================================================================
Tests:
1. REGISTERED_TOOLS dictionary existence and alias synchronization.
2. @nexus_tool decorator definition with dependencies and metadata.
3. Dependency checking and dynamic installation subprocess invocations.
4. load_all_plugins(directory) scanning and dynamic registration.
5. wrap_tool_with_governance air-gap and ScopeGuard integration.
=============================================================================
"""

import importlib
from pathlib import Path
import sys
import unittest
from unittest.mock import MagicMock, patch

# Ensure core and repo root are in python path
CORE_DIR = Path(__file__).parent.parent.resolve()
REPO_ROOT = CORE_DIR.parent.resolve()
if str(CORE_DIR) not in sys.path:
    sys.path.insert(0, str(CORE_DIR))
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from core.mcp.plugin_loader import (
    REGISTERED_TOOLS,
    REGISTERED_NEXUS_TOOLS,
    nexus_tool,
    wrap_tool_with_governance,
    load_all_plugins,
    discover_plugins,
    discover_and_register_plugins,
    get_registered_tools,
    is_package_installed,
    parse_package_name,
    ensure_dependencies,
    install_dependency,
)


class TestPluginLoader(unittest.TestCase):

    def setUp(self):
        REGISTERED_TOOLS.clear()

    def test_registered_tools_dict_and_alias(self):
        """Verify REGISTERED_TOOLS is a dict and REGISTERED_NEXUS_TOOLS aliases it."""
        self.assertIsInstance(REGISTERED_TOOLS, dict)
        self.assertIs(REGISTERED_TOOLS, REGISTERED_NEXUS_TOOLS)
        REGISTERED_TOOLS["dummy_test"] = {"name": "dummy_test"}
        self.assertIn("dummy_test", REGISTERED_NEXUS_TOOLS)
        del REGISTERED_TOOLS["dummy_test"]

    def test_parse_package_name(self):
        """Verify requirement specifier parsing."""
        self.assertEqual(parse_package_name("requests"), "requests")
        self.assertEqual(parse_package_name("requests>=2.28.0"), "requests")
        self.assertEqual(parse_package_name("pillow==9.5.0"), "pillow")
        self.assertEqual(parse_package_name("google-api-python-client~=2.0"), "google-api-python-client")

    def test_is_package_installed(self):
        """Verify check for installed packages."""
        # Built-in or standard installed modules
        self.assertTrue(is_package_installed("sys"))
        self.assertTrue(is_package_installed("unittest"))
        # Non-existent package
        self.assertFalse(is_package_installed("non_existent_nexus_pkg_xyz_12345"))

    @patch("core.mcp.plugin_loader.subprocess.run")
    def test_install_dependency_invokes_installer(self, mock_subproc):
        """Verify install_dependency runs uv or pip install."""
        mock_subproc.return_value = MagicMock(returncode=0, stdout="Successfully installed", stderr="")

        res = install_dependency("sample-nexus-pkg>=1.0.0")
        self.assertTrue(res)
        mock_subproc.assert_called()
        cmd_called = mock_subproc.call_args[0][0]
        # Must contain either uv or pip install
        cmd_str = " ".join(cmd_called)
        self.assertTrue("pip" in cmd_str and "install" in cmd_str)

    def test_nexus_tool_decorator(self):
        """Verify @nexus_tool decorates function and attaches metadata."""
        @nexus_tool(
            name="test_tool_sample",
            description="A sample test tool",
            dependencies=["unittest"],
            agent="DEV-01",
            requires_approval=False,
        )
        def sample_tool_func(x: int) -> int:
            return x * 2

        self.assertTrue(hasattr(sample_tool_func, "_nexus_tool_meta"))
        meta = getattr(sample_tool_func, "_nexus_tool_meta")
        self.assertEqual(meta["name"], "test_tool_sample")
        self.assertEqual(meta["description"], "A sample test tool")
        self.assertEqual(meta["dependencies"], ["unittest"])
        self.assertEqual(meta["agent"], "DEV-01")
        self.assertFalse(meta["requires_approval"])
        self.assertEqual(sample_tool_func(5), 10)

    def test_wrap_tool_with_governance(self):
        """Verify governance wrapper preserves execution and signature."""
        meta = {
            "name": "governed_test_tool",
            "description": "Governed tool",
            "dependencies": [],
            "agent": "OPS-01",
            "requires_approval": False,
        }

        def raw_fn(greeting: str) -> str:
            return f"Hello, {greeting}!"

        wrapped = wrap_tool_with_governance(raw_fn, meta)
        result = wrapped("Nexus")
        self.assertEqual(result, "Hello, Nexus!")
        self.assertEqual(wrapped.__name__, "raw_fn")
        self.assertEqual(wrapped.__doc__, "Governed tool")

    def test_load_all_plugins_default_directory(self):
        """Verify load_all_plugins scans core/mcp/plugins/ and populates REGISTERED_TOOLS."""
        tools = load_all_plugins()
        self.assertIsInstance(tools, dict)
        self.assertGreater(len(tools), 0)

        # Check known tools from existing plugins in core/mcp/plugins/
        self.assertIn("android_status", tools)
        self.assertIn("calendar_manage", tools)

        # Check metadata
        android_tool = tools["android_status"]
        self.assertEqual(android_tool["name"], "android_status")
        self.assertEqual(android_tool["agent"], "SYS-01")
        self.assertTrue(callable(android_tool["secured_callable"]))

        # Verify get_registered_tools returns list
        tool_list = get_registered_tools()
        self.assertIsInstance(tool_list, list)
        self.assertGreater(len(tool_list), 0)
        tool_names = [t["name"] for t in tool_list]
        self.assertIn("android_status", tool_names)
        self.assertIn("calendar_manage", tool_names)

    def test_load_all_plugins_custom_directory(self, tmp_path=None):
        """Verify load_all_plugins works with a custom directory path."""
        import tempfile
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_plugin = Path(tmp_dir) / "custom_test_plugin.py"
            tmp_plugin.write_text(
                '''
from core.mcp.plugin_loader import nexus_tool

@nexus_tool(
    name="custom_dynamic_tool",
    description="Tool loaded from custom directory",
    dependencies=[],
    agent="SCOUT-01",
)
def custom_dynamic_action() -> str:
    return "custom_ok"
''',
                encoding="utf-8",
            )

            loaded = load_all_plugins(directory=tmp_dir)
            self.assertIn("custom_dynamic_tool", loaded)
            self.assertEqual(loaded["custom_dynamic_tool"]["agent"], "SCOUT-01")


if __name__ == "__main__":
    unittest.main()
