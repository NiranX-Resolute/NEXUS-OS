"""
Nexus Behavior Best-of-N (bBoN) Trajectory Reranker
=============================================================================
Inspired by Agent S3 (Simular AI — SOTA on OSWorld surpassing human level at 72.6%).
Provides:
1. Trajectory sampling: Generates N diverse candidate action sequences.
2. Multi-criteria reward evaluator: Scores candidates on Task Progress, Safety,
   Step Economy, and Predictability.
3. Reranker: Selects the optimal trajectory before state-changing execution.
=============================================================================
"""

import time
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Callable


@dataclass
class CandidateTrajectory:
    id: str
    plan_title: str
    steps: List[Dict[str, Any]]
    rationale: str
    predicted_success_score: float = 0.0
    risk_score: float = 0.0
    estimated_duration_sec: float = 0.0
    final_rank_score: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)


class BehaviorBestOfNReranker:
    """
    Samples and reranks action trajectories using multi-attribute reward scoring.
    """

    def __init__(self, sample_size_n: int = 3, safety_weight: float = 0.35, efficiency_weight: float = 0.25):
        self.sample_size_n = sample_size_n
        self.safety_weight = safety_weight
        self.efficiency_weight = efficiency_weight
        self.progress_weight = 1.0 - (safety_weight + efficiency_weight)

    def evaluate_candidate(self, candidate: CandidateTrajectory, goal_context: str) -> float:
        """
        Calculates composite score S = W_progress * Progress + W_safety * (1 - Risk) + W_eff * Efficiency
        """
        # Step economy penalty: fewer steps for equivalent work is preferred
        num_steps = max(1, len(candidate.steps))
        step_efficiency = max(0.1, 1.0 - (num_steps - 1) * 0.1)

        # Risk penalty for destructive commands (rm, del, drop, truncate, format)
        risk = 0.0
        destructive_keywords = {"rm ", "rmdir", "del ", "drop table", "truncate", "format ", "kill -9"}
        for step in candidate.steps:
            cmd = str(step.get("args", {}).get("cmd", "")).lower()
            if any(dk in cmd for dk in destructive_keywords):
                risk += 0.5
        candidate.risk_score = min(1.0, risk)

        # Base progress score from predicted success
        progress = candidate.predicted_success_score

        # Composite score
        composite = (
            self.progress_weight * progress +
            self.safety_weight * (1.0 - candidate.risk_score) +
            self.efficiency_weight * step_efficiency
        )
        candidate.final_rank_score = round(composite, 4)
        return candidate.final_rank_score

    def rerank_trajectories(
        self,
        candidates: List[CandidateTrajectory],
        goal_context: str
    ) -> List[CandidateTrajectory]:
        """
        Scores and ranks all candidate trajectories in descending order of composite reward.
        """
        for c in candidates:
            self.evaluate_candidate(c, goal_context)

        ranked = sorted(candidates, key=lambda x: x.final_rank_score, reverse=True)
        return ranked

    def select_best(
        self,
        candidates: List[CandidateTrajectory],
        goal_context: str
    ) -> CandidateTrajectory:
        """
        Returns the top-1 ranked trajectory from the candidate pool.
        """
        if not candidates:
            raise ValueError("Candidate trajectories pool cannot be empty.")
        ranked = self.rerank_trajectories(candidates, goal_context)
        return ranked[0]
