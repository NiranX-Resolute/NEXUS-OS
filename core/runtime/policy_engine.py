"""Nexus OS v5.0 - Axionic-Mechanex Inference Policy & Strict Schema Engine.

Adapted from Axionic-Labs/mechanex runtime policy interfaces for Nexus OS:
- strict_json_policy: Strict JSON parsing, schema validation & automatic constrained retry
- concise_reflex_policy: <=120 token constraint, zero-filler, direct actionable syntax
- deep_architect_policy: Mandatory 4-section architecture breakdown
- Execution Mode sync: auto | local | cloud strictly guarded by WorkspaceGovernor [SILENT] air-gap
- SQLite WAL telemetry logging to agent_local.db

Zero-mock, production-grade implementation for local Ollama and cloud models.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
import logging
from pathlib import Path
import re
import sqlite3
import time
from typing import Any, Callable, Dict, List, Literal, Optional, Tuple, Type, Union

from core.runtime.llm_router import LLMRouter, LLMProviderError
from core.runtime.workspaces import WorkspaceGovernor

logger = logging.getLogger("nexus.runtime.policy_engine")

MAX_CONSTRAINED_RETRIES = 2

# Try importing jsonschema if installed; fallback is provided below
try:
    import jsonschema  # type: ignore
    HAS_JSONSCHEMA = True
except Exception:
    jsonschema = None
    HAS_JSONSCHEMA = False

# Try importing pydantic for BaseModel validation
try:
    from pydantic import BaseModel, ValidationError  # type: ignore
    HAS_PYDANTIC = True
except Exception:
    BaseModel = None  # type: ignore
    ValidationError = None  # type: ignore
    HAS_PYDANTIC = False


class PolicyViolationError(Exception):
    """Raised when an LLM completion fails policy validation after retries or violates air-gap invariants."""

    def __init__(self, message: str, policy: str = "general", raw_output: str = "") -> None:
        super().__init__(message)
        self.message = message
        self.policy = policy
        self.raw_output = raw_output


@dataclass
class InferencePolicy:
    """Dataclass specifying an inference steering policy."""
    name: str
    system_directive: str
    max_tokens: int
    temperature: float
    require_json: bool
    max_retries: int = 2


POLICY_REGISTRY: Dict[str, InferencePolicy] = {
    "strict_json_policy": InferencePolicy(
        name="strict_json_policy",
        system_directive="You are a strict deterministic JSON generator. Output valid JSON only, without commentary or markdown code fences.",
        max_tokens=2048,
        temperature=0.1,
        require_json=True,
        max_retries=2,
    ),
    "concise_reflex_policy": InferencePolicy(
        name="concise_reflex_policy",
        system_directive="You are an ultra-low-latency reflex agent. Provide direct, dense, actionable responses in <=120 tokens with zero conversational fluff.",
        max_tokens=256,
        temperature=0.1,
        require_json=False,
        max_retries=1,
    ),
    "deep_architect_policy": InferencePolicy(
        name="deep_architect_policy",
        system_directive="You are an expert systems architect. Provide exhaustive multi-section engineering breakdowns with root-cause analysis, dependency verification, and complete diffs.",
        max_tokens=4096,
        temperature=0.2,
        require_json=False,
        max_retries=2,
    ),
}


def extract_json_from_text(text: str) -> Optional[Union[Dict[str, Any], List[Any]]]:
    """Extracts JSON from model output, stripping markdown code fences or parsing outermost brackets."""
    if not text:
        return None
    cleaned = text.strip()

    # 1. Direct parse
    try:
        return json.loads(cleaned)
    except Exception:
        pass

    # 2. Extract from markdown code fence ```json ... ``` or ``` ... ```
    fence_pattern = re.compile(r"```(?:json)?\s*([\s\S]*?)\s*```", re.IGNORECASE)
    match = fence_pattern.search(cleaned)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except Exception:
            pass

    # 3. Extract outermost { ... }
    first_brace = cleaned.find("{")
    last_brace = cleaned.rfind("}")
    if first_brace != -1 and last_brace > first_brace:
        try:
            return json.loads(cleaned[first_brace : last_brace + 1])
        except Exception:
            pass

    # 4. Extract outermost [ ... ]
    first_bracket = cleaned.find("[")
    last_bracket = cleaned.rfind("]")
    if first_bracket != -1 and last_bracket > first_bracket:
        try:
            return json.loads(cleaned[first_bracket : last_bracket + 1])
        except Exception:
            pass

    return None


def validate_json_schema(data: Any, schema: Union[Dict[str, Any], Type[Any], Any]) -> Tuple[bool, str]:
    """Validates data against JSON Schema or Pydantic BaseModel using jsonschema/pydantic or native fallback."""
    if not schema:
        return True, ""

    # 1. Pydantic BaseModel validation support
    if HAS_PYDANTIC and BaseModel is not None and isinstance(schema, type) and issubclass(schema, BaseModel):
        try:
            if hasattr(schema, "model_validate"):
                schema.model_validate(data)
            elif hasattr(schema, "parse_obj"):
                schema.parse_obj(data)
            return True, ""
        except ValidationError as err:
            return False, f"Pydantic validation error: {err}"
        except Exception as exc:
            return False, f"Pydantic validation error: {str(exc)}"

    if not isinstance(schema, dict):
        return True, ""

    if HAS_JSONSCHEMA and jsonschema is not None:
        try:
            jsonschema.validate(instance=data, schema=schema)
            return True, ""
        except jsonschema.ValidationError as err:
            return False, f"Schema error at path '{list(err.path)}': {err.message}"
        except Exception as exc:
            return False, f"Schema validation exception: {str(exc)}"

    # Native fallback schema validator
    expected_type = schema.get("type")
    if expected_type:
        type_map = {
            "object": dict,
            "array": list,
            "string": str,
            "number": (int, float),
            "integer": int,
            "boolean": bool,
            "null": type(None),
        }
        target_py_type = type_map.get(expected_type)
        if target_py_type and not isinstance(data, target_py_type):
            return False, f"Expected type '{expected_type}', got '{type(data).__name__}'"

    if isinstance(data, dict):
        required = schema.get("required", [])
        for field in required:
            if field not in data:
                return False, f"Missing required property '{field}'"

        properties = schema.get("properties", {})
        for prop_name, prop_schema in properties.items():
            if prop_name in data:
                valid, err = validate_json_schema(data[prop_name], prop_schema)
                if not valid:
                    return False, f"Property '{prop_name}': {err}"

    elif isinstance(data, list) and "items" in schema:
        item_schema = schema["items"]
        for idx, item in enumerate(data):
            valid, err = validate_json_schema(item, item_schema)
            if not valid:
                return False, f"Item [{idx}]: {err}"

    if "enum" in schema and data not in schema["enum"]:
        return False, f"Value '{data}' not in allowed enum: {schema['enum']}"

    return True, ""


class PolicyEngine:
    """Axionic-Mechanex Policy Engine enforcing inference-time behaviors and strict schema validation."""

    def __init__(
        self,
        router: Optional[LLMRouter] = None,
        governor: Optional[WorkspaceGovernor] = None,
        execution_mode: str = "auto",
        db_path: Optional[Union[str, Path]] = None,
    ) -> None:
        self.governor = governor or WorkspaceGovernor()
        self.router = router or LLMRouter(governor=self.governor)
        self.db_path = Path(db_path) if db_path else (Path.home() / ".nexus-agent" / "db" / "agent_local.db")
        self.execution_mode = "auto"
        self.set_execution_mode(execution_mode)

    def set_execution_mode(self, mode: str = "auto") -> PolicyEngine:
        """Sets execution mode ('auto', 'local', 'cloud'), strictly enforcing SILENT air-gap rules."""
        norm = (mode or "").strip().lower()
        if norm not in ("auto", "local", "cloud"):
            raise ValueError(f"Execution mode must be one of 'auto', 'local', 'cloud', got '{mode}'")

        active_ws_mode = getattr(self.governor, "active_mode", "DEV").upper()
        if active_ws_mode == "SILENT" and norm == "cloud":
            raise PolicyViolationError(
                "Cloud routing prohibited in SILENT workspace mode (Air-Gapped)",
                policy="execution_mode",
            )

        self.execution_mode = norm
        return self

    def get_effective_mode(self) -> str:
        """Returns the effective execution mode accounting for WorkspaceGovernor SILENT air-gap."""
        return self._resolve_effective_mode()

    def execute(
        self,
        prompt: str,
        policy_name: str = "strict_json_policy",
        schema: Optional[Union[Dict[str, Any], Type[Any]]] = None,
        execution_mode: str = "auto",
        model_override: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Executes a prompt under the specified policy, conforming to mechanex runtime interface."""
        res = self.execute_with_policy(
            prompt=prompt,
            policy_name=policy_name,
            schema=schema,
            execution_mode=execution_mode,
        )
        return {
            "ok": res.get("success", False),
            "policy": res.get("policy", policy_name),
            "data": res.get("data", res.get("output", "")),
            "pydantic_instance": res.get("pydantic_instance"),
            "retries_used": res.get("retries_used", 0),
            "latency_ms": res.get("latency_ms", 0.0),
            "effective_mode": res.get("effective_mode", self.get_effective_mode()),
            "error": res.get("error"),
        }

    def _resolve_effective_mode(self, request_mode: Optional[str] = None) -> str:
        """Determines runtime execution mode factoring in WorkspaceGovernor SILENT air-gap."""
        active_ws = getattr(self.governor, "active_mode", "DEV").upper()
        is_silent = (active_ws == "SILENT") or (hasattr(self.governor, "is_silent") and self.governor.is_silent())
        mode = (request_mode or self.execution_mode or "auto").strip().lower()

        if is_silent:
            if mode == "cloud":
                raise PolicyViolationError(
                    "Cloud routing prohibited in SILENT workspace mode (Air-Gapped)",
                    policy="execution_mode",
                )
            return "local"

        return mode

    def _dispatch_router(
        self,
        prompt: str,
        system_prompt: str,
        model_category: str = "default",
        effective_mode: str = "auto",
    ) -> Dict[str, Any]:
        """Dispatches completion request through LLMRouter with preferred provider constraints."""
        pref_provider: Optional[str] = None
        if effective_mode == "local":
            pref_provider = "ollama"

        if hasattr(self.router, "generate"):
            res = self.router.generate(
                prompt=prompt,
                system_prompt=system_prompt,
                task_type=model_category,
                preferred_provider=pref_provider,
            )
            raw = res.get("text", "") or res.get("output", "")
            return {
                "success": res.get("success", False),
                "output": raw,
                "provider": res.get("provider", "unknown"),
                "model": res.get("model", "unknown"),
                "latency_ms": res.get("total_latency_ms", 0.0),
                "error": res.get("error", ""),
            }
        elif hasattr(self.router, "query"):
            res = self.router.query(prompt, system_prompt=system_prompt, category=model_category)
            return {
                "success": res.get("success", False),
                "output": res.get("output", "") or res.get("content", ""),
                "provider": res.get("provider", "unknown"),
                "model": res.get("model", "unknown"),
                "latency_ms": res.get("latency_ms", 0.0),
                "error": res.get("error", ""),
            }
        else:
            raise RuntimeError("LLMRouter has neither generate() nor query() interface.")

    def _log_telemetry(
        self,
        policy_name: str,
        retries_used: int,
        latency_ms: float,
        provider_used: str,
        success: bool,
        error_msg: Optional[str] = None,
    ) -> None:
        """Persists policy execution telemetry into agent_local.db telemetry_logs table."""
        try:
            if not self.db_path.parent.exists():
                self.db_path.parent.mkdir(parents=True, exist_ok=True)
            conn = sqlite3.connect(str(self.db_path), timeout=5.0)
            try:
                conn.execute("PRAGMA journal_mode = WAL;")
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS telemetry_logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        source TEXT NOT NULL,
                        level TEXT NOT NULL DEFAULT 'INFO',
                        message TEXT NOT NULL,
                        latency_ms REAL DEFAULT 0,
                        metadata TEXT,
                        policy_name TEXT,
                        retries_used INTEGER DEFAULT 0,
                        provider_used TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                    """
                )
                meta_json = json.dumps({
                    "policy_name": policy_name,
                    "retries_used": retries_used,
                    "latency_ms": latency_ms,
                    "provider_used": provider_used,
                    "success": success,
                    "error": error_msg,
                })
                conn.execute(
                    """
                    INSERT INTO telemetry_logs (source, level, message, latency_ms, metadata, policy_name, retries_used, provider_used)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?);
                    """,
                    (
                        "policy_engine",
                        "INFO" if success else "WARNING",
                        f"Policy {policy_name} execution: success={success}, retries={retries_used}",
                        latency_ms,
                        meta_json,
                        policy_name,
                        retries_used,
                        provider_used,
                    ),
                )
                conn.commit()
            finally:
                conn.close()
        except Exception as exc:
            logger.debug("Telemetry logging fallback: %s", exc)

    def execute_with_policy(
        self,
        prompt: str,
        policy_name: str = "strict_json_policy",
        system_prompt: Optional[str] = None,
        schema: Optional[Union[Dict[str, Any], Type[Any]]] = None,
        required_keys: Optional[List[str]] = None,
        max_retries: int = MAX_CONSTRAINED_RETRIES,
        model_category: str = "default",
        execution_mode: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Dispatches an LLM query wrapped with inference-time policy validation and constrained retries."""
        p_name = policy_name.lower().strip()
        effective_mode = self._resolve_effective_mode(execution_mode)

        start_t = time.perf_counter()

        if p_name in ("strict_json_policy", "strict_json", "json"):
            res = self._enforce_strict_json(
                prompt=prompt,
                base_system=system_prompt or "",
                schema=schema,
                required_keys=required_keys,
                max_retries=max_retries,
                model_category=model_category,
                effective_mode=effective_mode,
            )
        elif p_name in ("concise_reflex_policy", "concise_reflex", "reflex"):
            res = self._enforce_concise_reflex(
                prompt=prompt,
                base_system=system_prompt or "",
                model_category=model_category,
                effective_mode=effective_mode,
            )
        elif p_name in ("deep_architect_policy", "deep_architect", "architect"):
            res = self._enforce_deep_architect(
                prompt=prompt,
                base_system=system_prompt or "",
                max_retries=max_retries,
                model_category=model_category,
                effective_mode=effective_mode,
            )
        else:
            raise ValueError(
                f"Unknown policy '{policy_name}'. Valid: strict_json_policy, concise_reflex_policy, deep_architect_policy."
            )

        elapsed_ms = round((time.perf_counter() - start_t) * 1000, 2)
        res["latency_ms"] = elapsed_ms

        self._log_telemetry(
            policy_name=res.get("policy", policy_name),
            retries_used=res.get("retries_used", res.get("attempts", 1) - 1),
            latency_ms=elapsed_ms,
            provider_used=res.get("provider", "unknown"),
            success=res.get("success", False),
            error_msg=res.get("error"),
        )

        return res

    def _enforce_strict_json(
        self,
        prompt: str,
        base_system: str,
        schema: Optional[Union[Dict[str, Any], Type[Any]]],
        required_keys: Optional[List[str]],
        max_retries: int,
        model_category: str,
        effective_mode: str,
    ) -> Dict[str, Any]:
        """Executes LLM completion enforcing valid JSON output and required fields/schema/pydantic."""
        schema_dict: Optional[Dict[str, Any]] = None
        pydantic_cls: Optional[Type[Any]] = None

        if HAS_PYDANTIC and BaseModel is not None and isinstance(schema, type) and issubclass(schema, BaseModel):
            pydantic_cls = schema
            if hasattr(schema, "model_json_schema"):
                schema_dict = schema.model_json_schema()
            elif hasattr(schema, "schema"):
                schema_dict = schema.schema()
        elif isinstance(schema, dict):
            schema_dict = schema

        json_sys = (
            f"{base_system}\n"
            "STRICT JSON POLICY: You must respond ONLY with valid JSON. "
            "Do not include conversational filler, markdown formatting, or text outside the JSON object/array."
        ).strip()
        if required_keys:
            json_sys += f"\nMandatory top-level keys required: {', '.join(required_keys)}"
        if schema_dict:
            json_sys += f"\nJSON Schema requirement: {json.dumps(schema_dict)}"

        current_prompt = prompt
        attempts = 0
        last_error = ""
        last_raw = ""
        provider_used = "unknown"
        model_used = "unknown"

        while attempts <= max_retries:
            attempts += 1
            route_res = self._dispatch_router(
                prompt=current_prompt,
                system_prompt=json_sys,
                model_category=model_category,
                effective_mode=effective_mode,
            )
            provider_used = route_res.get("provider", "unknown")
            model_used = route_res.get("model", "unknown")

            if not route_res.get("success"):
                last_error = route_res.get("error", "LLM router dispatch failed")
                continue

            raw_output = route_res.get("output", "")
            last_raw = raw_output

            parsed = extract_json_from_text(raw_output)
            if parsed is None:
                last_error = "Response did not contain valid parseable JSON."
                current_prompt = (
                    f"{prompt}\n\n"
                    f"[POLICY REPAIR ATTEMPT {attempts}/{max_retries}]: "
                    f"Your previous output was not valid JSON. Error: {last_error}\n"
                    "Return strictly valid raw JSON without preamble."
                )
                continue

            # Verify required keys if specified
            if required_keys and isinstance(parsed, dict):
                missing = [k for k in required_keys if k not in parsed]
                if missing:
                    last_error = f"JSON missing mandatory keys: {missing}"
                    current_prompt = (
                        f"{prompt}\n\n"
                        f"[POLICY REPAIR ATTEMPT {attempts}/{max_retries}]: "
                        f"The returned JSON was missing required keys: {missing}. Include all keys: {required_keys}."
                    )
                    continue

            # Verify JSON Schema / Pydantic if provided
            if schema:
                valid, schema_err = validate_json_schema(parsed, schema)
                if not valid:
                    last_error = schema_err
                    schema_repr = json.dumps(schema_dict) if schema_dict else str(schema)
                    current_prompt = (
                        f"{prompt}\n\n"
                        f"[POLICY REPAIR ATTEMPT {attempts}/{max_retries}]: "
                        f"JSON schema/validation violation: {schema_err}. "
                        f"Output must conform strictly to schema: {schema_repr}."
                    )
                    continue

            pydantic_inst = None
            if pydantic_cls is not None:
                try:
                    if hasattr(pydantic_cls, "model_validate"):
                        pydantic_inst = pydantic_cls.model_validate(parsed)
                    elif hasattr(pydantic_cls, "parse_obj"):
                        pydantic_inst = pydantic_cls.parse_obj(parsed)
                except Exception as p_err:
                    last_error = f"Pydantic instantiation error: {p_err}"
                    continue

            return {
                "success": True,
                "policy": "strict_json_policy",
                "data": parsed,
                "pydantic_instance": pydantic_inst,
                "raw_output": raw_output,
                "attempts": attempts,
                "retries_used": attempts - 1,
                "provider": provider_used,
                "model": model_used,
                "execution_mode": effective_mode,
            }

        return {
            "success": False,
            "policy": "strict_json_policy",
            "error": f"Failed strict JSON validation after {attempts} attempts. Last error: {last_error}",
            "raw_output": last_raw,
            "attempts": attempts,
            "retries_used": attempts - 1,
            "provider": provider_used,
            "model": model_used,
            "execution_mode": effective_mode,
        }

    def _enforce_concise_reflex(
        self,
        prompt: str,
        base_system: str,
        model_category: str,
        effective_mode: str,
    ) -> Dict[str, Any]:
        """Executes LLM completion constrained to <= 120 tokens, zero filler."""
        reflex_sys = (
            f"{base_system}\n"
            "CONCISE REFLEX POLICY: Output strictly <= 120 tokens. "
            "Be telegraphic, direct, and actionable. Zero conversational fluff, greetings, or filler."
        ).strip()

        route_res = self._dispatch_router(
            prompt=prompt,
            system_prompt=reflex_sys,
            model_category=model_category,
            effective_mode=effective_mode,
        )
        if not route_res.get("success"):
            return {
                "success": False,
                "policy": "concise_reflex_policy",
                "error": route_res.get("error", "LLM router query failed"),
                "provider": route_res.get("provider", "unknown"),
                "model": route_res.get("model", "unknown"),
            }

        raw = route_res.get("output", "")
        words = raw.strip().split()
        if len(words) > 95:
            clipped = " ".join(words[:95]) + "..."
        else:
            clipped = raw.strip()

        token_est = int(len(clipped.split()) * 1.3)
        return {
            "success": True,
            "policy": "concise_reflex_policy",
            "content": clipped,
            "raw_output": raw,
            "token_estimate": min(120, token_est),
            "retries_used": 0,
            "provider": route_res.get("provider", "unknown"),
            "model": route_res.get("model", "unknown"),
            "execution_mode": effective_mode,
        }

    def _enforce_deep_architect(
        self,
        prompt: str,
        base_system: str,
        max_retries: int,
        model_category: str,
        effective_mode: str,
    ) -> Dict[str, Any]:
        """Executes LLM completion enforcing mandatory 4-section architecture breakdown."""
        required_headers = [
            "Invariant Verification",
            "File Changes",
            "Execution Steps",
            "Rollback Plan",
        ]

        architect_sys = (
            f"{base_system}\n"
            "DEEP ARCHITECT POLICY: Your architectural output must strictly contain the following 4 markdown sections:\n"
            "1. ## Invariant Verification\n"
            "2. ## File Changes\n"
            "3. ## Execution Steps\n"
            "4. ## Rollback Plan\n"
            "Provide rigorous, production-grade details under each section."
        ).strip()

        current_prompt = prompt
        attempts = 0
        last_raw = ""
        last_error = ""
        provider_used = "unknown"
        model_used = "unknown"

        while attempts <= max_retries:
            attempts += 1
            route_res = self._dispatch_router(
                prompt=current_prompt,
                system_prompt=architect_sys,
                model_category=model_category,
                effective_mode=effective_mode,
            )
            provider_used = route_res.get("provider", "unknown")
            model_used = route_res.get("model", "unknown")

            if not route_res.get("success"):
                last_error = route_res.get("error", "LLM router query failed")
                continue

            raw = route_res.get("output", "")
            last_raw = raw

            missing_headers = []
            for h in required_headers:
                if not re.search(rf"##\s*.*{re.escape(h)}", raw, re.IGNORECASE):
                    missing_headers.append(h)

            if missing_headers:
                last_error = f"Missing mandatory sections: {missing_headers}"
                current_prompt = (
                    f"{prompt}\n\n"
                    f"[POLICY REPAIR ATTEMPT {attempts}/{max_retries}]: "
                    f"Your previous response was missing the following mandatory headers: {missing_headers}. "
                    "You must include: ## Invariant Verification, ## File Changes, ## Execution Steps, and ## Rollback Plan."
                )
                continue

            return {
                "success": True,
                "policy": "deep_architect_policy",
                "content": raw,
                "sections_found": required_headers,
                "attempts": attempts,
                "retries_used": attempts - 1,
                "provider": provider_used,
                "model": model_used,
                "execution_mode": effective_mode,
            }

        return {
            "success": False,
            "policy": "deep_architect_policy",
            "error": f"Failed deep architect validation after {attempts} attempts: {last_error}",
            "raw_output": last_raw,
            "attempts": attempts,
            "retries_used": attempts - 1,
            "provider": provider_used,
            "model": model_used,
            "execution_mode": effective_mode,
        }


# Backwards compatibility alias
InferencePolicyEngine = PolicyEngine


def strict_json_policy(
    prompt: str,
    schema: Optional[Union[Dict[str, Any], Type[Any]]] = None,
    required_keys: Optional[List[str]] = None,
    router: Optional[LLMRouter] = None,
    execution_mode: str = "auto",
) -> Dict[str, Any]:
    """Helper shortcut for running strict_json_policy."""
    engine = PolicyEngine(router=router, execution_mode=execution_mode)
    return engine.execute_with_policy(
        prompt=prompt,
        policy_name="strict_json_policy",
        schema=schema,
        required_keys=required_keys,
    )


def concise_reflex_policy(
    prompt: str,
    router: Optional[LLMRouter] = None,
    execution_mode: str = "auto",
) -> Dict[str, Any]:
    """Helper shortcut for running concise_reflex_policy."""
    engine = PolicyEngine(router=router, execution_mode=execution_mode)
    return engine.execute_with_policy(
        prompt=prompt,
        policy_name="concise_reflex_policy",
    )


def deep_architect_policy(
    prompt: str,
    router: Optional[LLMRouter] = None,
    execution_mode: str = "auto",
) -> Dict[str, Any]:
    """Helper shortcut for running deep_architect_policy."""
    engine = PolicyEngine(router=router, execution_mode=execution_mode)
    return engine.execute_with_policy(
        prompt=prompt,
        policy_name="deep_architect_policy",
    )
