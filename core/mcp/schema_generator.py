"""
Nexus OS v5.0 - GenAI Function Declaration & Tool Schema Generator.
Inspects Python functions, signatures, type annotations, and docstrings to automatically
generate Google GenAI FunctionDeclaration and OpenAPI-compliant parameter schemas for @nexus_tool.
Part of the Nexus Edge-to-Desktop Autonomous Engine.
"""

from __future__ import annotations

import inspect
import re
from typing import Any, Callable, Dict, List, Optional, Union, get_args, get_origin


# Type mapping from Python types to GenAI Type constants
_PYTHON_TO_GENAI_TYPE: Dict[type, str] = {
    str: "STRING",
    int: "INTEGER",
    float: "NUMBER",
    bool: "BOOLEAN",
    list: "ARRAY",
    dict: "OBJECT",
    bytes: "STRING",
}

_PYTHON_TO_OPENAPI_TYPE: Dict[type, str] = {
    str: "string",
    int: "integer",
    float: "number",
    bool: "boolean",
    list: "array",
    dict: "object",
    bytes: "string",
}


def parse_docstring(docstring: Optional[str]) -> Tuple[str, Dict[str, str]]:
    """
    Parses a function docstring into a top-level description and parameter descriptions.
    Supports Google-style ('Args: param: desc') and Sphinx-style (':param param: desc').
    """
    if not docstring:
        return ("", {})

    cleaned = inspect.cleandoc(docstring)
    lines = cleaned.splitlines()
    
    top_desc_lines: List[str] = []
    param_docs: Dict[str, str] = {}
    
    in_args_section = False
    current_param: Optional[str] = None
    current_param_desc: List[str] = []

    re_param_line = re.compile(r"^\s*([a-zA-Z_]\w*)\s*(?:\([^)]*\))?\s*:\s*(.*)$")
    re_sphinx_param = re.compile(r"^:param\s+([a-zA-Z_]\w*)\s*:\s*(.*)$")
    re_section_header = re.compile(r"^(Args|Arguments|Parameters|Returns|Raises|Yields):\s*$", re.IGNORECASE)

    for line in lines:
        sphinx_match = re_sphinx_param.match(line)
        if sphinx_match:
            p_name, p_desc = sphinx_match.group(1), sphinx_match.group(2)
            param_docs[p_name] = p_desc.strip()
            continue

        sec_match = re_section_header.match(line.strip())
        if sec_match:
            header_name = sec_match.group(1).lower()
            if header_name in ("args", "arguments", "parameters"):
                in_args_section = True
            else:
                in_args_section = False
                if current_param and current_param_desc:
                    param_docs[current_param] = " ".join(current_param_desc).strip()
                    current_param = None
                    current_param_desc = []
            continue

        if in_args_section:
            p_match = re_param_line.match(line)
            if p_match:
                if current_param and current_param_desc:
                    param_docs[current_param] = " ".join(current_param_desc).strip()
                current_param = p_match.group(1)
                current_param_desc = [p_match.group(2).strip()] if p_match.group(2) else []
            elif current_param:
                if line.startswith("  ") or line.startswith("\t"):
                    current_param_desc.append(line.strip())
                elif not line.strip():
                    continue
                else:
                    # Exited param description
                    param_docs[current_param] = " ".join(current_param_desc).strip()
                    current_param = None
                    current_param_desc = []
                    in_args_section = False
        else:
            if not param_docs:
                top_desc_lines.append(line)

    if current_param and current_param_desc:
        param_docs[current_param] = " ".join(current_param_desc).strip()

    top_description = " ".join(top_desc_lines).strip()
    return (top_description, param_docs)


def _resolve_type_schema(annotation: Any, use_openapi: bool = False) -> Dict[str, Any]:
    """
    Recursively resolves Python type annotations (including Optional, List[T], Dict)
    into a GenAI or OpenAPI parameter schema dictionary.
    Supports both live Python types and string annotations from future imports.
    """
    type_map = _PYTHON_TO_OPENAPI_TYPE if use_openapi else _PYTHON_TO_GENAI_TYPE
    default_type = "string" if use_openapi else "STRING"
    array_type = "array" if use_openapi else "ARRAY"
    object_type = "object" if use_openapi else "OBJECT"

    if annotation is inspect.Parameter.empty or annotation is Any:
        return {"type": default_type}

    # Handle string annotations (e.g. from __future__ import annotations)
    if isinstance(annotation, str):
        clean_ann = annotation.strip()
        if clean_ann.startswith("Optional[") and clean_ann.endswith("]"):
            inner = clean_ann[9:-1].strip()
            return _resolve_type_schema(inner, use_openapi=use_openapi)
        if " | " in clean_ann:
            parts = [p.strip() for p in clean_ann.split("|") if p.strip() not in ("None", "type(None)")]
            if len(parts) == 1:
                return _resolve_type_schema(parts[0], use_openapi=use_openapi)
        if clean_ann.startswith("Union[") and clean_ann.endswith("]"):
            parts = [p.strip() for p in clean_ann[6:-1].split(",") if p.strip() not in ("None", "type(None)")]
            if len(parts) == 1:
                return _resolve_type_schema(parts[0], use_openapi=use_openapi)

        if (clean_ann.startswith("List[") or clean_ann.startswith("list[")) and clean_ann.endswith("]"):
            inner = clean_ann[clean_ann.index("[") + 1 : -1].strip()
            return {"type": array_type, "items": _resolve_type_schema(inner, use_openapi=use_openapi)}
        if clean_ann in ("list", "List"):
            return {"type": array_type, "items": {"type": default_type}}

        if clean_ann.startswith("Dict[") or clean_ann.startswith("dict[") or clean_ann in ("dict", "Dict"):
            return {"type": object_type}

        norm_ann = clean_ann.lower()
        if norm_ann == "int":
            return {"type": "integer" if use_openapi else "INTEGER"}
        elif norm_ann == "float":
            return {"type": "number" if use_openapi else "NUMBER"}
        elif norm_ann == "bool":
            return {"type": "boolean" if use_openapi else "BOOLEAN"}
        elif norm_ann in ("str", "bytes"):
            return {"type": "string" if use_openapi else "STRING"}
        elif norm_ann == "any":
            return {"type": default_type}

    origin = get_origin(annotation)
    args = get_args(annotation)

    # Handle Union / Optional (e.g. Optional[str] or Union[int, None] or int | None)
    if origin is Union:
        non_none_args = [a for a in args if a is not type(None)]
        if len(non_none_args) == 1:
            return _resolve_type_schema(non_none_args[0], use_openapi=use_openapi)
        # Multiple union types fallback to string/object
        return {"type": default_type}

    # Handle List / Sequence
    if origin in (list, List) or annotation is list:
        schema: Dict[str, Any] = {"type": array_type}
        if args:
            schema["items"] = _resolve_type_schema(args[0], use_openapi=use_openapi)
        else:
            schema["items"] = {"type": default_type}
        return schema

    # Handle Dict / Mapping
    if origin in (dict, Dict) or annotation is dict:
        return {"type": object_type}

    # Direct basic types
    if annotation in type_map:
        return {"type": type_map[annotation]}

    # Fallback
    return {"type": default_type}


def is_optional_parameter(param: inspect.Parameter) -> bool:
    """Returns True if parameter has a default value or is typed as Optional / Union with None."""
    if param.default is not inspect.Parameter.empty:
        return True

    annotation = param.annotation
    if isinstance(annotation, str):
        s = annotation.strip()
        if s.startswith("Optional[") or " | None" in s or "None |" in s or ", None" in s:
            return True

    if annotation is not inspect.Parameter.empty:
        origin = get_origin(annotation)
        if origin is Union:
            args = get_args(annotation)
            if type(None) in args:
                return True

    return False


def function_to_genai_declaration(
    fn: Callable[..., Any],
    name_override: Optional[str] = None,
    description_override: Optional[str] = None,
    use_openapi_types: bool = False,
) -> Dict[str, Any]:
    """
    Inspects a Python function and generates a Google GenAI FunctionDeclaration schema dictionary.

    Args:
        fn: Python function to inspect (supports functions decorated with @nexus_tool).
        name_override: Optional custom tool name (defaults to tool meta name or fn.__name__).
        description_override: Optional custom description (defaults to tool meta description or docstring).
        use_openapi_types: If True, uses lowercase OpenAPI types ('string', 'number')
                           instead of GenAI Type constants ('STRING', 'NUMBER').

    Returns:
        Dictionary structured as a Google GenAI FunctionDeclaration.
    """
    raw_fn = inspect.unwrap(fn)
    meta = getattr(fn, "_nexus_tool_meta", {}) or getattr(raw_fn, "_nexus_tool_meta", {})

    # Tool Name
    name = name_override or meta.get("name") or getattr(fn, "__name__", "unnamed_tool")

    # Tool Description
    doc_desc, param_docs = parse_docstring(getattr(raw_fn, "__doc__", None) or getattr(fn, "__doc__", None))
    description = description_override or meta.get("description") or doc_desc or f"Executes {name}."

    # Inspect signature
    sig = inspect.signature(raw_fn)
    properties: Dict[str, Dict[str, Any]] = {}
    required: List[str] = []

    for param_name, param in sig.parameters.items():
        # Skip self / cls
        if param_name in ("self", "cls"):
            continue
        # Skip *args and **kwargs
        if param.kind in (inspect.Parameter.VAR_POSITIONAL, inspect.Parameter.VAR_KEYWORD):
            continue

        param_schema = _resolve_type_schema(param.annotation, use_openapi=use_openapi_types)
        
        # Add parameter description from docstring if available
        if param_name in param_docs:
            param_schema["description"] = param_docs[param_name]
        elif param.default is not inspect.Parameter.empty and param.default is not None:
            param_schema["description"] = f"Default value: {param.default}"

        properties[param_name] = param_schema

        # Check required
        if not is_optional_parameter(param):
            required.append(param_name)

    obj_type = "object" if use_openapi_types else "OBJECT"

    decl_dict: Dict[str, Any] = {
        "name": name,
        "description": description,
        "parameters": {
            "type": obj_type,
            "properties": properties,
            "required": required,
        },
    }

    return decl_dict


def to_sdk_function_declaration(decl: Union[Dict[str, Any], Callable[..., Any]]) -> Any:
    """Converts a tool schema dictionary or callable into a google.genai.types.FunctionDeclaration."""
    if callable(decl):
        decl_dict = function_to_genai_declaration(decl)
    else:
        decl_dict = decl

    try:
        from google.genai import types

        props: Dict[str, Any] = {}
        param_dict = decl_dict.get("parameters", {})
        for p_name, p_schema in param_dict.get("properties", {}).items():
            type_str = str(p_schema.get("type", "STRING")).upper()
            sdk_type = getattr(types.Type, type_str, types.Type.STRING)
            props[p_name] = types.Schema(
                type=sdk_type,
                description=p_schema.get("description", ""),
            )

        return types.FunctionDeclaration(
            name=decl_dict["name"],
            description=decl_dict.get("description", ""),
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties=props,
                required=param_dict.get("required", []),
            ),
        )
    except Exception:
        return decl_dict


def function_to_openapi_schema(
    fn: Callable[..., Any],
    name_override: Optional[str] = None,
    description_override: Optional[str] = None,
) -> Dict[str, Any]:
    """Generates standard OpenAPI 3.0 tool parameter specification for a function."""
    return function_to_genai_declaration(
        fn=fn,
        name_override=name_override,
        description_override=description_override,
        use_openapi_types=True,
    )
