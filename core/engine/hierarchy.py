"""
Nexus Dual-Agent Hierarchy (HostAgent + AppAgent with AIP)
=============================================================================
Inspired by Microsoft UFO.
Separates execution into:
- HostAgent: OS-level supervisor managing apps, focus, tasks, and dispatch.
- AppAgent: Application-specialized worker grounded in software UI/APIs.
- AIP (Agent Interaction Protocol): Structured inter-agent communication contract.
=============================================================================
"""

import time
from dataclasses import dataclass, field, asdict
from typing import Dict, Any, List, Optional


@dataclass
class AIPMessage:
    """Agent Interaction Protocol Message Schema."""
    sender: str
    recipient: str
    intent: str
    target_app: str
    payload: Dict[str, Any] = field(default_factory=dict)
    status: str = "PENDING"  # PENDING, IN_PROGRESS, SUCCESS, FAILED
    timestamp: float = field(default_factory=time.time)


class AppAgent:
    """Specialized worker agent that operates inside a designated application."""

    def __init__(self, app_name: str, app_type: str = "generic"):
        self.app_name = app_name
        self.app_type = app_type  # 'browser', 'editor', 'office', 'terminal', 'generic'
        self.active_context: Dict[str, Any] = {}
        self.history: List[AIPMessage] = []

    def execute_subtask(self, aip_msg: AIPMessage) -> AIPMessage:
        """Executes a subtask scoped specifically to this application."""
        self.history.append(aip_msg)
        intent = aip_msg.intent
        payload = aip_msg.payload

        # Mock / Real application dispatch
        result = {
            "app": self.app_name,
            "intent": intent,
            "actions_taken": [f"Focused {self.app_name}", f"Executed {intent} with args {list(payload.keys())}"],
            "completed": True
        }

        response = AIPMessage(
            sender=f"AppAgent:{self.app_name}",
            recipient=aip_msg.sender,
            intent=f"REPLY:{intent}",
            target_app=self.app_name,
            payload=result,
            status="SUCCESS"
        )
        return response


class HostAgent:
    """
    Operating System supervisor.
    Monitors OS windows, manages process lifecycles, and dispatches to AppAgents.
    """

    def __init__(self):
        self.registered_apps: Dict[str, AppAgent] = {}
        self.active_app: Optional[str] = None
        self.aip_log: List[AIPMessage] = []

    def register_app_agent(self, app_agent: AppAgent):
        self.registered_apps[app_agent.app_name.lower()] = app_agent

    def get_or_create_app_agent(self, app_name: str, app_type: str = "generic") -> AppAgent:
        key = app_name.lower()
        if key not in self.registered_apps:
            self.registered_apps[key] = AppAgent(app_name=app_name, app_type=app_type)
        return self.registered_apps[key]

    def dispatch_aip(self, target_app: str, intent: str, payload: Dict[str, Any]) -> AIPMessage:
        """Dispatches an AIP request from HostAgent to target AppAgent."""
        agent = self.get_or_create_app_agent(target_app)
        self.active_app = target_app

        msg = AIPMessage(
            sender="HostAgent",
            recipient=f"AppAgent:{target_app}",
            intent=intent,
            target_app=target_app,
            payload=payload
        )
        self.aip_log.append(msg)

        # Delegate execution
        response = agent.execute_subtask(msg)
        self.aip_log.append(response)
        return response

    def execute_cross_app_workflow(self, workflow_steps: List[Dict[str, Any]]) -> List[AIPMessage]:
        """
        Executes a multi-application pipeline (e.g. Browser -> Terminal -> Editor).
        """
        results = []
        for step in workflow_steps:
            target_app = step.get("app", "desktop")
            intent = step.get("intent", "inspect")
            payload = step.get("payload", {})
            resp = self.dispatch_aip(target_app=target_app, intent=intent, payload=payload)
            results.append(resp)
            if resp.status != "SUCCESS":
                break
        return results
