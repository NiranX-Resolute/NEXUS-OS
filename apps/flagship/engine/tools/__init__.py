"""
Nexus Autonomous Engine Tools
"""
from .terminal_pty import (
    PersistentTerminal,
    TerminalResult,
    TerminalHarness,
    TerminalExecutionResult,
    execute_pty,
)
from .filesystem_patch import (
    FilePatcher,
    PatchConflictError,
    FilesystemPatcher,
    apply_patch,
    write_file,
)
from .browser_verifier import BrowserVerifier, verify_browser_surface
from .desktop_ufo import DesktopUFOInspector, inspect_ufo_tree, click_ufo_element, type_ufo_element

__all__ = [
    "PersistentTerminal",
    "TerminalResult",
    "TerminalHarness",
    "TerminalExecutionResult",
    "execute_pty",
    "FilePatcher",
    "PatchConflictError",
    "FilesystemPatcher",
    "apply_patch",
    "write_file",
    "BrowserVerifier",
    "verify_browser_surface",
    "DesktopUFOInspector",
    "inspect_ufo_tree",
    "click_ufo_element",
    "type_ufo_element",
]
