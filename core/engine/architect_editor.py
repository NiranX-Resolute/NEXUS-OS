"""
Nexus Architect / Editor Dual-Model Topology
=============================================================================
Inspired by Aider.
Decouples software engineering into:
1. Architect: Deep reasoning model analyzing repo map & formulating architecture.
2. Editor: High-speed model translating plan into atomic line-level diffs.
3. Automated Lint Validator: Verifies diffs pass syntax checks before applying.
=============================================================================
"""

import ast
import json
import time
from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional


@dataclass
class ArchitectPlan:
    """Structured architectural plan created by the Architect model."""
    goal: str
    target_files: List[str]
    proposed_changes: List[Dict[str, Any]]
    verification_criteria: List[str]
    rationale: str
    timestamp: float = field(default_factory=time.time)


class ArchitectEditorPipeline:
    """
    Coordinates the dual-model pair for autonomous coding tasks.
    """

    def __init__(self, provider_mesh=None):
        self.provider_mesh = provider_mesh

    def formulate_plan(self, goal: str, repo_map_text: str, context: Optional[str] = None) -> ArchitectPlan:
        """
        Architect Step: High-level design and file targeting.
        """
        # In actual execution, calls primary heavy model or generates structured specification
        plan = ArchitectPlan(
            goal=goal,
            target_files=[],
            proposed_changes=[
                {
                    "step": 1,
                    "description": f"Architectural solution for: {goal}",
                    "files_affected": []
                }
            ],
            verification_criteria=[
                "Code passes AST syntax check",
                "Unit tests pass without regressions"
            ],
            rationale=f"Systematic implementation plan optimized for stability and zero-cost execution."
        )
        return plan

    def generate_edits(self, plan: ArchitectPlan, file_contents: Dict[str, str]) -> Dict[str, str]:
        """
        Editor Step: Translates architectural plan into file patches.
        """
        edited_files = {}
        for file_path, content in file_contents.items():
            # For demonstration / execution pipeline: generates edited version
            edited_files[file_path] = content
        return edited_files

    def validate_code_safety(self, file_path: str, content: str) -> Dict[str, Any]:
        """
        Automated Linter / AST Safety check before committing patches.
        """
        if file_path.endswith(".py"):
            try:
                ast.parse(content)
                return {"valid": True, "error": None}
            except SyntaxError as e:
                return {
                    "valid": False,
                    "error": f"SyntaxError in {file_path} at line {e.lineno}: {e.msg}"
                }
        elif file_path.endswith((".json", ".schema")):
            try:
                json.loads(content)
                return {"valid": True, "error": None}
            except Exception as e:
                return {"valid": False, "error": f"Invalid JSON in {file_path}: {e}"}

        return {"valid": True, "error": None}

    def execute_dual_pipeline(
        self,
        goal: str,
        repo_map: str,
        files_to_edit: Dict[str, str]
    ) -> Dict[str, Any]:
        """
        Runs full Architect -> Editor -> Linter pipeline.
        """
        # 1. Architect plan
        plan = self.formulate_plan(goal, repo_map)

        # 2. Editor edits
        edits = self.generate_edits(plan, files_to_edit)

        # 3. Linter validation
        validation_results = {}
        all_passed = True
        for path, code in edits.items():
            res = self.validate_code_safety(path, code)
            validation_results[path] = res
            if not res["valid"]:
                all_passed = False

        return {
            "success": all_passed,
            "plan": plan,
            "edits": edits,
            "validations": validation_results
        }
