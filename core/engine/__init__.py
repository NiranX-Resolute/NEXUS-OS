"""
Nexus Autonomous Agent Engine Package
"""
from .config import (
    NEXUS_HOME,
    DB_DIR,
    WORKTREES_DIR,
    MEMORIES_DIR,
    EXPORTS_DIR,
    DB_PATH,
    ensure_runtime_directories,
    detect_hardware_specs,
    HardwareSpecs,
)
from .local_store import LocalStore, LocalAgentStore, SQLiteConnectionPool
from .workspace import WorktreeManager, WorkspaceManager, WorktreeContext
from .exporter import DataSovereigntyExporter, export_all_user_data
from .orchestrator import AutonomousOrchestrator, AgentStepEvent
from .router import IntentRouter, TaskPlan, PlannedStep, route_user_task
from .user_memory import UserMemoryManager

__all__ = [
    "NEXUS_HOME",
    "DB_DIR",
    "WORKTREES_DIR",
    "MEMORIES_DIR",
    "EXPORTS_DIR",
    "DB_PATH",
    "ensure_runtime_directories",
    "detect_hardware_specs",
    "HardwareSpecs",
    "LocalStore",
    "LocalAgentStore",
    "SQLiteConnectionPool",
    "WorktreeManager",
    "WorkspaceManager",
    "WorktreeContext",
    "DataSovereigntyExporter",
    "export_all_user_data",
    "AutonomousOrchestrator",
    "AgentStepEvent",
    "IntentRouter",
    "TaskPlan",
    "PlannedStep",
    "route_user_task",
    "UserMemoryManager",
]
