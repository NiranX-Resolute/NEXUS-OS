"""
Nexus OS v5.0 - Autonomous Scout Agent (SCOUT-01)
=============================================================================
Specialized intelligence and reconnaissance agent responsible for:
1. Deep codebase scanning and architectural survey.
2. Symbol reference lookup and pattern searching.
3. Dependency auditing and vulnerability scanning.
4. External research via Obscura stealth browser integration.
=============================================================================
"""

import os
import re
import json
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional, Set

logger = logging.getLogger("ScoutAgent")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

# Excluded directories during exploration
DEFAULT_EXCLUDES: Set[str] = {
    ".git",
    ".github",
    ".venv",
    "venv",
    "env",
    "__pycache__",
    "node_modules",
    "dist",
    "build",
    ".pytest_cache",
    ".wrangler",
    ".cloudflare",
    "coverage",
    "screenshots",
    "logs",
    "Nexus Interview copilot"
}


class ScoutAgent:
    """
    Autonomous intelligence and reconnaissance agent for deep workspace scouting.
    """

    def __init__(self, repo_path: Optional[str] = None):
        if repo_path:
            self.repo_path = Path(repo_path).resolve()
        else:
            self.repo_path = Path(__file__).parent.parent.parent.resolve()

        logger.info(f"ScoutAgent (SCOUT-01) initialized for workspace: {self.repo_path}")

    def quick_scan(self) -> Dict[str, Any]:
        """
        Performs a rapid structural survey of the repository:
        File types, key configs, core modules, and overall workspace size.
        """
        counts_by_ext: Dict[str, int] = {}
        total_files = 0
        total_lines = 0
        detected_configs: List[str] = []

        known_config_names = {
            "pyproject.toml", "package.json", "wrangler.toml",
            "tsconfig.json", "AGENTS.md", "GEMINI.md", "README.md",
            "Dockerfile", "docker-compose.yml"
        }

        for root, dirs, files in os.walk(self.repo_path):
            dirs[:] = [d for d in dirs if d not in DEFAULT_EXCLUDES and not d.startswith(".")]

            for file in files:
                total_files += 1
                p = Path(root) / file
                ext = p.suffix.lower() or p.name
                counts_by_ext[ext] = counts_by_ext.get(ext, 0) + 1

                if file in known_config_names:
                    try:
                        rel = p.relative_to(self.repo_path).as_posix()
                        detected_configs.append(rel)
                    except ValueError:
                        detected_configs.append(file)

                # Count lines for source files
                if ext in {".py", ".ts", ".tsx", ".js", ".jsx", ".html", ".css", ".md", ".toml", ".json"}:
                    try:
                        sz = p.stat().st_size
                        if sz < 200_000:
                            with open(p, "r", encoding="utf-8", errors="ignore") as f:
                                total_lines += sum(1 for _ in f)
                        else:
                            total_lines += sz // 40
                    except Exception:
                        pass

        top_extensions = sorted(counts_by_ext.items(), key=lambda x: x[1], reverse=True)[:8]

        return {
            "workspace_root": str(self.repo_path),
            "total_files": total_files,
            "total_lines_approx": total_lines,
            "top_extensions": dict(top_extensions),
            "detected_configs": sorted(detected_configs)
        }

    def search_codebase(self, pattern: str, max_results: int = 25, case_sensitive: bool = False) -> List[Dict[str, Any]]:
        """
        Searches source files across the workspace for occurrences of a regex or text query.
        Returns matches with line numbers, relative file path, and context.
        """
        flags = 0 if case_sensitive else re.IGNORECASE
        try:
            regex = re.compile(pattern, flags)
        except re.error as e:
            logger.error(f"Invalid search regex '{pattern}': {e}")
            return []

        results: List[Dict[str, Any]] = []

        for root, dirs, files in os.walk(self.repo_path):
            dirs[:] = [d for d in dirs if d not in DEFAULT_EXCLUDES and not d.startswith(".")]

            for file in files:
                p = Path(root) / file
                ext = p.suffix.lower()
                # Scan code and text documents
                if ext not in {".py", ".ts", ".tsx", ".js", ".jsx", ".json", ".toml", ".md", ".html", ".css"}:
                    continue

                try:
                    rel_path = p.relative_to(self.repo_path).as_posix()
                except ValueError:
                    rel_path = str(p)

                try:
                    with open(p, "r", encoding="utf-8", errors="replace") as fp:
                        for lineno, line in enumerate(fp, 1):
                            if regex.search(line):
                                results.append({
                                    "file": rel_path,
                                    "line": lineno,
                                    "snippet": line.strip()[:160]
                                })
                                if len(results) >= max_results:
                                    return results
                except Exception:
                    continue

        return results

    def audit_dependencies(self) -> Dict[str, Any]:
        """
        Audits Python (pyproject.toml/requirements.txt) and Node (package.json) dependencies.
        """
        findings: Dict[str, Any] = {
            "python_packages": [],
            "npm_packages": [],
            "security_alerts": []
        }

        # Inspect pyproject.toml
        pyproject = self.repo_path / "pyproject.toml"
        if pyproject.exists():
            try:
                with open(pyproject, "r", encoding="utf-8") as f:
                    content = f.read()
                # Basic parsing of dependencies
                dep_matches = re.findall(r'["\']([a-zA-Z0-9_\-]+(?:>=|<=|==|~=)[0-9\.]+)["\']', content)
                findings["python_packages"].extend(dep_matches)
            except Exception as e:
                findings["security_alerts"].append(f"Failed parsing pyproject.toml: {e}")

        # Inspect package.json
        pkg_json = self.repo_path / "package.json"
        if pkg_json.exists():
            try:
                with open(pkg_json, "r", encoding="utf-8") as f:
                    data = json.load(f)
                deps = list(data.get("dependencies", {}).keys())
                dev_deps = list(data.get("devDependencies", {}).keys())
                findings["npm_packages"] = {
                    "dependencies": deps,
                    "devDependencies": dev_deps
                }
            except Exception as e:
                findings["security_alerts"].append(f"Failed parsing package.json: {e}")

        return findings

    async def scout_external_url(self, url: str) -> Dict[str, Any]:
        """
        Scouts an external technical documentation URL or web resource using
        the stealth Obscura browser MCP integration.
        """
        try:
            from core.mcp.obscura_mcp_server import stealth_navigate
            extracted_text = await stealth_navigate(url)
            return {
                "url": url,
                "success": True,
                "content_preview": extracted_text[:1000],
                "char_count": len(extracted_text)
            }
        except Exception as e:
            logger.error(f"External scouting failed for {url}: {e}")
            return {
                "url": url,
                "success": False,
                "error": str(e)
            }

    def generate_recon_report(self) -> Dict[str, Any]:
        """
        Compiles a complete intelligence reconnaissance report summarizing
        repository architecture, technology stack, and critical entrypoints.
        """
        scan = self.quick_scan()
        deps = self.audit_dependencies()

        # Find key entrypoint files
        entrypoints: List[str] = []
        for candidate in ["nexus_runner.py", "main.py", "apps/desktop/src/main.ts", "scripts/launch.bat"]:
            if (self.repo_path / candidate).exists():
                entrypoints.append(candidate)

        return {
            "agent": "SCOUT-01",
            "status": "OPERATIONAL",
            "workspace": scan["workspace_root"],
            "total_files": scan["total_files"],
            "approx_loc": scan["total_lines_approx"],
            "top_languages": scan["top_extensions"],
            "key_configs": scan["detected_configs"],
            "entrypoints": entrypoints,
            "dependencies_summary": {
                "python_declared": len(deps.get("python_packages", [])),
                "npm_dependencies": len(deps.get("npm_packages", {}).get("dependencies", []) if isinstance(deps.get("npm_packages"), dict) else [])
            }
        }
