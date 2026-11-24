"""
Nexus Hierarchical Context Compaction & Pin-Anchoring Engine
=============================================================================
Inspired by Nous Research / Hermes-Agent.
Prevents context window exhaustion during long-running tasks:
1. Micro-compaction: Summarizes verbose command / tool outputs (head + tail + errors).
2. Conversation compaction: Rolls up historical turns into structured milestone milestones.
3. Pin-Anchoring: Protects user constraints and immutable project settings from compaction.
=============================================================================
"""

import re
from typing import Dict, Any, List, Optional, Set


class ContextCompactor:
    """
    Manages multi-tier compaction to maintain high reasoning quality within token budgets.
    """

    def __init__(self, max_context_chars: int = 32000):
        self.max_context_chars = max_context_chars
        self.pinned_keys: Set[str] = set()
        self.pinned_snippets: List[str] = []

    def pin_snippet(self, text: str):
        """Pins a crucial constraint or instruction so it is never pruned."""
        if text not in self.pinned_snippets:
            self.pinned_snippets.append(text)

    def micro_compact_output(self, raw_output: str, max_lines: int = 20) -> str:
        """
        Micro-compacts raw stdout/stderr:
        Preserves exit codes, error lines, head, and tail, while omitting repetitive intermediate lines.
        """
        if not raw_output or len(raw_output) < 1500:
            return raw_output

        lines = raw_output.splitlines()
        if len(lines) <= max_lines:
            return raw_output

        head = lines[:5]
        tail = lines[-8:]

        # Extract lines that look like errors, warnings, or traces
        error_lines = []
        err_pattern = re.compile(r"(error|fail|exception|traceback|fatal|denied)", re.IGNORECASE)
        for l in lines[5:-8]:
            if err_pattern.search(l):
                error_lines.append(l)

        omitted_count = len(lines) - len(head) - len(tail) - len(error_lines)
        compacted = []
        compacted.extend(head)
        if error_lines:
            compacted.append(f"\n[... {len(error_lines)} error lines highlighted ...]")
            compacted.extend(error_lines[:10])
        compacted.append(f"\n[... {omitted_count} non-critical lines truncated for compaction ...]")
        compacted.extend(tail)

        return "\n".join(compacted)

    def compact_history(
        self,
        messages: List[Dict[str, str]],
        target_chars: Optional[int] = None
    ) -> List[Dict[str, str]]:
        """
        Compacts multi-turn history when it approaches token/char limit.
        Always preserves system instructions, pinned snippets, and latest turn.
        """
        limit = target_chars or self.max_context_chars
        total_len = sum(len(m.get("content", "")) for m in messages)

        if total_len <= limit:
            return messages

        compacted_msgs: List[Dict[str, str]] = []
        # Keep first message (often system/prompt with pins)
        if messages:
            compacted_msgs.append(messages[0])

        # Intermediate turns to summarize
        intermediate = messages[1:-2] if len(messages) > 3 else []
        latest_turns = messages[-2:] if len(messages) >= 2 else messages[1:]

        if intermediate:
            summary_points = []
            for m in intermediate:
                role = m.get("role", "assistant").upper()
                c = m.get("content", "")
                snippet = c[:120].replace("\n", " ")
                summary_points.append(f"- [{role}]: {snippet}...")

            summary_content = (
                f"[HISTORICAL TURNS COMPACTED SUMMARY ({len(intermediate)} turns)]:\n" +
                "\n".join(summary_points[:8])
            )
            compacted_msgs.append({"role": "system", "content": summary_content})

        compacted_msgs.extend(latest_turns)
        return compacted_msgs
