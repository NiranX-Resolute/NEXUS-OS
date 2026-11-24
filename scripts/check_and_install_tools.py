import os
import sys
import shutil
import subprocess
import json
from pathlib import Path

def run_cmd(cmd, cwd=None):
    try:
        res = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=120)
        return {"returncode": res.returncode, "stdout": res.stdout.strip(), "stderr": res.stderr.strip()}
    except Exception as e:
        return {"returncode": -1, "stdout": "", "stderr": str(e)}

def main():
    root_dir = Path(__file__).parent.parent.resolve()
    results = {}

    # 1. Check tools
    tool_names = ["winget", "gcloud", "ollama", "tailscale", "bun", "git", "node", "uv"]
    installed = {}
    for t in tool_names:
        p = shutil.which(t)
        installed[t] = p if p else None
    results["tools"] = installed

    # 2. Check PySide6
    try:
        import PySide6
        results["pyside6"] = {"status": "INSTALLED", "version": getattr(PySide6, "__version__", "unknown")}
    except ImportError:
        # Install PySide6
        pip_res = run_cmd([sys.executable, "-m", "pip", "install", "PySide6"])
        results["pyside6"] = {"status": "INSTALLED" if pip_res["returncode"] == 0 else "FAILED", "log": pip_res}

    # 3. Check command_center node_modules
    cc_modules = root_dir / "apps" / "command_center" / "node_modules"
    if not cc_modules.exists():
        bun_path = shutil.which("bun") or "bun"
        bun_res = run_cmd([bun_path, "install"], cwd=str(root_dir / "apps" / "command_center"))
        results["command_center_bun_install"] = {
            "status": "COMPLETED" if bun_res["returncode"] == 0 else "FAILED",
            "log": bun_res
        }
    else:
        results["command_center_bun_install"] = {"status": "ALREADY_INSTALLED"}

    # 4. If winget is found, install requested apps if not installed
    winget_path = shutil.which("winget")
    results["winget_installations"] = {}
    if winget_path:
        to_install = [
            ("Google Cloud SDK", "Google.CloudSDK", "gcloud"),
            ("Ollama", "Ollama.Ollama", "ollama"),
            ("Tailscale", "Tailscale.Tailscale", "tailscale"),
        ]
        for name, package_id, bin_name in to_install:
            if not shutil.which(bin_name):
                cmd = [
                    winget_path, "install",
                    "--id", package_id,
                    "-e",
                    "--source", "winget",
                    "--accept-package-agreements",
                    "--accept-source-agreements",
                    "--silent"
                ]
                w_res = run_cmd(cmd)
                results["winget_installations"][name] = {
                    "package_id": package_id,
                    "returncode": w_res["returncode"],
                    "output": (w_res["stdout"] + "\n" + w_res["stderr"]).strip()[:500]
                }
            else:
                results["winget_installations"][name] = {"status": "ALREADY_INSTALLED", "path": shutil.which(bin_name)}
    else:
        results["winget_installations"]["status"] = "WINGET_NOT_FOUND"

    out_file = root_dir / "scripts" / "install_status.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    print(json.dumps(results, indent=2))

if __name__ == "__main__":
    main()
