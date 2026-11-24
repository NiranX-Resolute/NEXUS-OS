"""Nexus OS v5.0 - Omnichannel Edge Mesh Package."""

from .omnichannel_bridge import OmnichannelBridge, get_tailscale_ip
from .bot_bridge import BridgeConfig, DiscordDispatcher, TelegramBotBridge, TelegramBotDispatcher
from .jmap_client import JMAPClient, JmapClient, InboundAgentEmail, InboundEmail

__all__ = [
    "OmnichannelBridge",
    "get_tailscale_ip",
    "BridgeConfig",
    "DiscordDispatcher",
    "TelegramBotBridge",
    "TelegramBotDispatcher",
    "JMAPClient",
    "JmapClient",
    "InboundAgentEmail",
    "InboundEmail",
]
