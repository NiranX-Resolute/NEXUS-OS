"""
Nexus OS v5.0 - Multi-Agent Ecosystem
=============================================================================
Autonomous Persona Agents and Orchestration Framework:
- DeveloperAgent: AST-validated code editing, symbol mapping, test execution.
- ScoutAgent: Deep codebase reconnaissance, dependency audit, research.
- MultiAgentOrchestrator: Multi-agent task decomposition, routing, and telemetry.
- BriefingCron: Automated morning status digest generation for Telegram/Discord.
- VoiceAgentCoordinator: Full-duplex speech coordinator (Silero VAD, Whisper, TTS).
=============================================================================
"""

from .dev_agent import DeveloperAgent
from .scout_agent import ScoutAgent
from .orchestrator import MultiAgentOrchestrator, AgentPersona, AgentTask
from .briefing_cron import BriefingCron
from .voice_agent import VoiceAgentCoordinator

__all__ = [
    "DeveloperAgent",
    "ScoutAgent",
    "MultiAgentOrchestrator",
    "AgentPersona",
    "AgentTask",
    "BriefingCron",
    "VoiceAgentCoordinator",
]
