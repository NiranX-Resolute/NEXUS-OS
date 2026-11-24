"""Grep check across modified production files for TODO, pass, mock, dummy, placeholder, SAMPLE_FILES, SAMPLE_PAPERS."""
from pathlib import Path
import re
import sys

FILES_TO_CHECK = [
    Path("core/runtime/ipc_server.py"),
    Path("core/memory/sovereign_store.py"),
    Path("core/runtime/provider_catalog.py"),
    Path("core/runtime/model_catalog.py"),
    Path("core/runtime/hf_manager.py"),
    Path("core/runtime/gemini_quota_manager.py"),
    Path("core/runtime/llm_router.py"),
    Path("core/engine/provider_mesh.py"),
    Path("core/runtime/audio_capture.py"),
    Path("core/runtime/media_controller.py"),
    Path("apps/notch_hud/notch_window.py"),
    Path("apps/notch_hud/drag_shelf.py"),
    Path("apps/notch_hud/media_bar.py"),
    Path("apps/command_center/src/store/agentStore.ts"),
    Path("apps/command_center/src/components/NexKoderEditor.tsx"),
    Path("apps/command_center/src/components/ScholarWorkbench.tsx"),
    Path("apps/command_center/src/App.tsx"),
    Path("apps/desktop/src/renderer/src/components/ProvidersComputeHub.tsx"),
    Path("apps/desktop/src/renderer/src/components/AbliteratedWarningBanner.tsx"),
    Path("web/landing/src/pages/GuidesPage.tsx"),
    Path("web/landing/src/pages/ComputeHubPage.tsx"),
    Path("web/landing/src/pages/SkillsCatalogPage.tsx"),
    Path("nexus.py"),
]

PATTERNS = ["TODO", "dummy", "placeholder", "mock", "SAMPLE_FILES", "SAMPLE_PAPERS"]

# Permitted non-production fallbacks: headless fallback dummy classes when PySide6 is not installed
ALLOWED_PY_PATTERNS = [
    "class _DummySignal",
    "class _Dummy",
]

def main():
    total_findings = 0
    for f in FILES_TO_CHECK:
        if not f.exists():
            print(f"Skipping missing: {f}")
            continue
        text = f.read_text(encoding="utf-8", errors="ignore")
        for line_num, line in enumerate(text.splitlines(), start=1):
            stripped = line.strip()
            # Skip comments
            if stripped.startswith("#") or stripped.startswith("//") or stripped.startswith("*"):
                continue

            for pat in PATTERNS:
                if re.search(r"\b" + re.escape(pat) + r"\b", line, re.IGNORECASE):
                    if any(allowed in line for allowed in ALLOWED_PY_PATTERNS):
                        continue
                    # Ignore standard HTML input placeholder="..." and Tailwind placeholder-... in UI files
                    if pat.lower() == "placeholder" and (
                        'placeholder="' in line
                        or "placeholder='" in line
                        or "placeholder={" in line
                        or "placeholder-" in line
                    ):
                        continue
                    print(f"[FINDING] {f}:{line_num}: [{pat}] {stripped}")
                    total_findings += 1

            # Check for standalone 'pass' statement in real logic
            if re.match(r"^\s*pass\s*$", line):
                # Ignore dummy fallback classes in except ImportError blocks
                print(f"[FINDING] {f}:{line_num}: [pass] {stripped}")
                total_findings += 1

    print(f"\nTotal findings across production files: {total_findings}")
    return total_findings

if __name__ == "__main__":
    findings = main()
    sys.exit(findings)
