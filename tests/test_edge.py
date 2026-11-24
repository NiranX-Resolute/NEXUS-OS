"""Nexus OS v5.0 - Edge Mesh & Bot Bridge Test Suite."""

from __future__ import annotations

import pytest
from core.edge.jmap_client import JMAPClient, JMAPConfig, InboundAgentEmail
from core.edge.bot_bridge import DiscordDispatcher, TelegramBotBridge, BridgeConfig


def test_jmap_client_initialization() -> None:
    cfg = JMAPConfig(
        api_url="https://mock.mxraven.com/jmap/api",
        bearer_token="mock_token_123",
        agent_email="agent@test.domain",
    )
    client = JMAPClient(cfg)
    assert client.config.agent_email == "agent@test.domain"
    assert client.config.bearer_token == "mock_token_123"


def test_inbound_email_dataclass() -> None:
    email = InboundAgentEmail(
        email_id="msg_001",
        thread_id="th_001",
        sender="operator@domain.com",
        recipient="agent@domain.com",
        subject="!execute backup",
        preview="Run full system backup",
        body_text="Run full system backup now.",
        received_at="2026-11-13T10:00:00Z",
        has_command=True,
    )
    d = email.to_dict()
    assert d["email_id"] == "msg_001"
    assert d["has_command"] is True


def test_discord_dispatcher_no_webhook_graceful() -> None:
    dispatcher = DiscordDispatcher(webhook_url=None)
    # Should safely return False without error when no webhook configured
    assert dispatcher.send_message("Hello") is False
    assert dispatcher.send_embed("Title", "Desc") is False


def test_telegram_bridge_no_token_graceful() -> None:
    bridge = TelegramBotBridge(token=None)
    assert bridge.send_message("Test") is False
