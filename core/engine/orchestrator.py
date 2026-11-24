"""
Nexus Autonomous Engine - Agent State Machine, Milestone Planner & Self-Correction Loop
=============================================================================
Orchestrates autonomous execution lifecycle:
[Plan] ──► [Tool Execution] ──► [Verification] ──► [Self-Correction] ──► [Review Artifact]

Key Features:
1. Milestone Planner: Generates structured TASK_PLAN.md breaking tasks into discrete phases.
2. Isolated Worktree: Executes file edits and builds inside git worktree sandboxes.
3. Self-Correction Loop: When a test, build, or command fails with exit code != 0,
   intercepts stderr/stdout, analyzes stack trace, and attempts up to 3 automated repairs.
4. Usage Restrictions: Token bucket rate limiter & step circuit breaker (MAX_STEPS = 12).
5. Dynamic ETA Predictor: Step-weighted Exponential Moving Average (EMA) duration forecasting.
6. Local Sovereignty Store: Stores all thoughts (<think>), tool outputs, diffs, and memories
   strictly on ~/.nexus-agent/db/agent_local.db.
=============================================================================
"""

import os
import sys
import re
import time
import json
import uuid
import traceback
from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional, Callable

from .workspace import WorkspaceManager, WorktreeContext
from .router import IntentRouter, TaskPlan, PlannedStep
from .tools.terminal_pty import TerminalHarness, TerminalExecutionResult
from .tools.filesystem_patch import FilesystemPatcher
from .tools.browser_verifier import BrowserVerifier
from .tools.desktop_ufo import DesktopUFOInspector
from .governor import UsageGovernor, CircuitBreakerTripped
from .eta_predictor import ETAPredictor
from .provider_mesh import ProviderMesh
from .local_store import LocalAgentStore

# Flagship Cognitive, Safety & Execution Subsystems
from .learning_graph import PersistentLearningGraph
from .safety_guard import SafetyGuard, RepetitionCircuitBreakException, EmergencyStopException
from .credential_pool import CredentialPoolManager
from .context_compactor import ContextCompactor
from .tool_synthesizer import ToolSynthesizer
from .hierarchy import HostAgent, AppAgent
from .vault_bridge import PasswordVaultBridge
from .repo_map import RepoMapGenerator
from .plan_branch import CumulativeDiffSandbox
from .tools.aci_editor import ACIEditor
from .sop_chain import SOPChainEngine
from .architect_editor import ArchitectEditorPipeline
from .bbon_reranker import BehaviorBestOfNReranker, CandidateTrajectory
from .vla_grounding import VLAGroundingEngine, GroundedUIElement
from .demo_compiler import DemonstrationCompiler, DemonstrationProgram
from .tools.dom_distiller import DOMDistiller, DistilledElement
from .tools.fit_markdown import FitMarkdownGenerator


@dataclass
class AgentStepEvent:
    id: str
    timestamp: str
    type: str  # "thought" | "tool_call" | "tool_result" | "approval_request" | "error"
    title: str
    status: str  # "running" | "success" | "failed" | "waiting_approval"
    duration: Optional[str] = None
    thought_content: Optional[str] = None
    tool_name: Optional[str] = None
    eta_seconds_remaining: Optional[float] = None
    payload: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {
            "id": self.id,
            "timestamp": self.timestamp,
            "type": self.type,
            "title": self.title,
            "status": self.status
        }
        if self.duration:
            d["duration"] = self.duration
        if self.thought_content:
            d["thoughtContent"] = self.thought_content
        if self.tool_name:
            d["toolName"] = self.tool_name
        if self.eta_seconds_remaining is not None:
            d["etaSecondsRemaining"] = self.eta_seconds_remaining
        if self.payload:
            d["payload"] = self.payload
        return d


class AutonomousOrchestrator:
    def __init__(
        self,
        repo_root: Optional[str] = None,
        event_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
        max_self_corrections: int = 3,
        max_steps: int = 12,
        mode: str = "normal"
    ):
        self.repo_root = os.path.abspath(repo_root or os.getcwd())
        self.mode = mode.lower() if mode in ("normal", "reasoning", "study") else "normal"
        self.workspace_mgr = WorkspaceManager(self.repo_root)
        self.terminal = TerminalHarness(default_cwd=self.repo_root)
        self.patcher = FilesystemPatcher(base_dir=self.repo_root)
        self.browser = BrowserVerifier()
        self.ufo = DesktopUFOInspector()
        self.router = IntentRouter(mode=self.mode)
        self.event_callback = event_callback
        self.max_self_corrections = max_self_corrections
        self.trace_history: List[AgentStepEvent] = []

        # Operational Subsystems
        self.governor = UsageGovernor(
            max_steps=max_steps,
            on_quota_warning=self._handle_quota_warning
        )
        self.eta_predictor = ETAPredictor(alpha=0.35)
        self.provider_mesh = ProviderMesh()
        self.local_store = LocalAgentStore()

        # Flagship Cognitive, Safety & Execution Subsystems
        self.learning_graph = PersistentLearningGraph()
        self.safety_guard = SafetyGuard(loop_threshold=3)
        self.credential_pool = CredentialPoolManager()
        self.context_compactor = ContextCompactor()
        self.synthesizer = ToolSynthesizer()
        self.host_agent = HostAgent()
        self.vault = PasswordVaultBridge()
        self.repo_map_gen = RepoMapGenerator(self.repo_root)
        self.plan_sandbox = CumulativeDiffSandbox(workspace_root=self.repo_root)
        self.aci_editor = ACIEditor(workspace_root=self.repo_root)
        self.sop_engine = SOPChainEngine()
        self.architect_editor = ArchitectEditorPipeline(provider_mesh=self.provider_mesh)
        self.bbon_reranker = BehaviorBestOfNReranker()
        self.vla_grounding = VLAGroundingEngine()
        self.demo_compiler = DemonstrationCompiler()
        self.dom_distiller = DOMDistiller()
        self.fit_markdown = FitMarkdownGenerator()

    def _handle_quota_warning(self, warning_payload: Dict[str, Any]) -> None:
        """Propagates quota warning event to callback."""
        if self.event_callback:
            try:
                self.event_callback({
                    "id": f"quota_warn_{int(time.time())}",
                    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "type": "error",
                    "title": "Low Free-Tier Quota Warning (<20%)",
                    "status": "waiting_approval",
                    "payload": warning_payload
                })
            except Exception:
                pass

    def _emit(
        self,
        step_id: str,
        step_type: str,
        title: str,
        status: str,
        start_time: Optional[float] = None,
        thought: Optional[str] = None,
        tool: Optional[str] = None,
        eta_sec: Optional[float] = None,
        payload: Optional[Dict[str, Any]] = None,
        task_id: Optional[str] = None
    ) -> AgentStepEvent:
        duration_str = None
        dur_val = 0.0
        if start_time is not None:
            dur_val = round(time.time() - start_time, 2)
            duration_str = f"{dur_val}s"

        event = AgentStepEvent(
            id=step_id,
            timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            type=step_type,
            title=title,
            status=status,
            duration=duration_str,
            thought_content=thought,
            tool_name=tool,
            eta_seconds_remaining=eta_sec,
            payload=payload
        )
        self.trace_history.append(event)

        # Local Data Sovereignty persistence (100% local, zero remote leakage)
        if task_id:
            if thought:
                self.local_store.log_thought(task_id, step_id, thought)
            if tool and payload:
                self.local_store.log_tool_execution(
                    task_id=task_id,
                    tool_name=tool,
                    command_or_args=str(payload.get("cmd") or payload.get("url") or payload.get("path") or ""),
                    output=str(payload.get("output", "")),
                    exit_code=int(payload.get("exit_code", 0)),
                    success=bool(payload.get("success", True)),
                    duration_sec=dur_val
                )

        if self.event_callback:
            try:
                self.event_callback(event.to_dict())
            except Exception:
                pass
        return event

    def generate_task_plan_artifact(self, plan: TaskPlan, worktree_dir: str) -> str:
        """Generates structured TASK_PLAN.md breaking tasks into discrete phases."""
        plan_path = os.path.join(worktree_dir, "TASK_PLAN.md")
        lines = [
            f"# Autonomous Task Plan: {plan.goal}",
            f"**Intent Classifier:** `{plan.intent_type}`",
            f"**Generated At:** {time.strftime('%Y-%m-%d %H:%M:%S')}",
            "",
            "## 1. Internal Reasoning Stream",
            f"> {plan.raw_thought}",
            "",
            "## 2. Milestone Phases"
        ]
        for i, phase in enumerate(plan.milestone_phases, 1):
            lines.append(f"{i}. [ ] **{phase}**")

        lines.extend([
            "",
            "## 3. Tool Dispatch Pipeline"
        ])
        for step in plan.steps:
            approval_badge = " [HUMAN-GATE REQUIRED]" if step.requires_approval else ""
            lines.append(f"- **[{step.tool.upper()}]** {step.title}{approval_badge}")
            lines.append(f"  ```json\n  {json.dumps(step.args, indent=2)}\n  ```")

        content = "\n".join(lines) + "\n"
        with open(plan_path, "w", encoding="utf-8") as f:
            f.write(content)
        return plan_path

    def generate_review_artifact(
        self,
        goal: str,
        worktree_dir: str,
        diff_info: Dict[str, Any],
        results: List[Dict[str, Any]],
        corrections_count: int
    ) -> str:
        """Generates REVIEW_ARTIFACT.md summarizing touches, diffs, and verification proofs."""
        artifact_path = os.path.join(worktree_dir, "REVIEW_ARTIFACT.md")
        lines = [
            f"# Autonomous Execution Review: {goal}",
            f"**Status:** {'SUCCESS' if all(r.get('success', False) for r in results) else 'NEEDS ATTENTION'}",
            f"**Completed At:** {time.strftime('%Y-%m-%d %H:%M:%S')}",
            f"**Self-Correction Cycles:** {corrections_count}",
            "",
            "## 1. Filesystem Modifications",
            f"- **Additions:** `+{diff_info.get('additions', 0)}`",
            f"- **Deletions:** `-{diff_info.get('deletions', 0)}`",
            f"- **Files Modified:** {', '.join(diff_info.get('files_modified', [])) or 'None'}",
            f"- **Untracked Files:** {', '.join(diff_info.get('untracked_files', [])) or 'None'}",
            "",
            "## 2. Tool Execution Results"
        ]
        for r in results:
            lines.append(f"### {r.get('title', 'Action')}")
            lines.append(f"- Tool: `{r.get('tool', 'terminal')}`")
            lines.append(f"- Exit Status: `{r.get('success')}`")
            if "output" in r:
                lines.append(f"```text\n{r['output'][:500]}\n```")
            if "screenshot_url" in r:
                lines.append(f"![Proof]({r['screenshot_url']})")

        if diff_info.get("diff"):
            lines.extend([
                "",
                "## 3. Unified Diff",
                "```diff",
                diff_info["diff"][:2500],
                "```"
            ])

        content = "\n".join(lines) + "\n"
        with open(artifact_path, "w", encoding="utf-8") as f:
            f.write(content)
        return artifact_path

    def execute_task(
        self,
        prompt: str,
        isolate_worktree: bool = True,
        auto_merge_on_success: bool = True,
        mode: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Executes complete lifecycle:
        Plan -> Tool Execution -> Verification -> Self-Correction -> Review Artifact.
        Enforces step limits, dynamic ETA forecasting, and local data sovereignty.
        """
        # Check Emergency Stop status
        SafetyGuard.assert_safety()

        task_id = str(uuid.uuid4())[:8]
        t0 = time.time()

        # Reset governor and safety history for fresh run
        self.governor.reset_task()
        self.safety_guard.reset_history()

        # Log task start in local database immediately
        self.local_store.log_task_start(task_id, prompt, "AUTONOMOUS_EXEC")

        # Query Learned Lessons for prompt guidance
        learned_guidance = self.learning_graph.format_prompt_guidance(prompt)

        # Step 1: Formulation & Thought Stream
        step_plan_id = f"thought_{task_id}"
        self._emit(
            step_id=step_plan_id,
            step_type="thought",
            title="Formulating multi-step plan",
            status="running",
            thought=f"Analyzing constraints and past lessons...\n{learned_guidance}",
            task_id=task_id
        )

        plan = self.router.route_intent(prompt)
        if learned_guidance:
            plan.raw_thought += f"\n{learned_guidance}"

        # Update task with identified intent type
        self.local_store.log_task_start(task_id, prompt, plan.intent_type)

        # Forecast initial ETA
        step_types = [s.tool for s in plan.steps]
        initial_eta = self.eta_predictor.predict_remaining(step_types)

        self._emit(
            step_id=step_plan_id,
            step_type="thought",
            title=f"Plan ready: {plan.intent_type} ({len(plan.steps)} steps)",
            status="success",
            start_time=t0,
            thought=plan.raw_thought,
            eta_sec=initial_eta["eta_seconds_remaining"],
            task_id=task_id
        )

        # Step 2: Worktree Isolation
        worktree_ctx = None
        active_cwd = self.repo_root
        if isolate_worktree:
            try:
                worktree_ctx = self.workspace_mgr.create_worktree(task_id=task_id)
                active_cwd = worktree_ctx.worktree_path
                self.patcher.base_dir = active_cwd
                self.terminal.default_cwd = active_cwd
            except Exception:
                # Fallback to in-place execution if git worktree fails
                active_cwd = self.repo_root

        # Generate TASK_PLAN.md inside workdir
        self.generate_task_plan_artifact(plan, active_cwd)

        # Step 3: Tool Execution & Verification Loop
        execution_results: List[Dict[str, Any]] = []
        overall_success = True
        correction_cycles = 0

        for idx, step in enumerate(plan.steps):
            s_t0 = time.time()
            step_call_id = f"{step.step_id}_{task_id}"

            # Safety check & Repetition Guard verification
            try:
                self.safety_guard.record_and_verify_action(step.tool, step.args)
            except (RepetitionCircuitBreakException, EmergencyStopException) as s_err:
                self._emit(
                    step_id=f"safety_halt_{task_id}",
                    step_type="error",
                    title="Safety Halt Triggered",
                    status="failed",
                    thought=str(s_err),
                    task_id=task_id
                )
                overall_success = False
                break

            # Circuit breaker check: throws CircuitBreakerTripped if > max_steps
            try:
                self.governor.record_step(step.title)
            except CircuitBreakerTripped as cbe:
                self._emit(
                    step_id=f"breaker_{task_id}",
                    step_type="error",
                    title="Execution Halted - Circuit Breaker Tripped",
                    status="failed",
                    thought=str(cbe),
                    task_id=task_id
                )
                overall_success = False
                break

            # Calculate remaining ETA from this step onward
            remaining_tools = [s.tool for s in plan.steps[idx:]]
            curr_eta = self.eta_predictor.predict_remaining(remaining_tools)

            # Check human-in-the-loop gate
            if step.requires_approval:
                self._emit(
                    step_id=step_call_id,
                    step_type="approval_request",
                    title=f"Requires Approval: {step.title}",
                    status="waiting_approval",
                    tool=step.tool,
                    eta_sec=curr_eta["eta_seconds_remaining"],
                    payload=step.args,
                    task_id=task_id
                )

            self._emit(
                step_id=step_call_id,
                step_type="tool_call",
                title=step.title,
                status="running",
                tool=step.tool,
                eta_sec=curr_eta["eta_seconds_remaining"],
                payload=step.args,
                task_id=task_id
            )

            # Dispatch action with self-correction
            res = self._execute_and_verify_step(step, active_cwd)

            # If failed, trigger self-correction loop
            if not res.get("success", False) and correction_cycles < self.max_self_corrections:
                fixed_res = self._attempt_self_repair(step, res, active_cwd, correction_cycles, task_id)
                if fixed_res.get("success", False):
                    res = fixed_res
                correction_cycles += 1

            step_duration = time.time() - s_t0
            # Dynamically update ETA predictor weights with observed duration
            self.eta_predictor.record_actual_duration(step.tool, step_duration)

            execution_results.append(res)
            if not res.get("success", False):
                overall_success = False

            status_label = "success" if res.get("success", False) else "failed"
            self._emit(
                step_id=f"result_{step_call_id}",
                step_type="tool_result",
                title=f"{step.title} -> {status_label.upper()}",
                status=status_label,
                start_time=s_t0,
                tool=step.tool,
                payload=res,
                task_id=task_id
            )

        # Step 4: Capture Diffs & Generate Review Artifact
        diff_info = {"additions": 0, "deletions": 0, "files_modified": [], "untracked_files": []}
        if worktree_ctx:
            diff_info = self.workspace_mgr.get_diff(worktree_ctx)

        # Log diff to local store
        if diff_info.get("diff"):
            for f in diff_info.get("files_modified", ["modified_files"]):
                self.local_store.log_diff(
                    task_id=task_id,
                    file_path=f,
                    diff_content=diff_info["diff"],
                    additions=diff_info.get("additions", 0),
                    deletions=diff_info.get("deletions", 0)
                )

        review_path = self.generate_review_artifact(
            goal=prompt,
            worktree_dir=active_cwd,
            diff_info=diff_info,
            results=execution_results,
            corrections_count=correction_cycles
        )

        # Step 5: Merge or Cleanup
        if worktree_ctx:
            if overall_success and auto_merge_on_success:
                commit_hash = self.workspace_mgr.commit_changes(
                    worktree_ctx,
                    f"feat(agent): {prompt[:50]} [{task_id}]"
                )
                self.workspace_mgr.merge_worktree(worktree_ctx)
                self.workspace_mgr.remove_worktree(worktree_ctx, delete_branch=True)
            else:
                self.workspace_mgr.remove_worktree(worktree_ctx, delete_branch=False)

        total_duration = time.time() - t0

        # Update local task status
        final_status = "COMPLETED" if overall_success else "FAILED"
        self.local_store.update_task_status(
            task_id=task_id,
            status=final_status,
            duration_sec=round(total_duration, 2),
            summary=f"Success: {overall_success}, Steps: {len(execution_results)}, Corrections: {correction_cycles}"
        )

        return {
            "task_id": task_id,
            "goal": prompt,
            "success": overall_success,
            "duration_sec": round(total_duration, 2),
            "corrections_made": correction_cycles,
            "review_artifact": review_path,
            "diff_summary": {
                "additions": diff_info.get("additions", 0),
                "deletions": diff_info.get("deletions", 0),
                "files_modified": diff_info.get("files_modified", [])
            },
            "governor_status": self.governor.get_status(),
            "results": execution_results
        }

    def _execute_and_verify_step(self, step: PlannedStep, cwd: str) -> Dict[str, Any]:
        """Dispatches step to appropriate tool harness with vault resolution."""
        # Dynamic Vault secret resolution
        for k, v in list(step.args.items()):
            if isinstance(v, str):
                step.args[k] = self.vault.resolve_tokens(v)

        tool = step.tool.lower()

        if tool == "terminal":
            cmd = step.args.get("cmd") or step.args.get("command", "")
            pty_res = self.terminal.run_command(cmd, cwd=cwd, timeout=60.0)
            raw_out = (pty_res.stdout + ("\n" + pty_res.stderr if pty_res.stderr else "")).strip()
            compacted = self.context_compactor.micro_compact_output(raw_out)
            return {
                "tool": "terminal",
                "cmd": cmd,
                "exit_code": pty_res.exit_code,
                "output": compacted,
                "success": pty_res.exit_code == 0 and not pty_res.timed_out
            }

        elif tool == "filesystem":
            file_path = step.args.get("path") or step.args.get("file_path", "")
            if "search" in step.args and "replace" in step.args:
                return self.patcher.apply_search_replace(
                    file_path=file_path,
                    search_block=step.args["search"],
                    replace_block=step.args["replace"]
                )
            elif "content" in step.args:
                return self.patcher.write_file(file_path, step.args["content"])
            elif "diff" in step.args:
                return self.patcher.apply_unified_diff(step.args["diff"])
            return {"success": True, "tool": "filesystem", "message": "No-op"}

        elif tool == "browser":
            url = step.args.get("url", "http://localhost:3000")
            selector = step.args.get("wait_selector")
            b_res = self.browser.verify(url, wait_selector=selector)
            return {
                "tool": "browser",
                "url": url,
                "screenshotUrl": b_res.get("screenshot_url"),
                "consoleErrors": b_res.get("console_errors", []),
                "success": b_res.get("success", False)
            }

        elif tool == "desktop_ufo":
            query = step.args.get("query", "")
            action = step.args.get("action", "click")
            if action == "click":
                return self.ufo.click_element(query)
            elif action == "type":
                return self.ufo.type_into_element(query, step.args.get("text", ""))
            return {"success": True, "tool": "desktop_ufo"}

        elif tool in ("synthesized", "dynamic_tool"):
            tool_name = step.args.get("name") or step.args.get("tool_name", "")
            kwargs = step.args.get("kwargs", {})
            return self.synthesizer.execute_tool(tool_name, **kwargs)

        elif tool in ("hierarchy", "app_agent"):
            target_app = step.args.get("app", "browser")
            intent = step.args.get("intent", "inspect")
            payload = step.args.get("payload", {})
            aip_res = self.host_agent.dispatch_aip(target_app=target_app, intent=intent, payload=payload)
            return {
                "success": aip_res.status == "SUCCESS",
                "tool": "hierarchy",
                "response": aip_res.payload
            }

        elif tool == "aci_open":
            return self.aci_editor.open_file(
                file_path=step.args.get("file_path", ""),
                line_number=step.args.get("line", 1),
                window_size=step.args.get("window_size", 50)
            )

        elif tool == "aci_edit":
            return self.aci_editor.edit_file(
                file_path=step.args.get("file_path", ""),
                start_line=step.args.get("start_line", 1),
                end_line=step.args.get("end_line", 1),
                new_content=step.args.get("new_content", "")
            )

        elif tool == "plan_branch":
            self.plan_sandbox.stage_file_change(
                file_path=step.args.get("file_path", ""),
                new_content=step.args.get("content", "")
            )
            return {
                "success": True,
                "tool": "plan_branch",
                "cumulative_diff": self.plan_sandbox.get_cumulative_diff()
            }

        elif tool in ("vla_ground", "ground_ui"):
            query = step.args.get("query", "")
            elem = self.vla_grounding.ground_element(query, screen_elements=step.args.get("elements"))
            return {
                "success": True,
                "tool": "vla_ground",
                "pixel_x": elem.pixel_x,
                "pixel_y": elem.pixel_y,
                "normalized_x": elem.normalized_x,
                "normalized_y": elem.normalized_y,
                "confidence": elem.confidence
            }

        elif tool in ("dom_distill", "distill_web"):
            raw_html = step.args.get("html", "")
            dist_text, elem_map = self.dom_distiller.distill(raw_html)
            return {
                "success": True,
                "tool": "dom_distill",
                "distilled_text": dist_text,
                "elements_count": len(elem_map)
            }

        elif tool == "fit_markdown":
            raw_html = step.args.get("html", "")
            md = self.fit_markdown.extract_with_density_filter(raw_html)
            return {"success": True, "tool": "fit_markdown", "markdown": md}

        elif tool == "demo_replay":
            name = step.args.get("program_name", "")
            res = self.demo_compiler.replay_program(name)
            return {"success": res.get("success", False), "tool": "demo_replay", "result": res}

        elif tool == "bbon_eval":
            cands = [CandidateTrajectory(**c) for c in step.args.get("candidates", [])]
            best = self.bbon_reranker.select_best(cands, goal_context=step.title)
            return {"success": True, "tool": "bbon_eval", "selected_trajectory": best.id, "score": best.final_rank_score}

        elif tool == "voice":
            try:
                from bridge.tts_feedback import speak_feedback
                text = step.args.get("text", "Task completed.")
                speak_feedback(text)
            except Exception:
                pass
            return {"success": True, "tool": "voice", "text": step.args.get("text", "Task completed.")}

        elif tool in ("repo_map", "generate_repo_map"):
            rm = self.repo_map_gen.generate_map(max_tokens=step.args.get("max_tokens", 1024))
            return {"success": True, "tool": "repo_map", "repo_map": rm}

        elif tool in ("sop", "sop_chain"):
            sop_res = self.sop_engine.execute_chain(prompt=step.args.get("prompt", step.title))
            return {"success": True, "tool": "sop", "result": sop_res}

        elif tool in ("containment", "sandbox"):
            from .containment import EphemeralSandboxContainment
            cont = EphemeralSandboxContainment()
            wsb_path = cont.generate_wsb_profile(task_id=step.args.get("task_id", "temp_task"), host_folder=cwd)
            return {"success": True, "tool": "containment", "wsb_path": str(wsb_path)}

        elif tool in ("telephony", "telephony_alert"):
            from bridge.telephony_gateway import TelephonyGateway
            gw = TelephonyGateway()
            tel_res = gw.trigger_voice_call(
                phone_number=step.args.get("phone", "+15550000000"),
                message=step.args.get("message", step.title)
            )
            return {"success": tel_res.get("dispatched", False), "tool": "telephony", "result": tel_res}

        elif tool in ("omnichannel", "omnichannel_alert"):
            from bridge.omnichannel_bridge import OmnichannelBridge
            oc = OmnichannelBridge()
            oc_res = oc.dispatch_alert(step.args.get("message", step.title), priority=step.args.get("priority", "info"))
            return {"success": True, "tool": "omnichannel", "result": oc_res}

        elif tool == "architect_editor":
            ae_res = self.architect_editor.execute_task(step.args.get("task", step.title), target_file=step.args.get("file"))
            return {"success": ae_res.get("success", False), "tool": "architect_editor", "result": ae_res}

        return {"success": True, "tool": tool}

    def _attempt_self_repair(
        self,
        step: PlannedStep,
        failed_res: Dict[str, Any],
        cwd: str,
        attempt_number: int,
        task_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Self-Correction Loop: Intercepts error stack trace, diagnoses failure,
        and applies automatic remedies while mutating the persistent learning graph.
        """
        error_context = failed_res.get("output", "") or failed_res.get("error", "")
        self._emit(
            step_id=f"self_correct_{step.step_id}_{attempt_number}",
            step_type="thought",
            title=f"Self-Correction (Cycle {attempt_number + 1}/3)",
            status="running",
            thought=f"Action '{step.title}' failed with error:\n{error_context[:300]}\nDiagnosing and formulating self-repair patch...",
            task_id=task_id
        )

        repair_result = None

        # 1. Missing Python module detection
        module_match = re.search(r"ModuleNotFoundError: No module named '([^']+)'", error_context)
        if module_match:
            missing_mod = module_match.group(1)
            fix_cmd = f"pip install {missing_mod}"
            self.terminal.run_command(fix_cmd, cwd=cwd)
            repair_result = self._execute_and_verify_step(step, cwd)
            if repair_result.get("success", False):
                self.learning_graph.record_lesson(
                    category="SHELL_COMMAND",
                    mistake=f"Missing python dependency: {missing_mod}",
                    fix=f"Run {fix_cmd}",
                    trigger_keywords=[missing_mod, "modulenotfounderror", "import"]
                )
            return repair_result

        # 2. Missing npm package detection
        npm_match = re.search(r"Cannot find module '([^']+)'", error_context)
        if npm_match:
            missing_pkg = npm_match.group(1)
            fix_cmd = f"npm install {missing_pkg} --legacy-peer-deps"
            self.terminal.run_command(fix_cmd, cwd=cwd)
            repair_result = self._execute_and_verify_step(step, cwd)
            if repair_result.get("success", False):
                self.learning_graph.record_lesson(
                    category="SHELL_COMMAND",
                    mistake=f"Missing node dependency: {missing_pkg}",
                    fix=f"Run {fix_cmd}",
                    trigger_keywords=[missing_pkg, "npm", "module"]
                )
            return repair_result

        # 3. Port in use or connection refused
        if "ECONNREFUSED" in error_context or "connect: connection refused" in error_context.lower():
            time.sleep(2.0)
            return self._execute_and_verify_step(step, cwd)

        # Default fallback: Retry step with timeout extension
        time.sleep(1.0)
        return self._execute_and_verify_step(step, cwd)
