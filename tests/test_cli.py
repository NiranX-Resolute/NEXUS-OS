"""Nexus OS v5.0 - Master CLI Test Suite."""

from __future__ import annotations

import pytest
from nexus import build_parser


def test_cli_argument_parsing() -> None:
    parser = build_parser()

    # Test all specified flags
    args = parser.parse_args(["--notch"])
    assert args.notch is True
    assert args.command_center is False

    args = parser.parse_args(["--command-center"])
    assert args.command_center is True

    args = parser.parse_args(["--slice-daemon"])
    assert args.slice_daemon is True

    args = parser.parse_args(["--obscura-mcp"])
    assert args.obscura_mcp is True

    args = parser.parse_args(["--sec-mcp"])
    assert args.sec_mcp is True

    args = parser.parse_args(["--edge-bridge"])
    assert args.edge_bridge is True

    args = parser.parse_args(["--voice-duplex"])
    assert args.voice_duplex is True

    args = parser.parse_args(["--train-wakeword"])
    assert args.train_wakeword is True

    args = parser.parse_args(["--optimize-traces"])
    assert args.optimize_traces is True

    args = parser.parse_args(["--test-all"])
    assert args.test_all is True

    # Test unified and startup flags
    args = parser.parse_args(["--unified"])
    assert args.unified is True

    args = parser.parse_args(["--install-startup"])
    assert args.install_startup is True

    args = parser.parse_args(["--remove-startup"])
    assert args.remove_startup is True
