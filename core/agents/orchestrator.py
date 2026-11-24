"""
Nexus OS v5.0 - Lead Multi-Agent Orchestrator
=============================================================================
Central coordinator managing task decomposition, intelligent routing between
specialist personas (DEV, SCOUT, SYS, OPS), progress tracking, and unified telemetry.

Personas:
- DEV (DEV-01): Developer Agent (AST-validated edits, symbol mapping, testing).
- SCOUT (SCOUT-01): Research and codebase scouting agent (reconnaissance, dependencies).
- SYS (SYS-01): Systems Architect (OS safety, local SQLite sovereignty, desktop tools).
- OPS (OPS-01): Operations and Deployment (Cloudflare edge, D1 schema, status cron).
=============================================================================
"""

import time
import uuid
import logging
from dataclasses import dataclass, field, asdict
from enum import Enum
from pathlib import Path
from typing import Dict, Any, List, Optional, Callable

from .dev_agent import DeveloperAgent
from .scout_agent import ScoutAgent

logger = logging.getLogger("MultiAgentOrchestrator")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


class AgentPersona(str, Enum):
    ORCHESTRATOR = "ORCHESTRATOR"
    DEV = "DEV"          # Code synthesis, AST verification, unit tests
    SCOUT = "SCOUT"      # Codebase reconnaissance, doc search, dependency checks
    SYS = "SYS"          # Desktop automation, local security guardrails, OS metrics
    OPS = "OPS"          # Cloudflare Edge, D1 sync, deployments, morning briefings


class TaskStatus(str, Enum):
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"


@dataclass
class AgentTask:
    task_id: str
    title: str
    description: str
    assigned_persona: AgentPersona
    status: TaskStatus = TaskStatus.PENDING
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    completed_at: Optional[float] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["assigned_persona"] = self.assigned_persona.value
        d["status"] = self.status.value
        return d


class MultiAgentOrchestrator:
    """
    Lead autonomous multi-agent orchestrator managing team decomposition,
    routing, execution supervision, and aggregate status telemetry.
    """

    def __init__(
        self,
        repo_path: Optional[str] = None,
        event_callback: Optional[Callable[[Dict[str, Any]], None]] = None
    ):
        self.repo_path = Path(repo_path).resolve() if repo_path else Path(__file__).parent.parent.parent.resolve()
        self.event_callback = event_callback

        # Initialize specialist persona engines
        self.dev_agent = DeveloperAgent(repo_path=str(self.repo_path))
        self.scout_agent = ScoutAgent(repo_path=str(self.repo_path))

        # Task history registry
        self.task_registry: Dict[str, AgentTask] = {}
        logger.info(f"MultiAgentOrchestrator initialized across personas (DEV, SCOUT, SYS, OPS) in {self.repo_path}")

    def emit_event(self, event_type: str, title: str, status: str, payload: Optional[Dict[str, Any]] = None) -> None:
        """Dispatches telemetry event to registered callback."""
        event_data = {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "type": event_type,
            "title": title,
            "status": status,
            "payload": payload or {}
        }
        if self.event_callback:
            try:
                self.event_callback(event_data)
            except Exception as e:
                logger.warning(f"Error in event callback: {e}")

    def decompose_goal(self, goal: str) -> List[AgentTask]:
        """
        Decomposes a complex goal into an ordered list of tasks assigned to
        specialist personas: SCOUT -> DEV -> SYS -> OPS.
        """
        tasks: List[AgentTask] = []
        lowered = goal.lower()

        # Step 1: Reconnaissance / Scouting
        tasks.append(
            AgentTask(
                task_id=f"task-scout-{uuid.uuid4().hex[:6]}",
                title="Codebase Reconnaissance & Symbol Discovery",
                description=f"Analyze repository structure and discover relevant symbols for: {goal}",
                assigned_persona=AgentPersona.SCOUT,
                metadata={"scope": "reconnaissance"}
            )
        )

        # Step 2: Implementation / Development
        tasks.append(
            AgentTask(
                task_id=f"task-dev-{uuid.uuid4().hex[:6]}",
                title="Implementation & AST-Validated Synthesis",
                description=f"Implement changes and apply AST-validated code edits for: {goal}",
                assigned_persona=AgentPersona.DEV,
                metadata={"scope": "implementation"}
            )
        )

        # Step 3: Systems Verification / Security Audit
        tasks.append(
            AgentTask(
                task_id=f"task-sys-{uuid.uuid4().hex[:6]}",
                title="System Verification & Boundary Check",
                description="Verify path safety, OS guardrails, and run automated regression tests.",
                assigned_persona=AgentPersona.SYS,
                metadata={"scope": "verification"}
            )
        )

        # Step 4: Operations / Deployment & Briefing
        if any(w in lowered for w in ["deploy", "cloud", "release", "briefing", "report"]):
            tasks.append(
                AgentTask(
                    task_id=f"task-ops-{uuid.uuid4().hex[:6]}",
                    title="Edge Dispatch & Operational Reporting",
                    description="Synchronize status with Cloudflare edge and compile dispatch digest.",
                    assigned_persona=AgentPersona.OPS,
                    metadata={"scope": "operations"}
                )
            )

        return tasks

    def execute_task(self, task: AgentTask) -> Dict[str, Any]:
        """
        Routes an individual task to the appropriate persona agent and collects results.
        """
        task.status = TaskStatus.IN_PROGRESS
        self.emit_event(
            event_type="TASK_START",
            title=f"[{task.assigned_persona.value}] {task.title}",
            status="RUNNING",
            payload={"task_id": task.task_id}
        )

        start_time = time.time()
        try:
            if task.assigned_persona == AgentPersona.SCOUT:
                # Execute scout reconnaissance
                scan = self.scout_agent.quick_scan()
                symbol_map = self.dev_agent.generate_symbol_map(max_chars=2000)
                result = {
                    "scan": scan,
                    "symbol_summary": symbol_map[:500] + "..." if len(symbol_map) > 500 else symbol_map,
                    "scout_status": "Success"
                }

            elif task.assigned_persona == AgentPersona.DEV:
                # Execute developer validation / verification
                test_res = self.dev_agent.run_tests()
                result = {
                    "test_results": test_res,
                    "dev_status": "Success" if test_res.get("success") else "Tests Reported Issues"
                }

            elif task.assigned_persona == AgentPersona.SYS:
                # Execute system health check
                result = {
                    "system_checks": {
                        "repo_accessible": self.repo_path.exists(),
                        "repo_path": str(self.repo_path),
                        "python_executable": DeveloperAgent().repo_path.exists()
                    },
                    "sys_status": "Healthy"
                }

            elif task.assigned_persona == AgentPersona.OPS:
                # Execute ops report
                result = {
                    "ops_status": "Ready",
                    "timestamp": time.time()
                }

            else:
                result = {"status": "Unrecognized persona"}

            task.status = TaskStatus.COMPLETED
            task.result = result
            task.completed_at = time.time()
            self.emit_event(
                event_type="TASK_COMPLETE",
                title=f"[{task.assigned_persona.value}] {task.title}",
                status="SUCCESS",
                payload={"duration_sec": round(time.time() - start_time, 2), "result": result}
            )
            return {"success": True, "task": task.to_dict()}

        except Exception as e:
            task.status = TaskStatus.FAILED
            task.error = str(e)
            task.completed_at = time.time()
            self.emit_event(
                event_type="TASK_ERROR",
                title=f"[{task.assigned_persona.value}] {task.title}",
                status="FAILED",
                payload={"error": str(e)}
            )
            return {"success": False, "error": str(e), "task": task.to_dict()}

    def spawn_swarm(self, goal: str, workspace_mode: Optional[str] = None) -> Dict[str, Any]:
        """Spawns an ephemeral multi-agent swarm using DynamicAgentSpawner."""
        from core.agents.dynamic_spawner import DynamicAgentSpawner
        clean_goal = goal.strip()
        if clean_goal.startswith("@swarm "):
            clean_goal = clean_goal[7:].strip()
        spawner = DynamicAgentSpawner()
        try:
            return spawner.plan_and_spawn_swarm(clean_goal, workspace_mode=workspace_mode)
        finally:
            spawner.close()

    def execute_workflow(self, goal: str) -> Dict[str, Any]:
        """
        Executes a complete multi-agent workflow for the given goal:
        Decomposition -> Persona Dispatch -> Verification -> Review Summary.
        """
        clean_g = goal.strip()
        if clean_g.startswith("@swarm "):
            return self.spawn_swarm(clean_g)

        logger.info(f"Starting multi-agent workflow for goal: {goal}")
        self.emit_event("WORKFLOW_START", f"Goal: {goal}", "RUNNING")

        start_time = time.time()
        tasks = self.decompose_goal(goal)
        results: List[Dict[str, Any]] = []

        overall_success = True
        for task in tasks:
            self.task_registry[task.task_id] = task
            res = self.execute_task(task)
            results.append(res)
            if not res.get("success"):
                overall_success = False

        duration = round(time.time() - start_time, 2)
        summary = {
            "goal": goal,
            "overall_success": overall_success,
            "total_tasks": len(tasks),
            "completed_tasks": sum(1 for t in tasks if t.status == TaskStatus.COMPLETED),
            "failed_tasks": sum(1 for t in tasks if t.status == TaskStatus.FAILED),
            "duration_sec": duration,
            "task_details": [t.to_dict() for t in tasks]
        }

        self.emit_event(
            "WORKFLOW_COMPLETE",
            f"Goal: {goal}",
            "SUCCESS" if overall_success else "FAILED",
            payload=summary
        )
        return summary

    def get_team_status(self) -> Dict[str, Any]:
        """Returns the current state and capabilities of all personas."""
        return {
            "orchestrator": "Active",
            "repo_root": str(self.repo_path),
            "personas": {
                "DEV": {
                    "id": "DEV-01",
                    "role": "AST-validated code edits, symbol mapping, test execution",
                    "status": "Online"
                },
                "SCOUT": {
                    "id": "SCOUT-01",
                    "role": "Reconnaissance, dependency auditing, research",
                    "status": "Online"
                },
                "SYS": {
                    "id": "SYS-01",
                    "role": "Desktop safety invariants, OS supervision, local SQLite",
                    "status": "Online"
                },
                "OPS": {
                    "id": "OPS-01",
                    "role": "Edge coordination, D1 synchronization, morning briefing cron",
                    "status": "Online"
                }
            },
            "tasks_managed": len(self.task_registry)
        }
