"""
Pytest configuration for Nexus Desktop.
Ensures core engine, bridge, and daemons are automatically in sys.path.
"""
import os
import sys
from pathlib import Path

# Skip dynamic pip installs during test runs
os.environ["NEXUS_SKIP_DEP_INSTALL"] = "1"

# Add core directory (contains engine, bridge, desktop_agent, etc.)
CORE_DIR = Path(__file__).resolve().parent.parent
if str(CORE_DIR) not in sys.path:
    sys.path.insert(0, str(CORE_DIR))

# Add workspace root directory
ROOT_DIR = CORE_DIR.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
