#!/usr/bin/env bash
# =============================================================================
# Nexus Autonomous Agent - POSIX / Cross-Platform Uninstall Wrapper
# =============================================================================
set -e

echo "======================================================================"
echo " NEXUS AUTONOMOUS AGENT - UNINSTALLATION & DATA SOVEREIGNTY"
echo "======================================================================"

# Determine project root directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." >/dev/null 2>&1 && pwd )"

# Run pre-uninstall data sovereignty hook
if command -v python3 &>/dev/null; then
    echo "Running data preservation export hook..."
    python3 "$PROJECT_ROOT/scripts/uninstall_hook.py"
elif command -v python &>/dev/null; then
    echo "Running data preservation export hook..."
    python "$PROJECT_ROOT/scripts/uninstall_hook.py"
else
    echo "Warning: Python runtime not detected. Skipping automated data export."
fi

# Confirm removal of local ~/.nexus-agent directory
read -p "Do you want to permanently remove local agent directory (~/.nexus-agent)? [y/N]: " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -rf "$HOME/.nexus-agent"
    echo "Local agent state and database removed."
fi

# Remove application binaries if installed system-wide
if [ -d "/usr/local/bin/nexus" ]; then
    rm -f "/usr/local/bin/nexus"
fi

echo "Nexus Autonomous Agent uninstallation complete."
