#!/usr/bin/env python3
import os
import re
import sys

TARGET_DIRS = ["core", "web", "apps", "functions", "scripts", "tests"]
ROOT_FILES = ["nexus.py", "pyproject.toml", "nexus_manifest.yaml", "wrangler.toml", "README.md", "GEMINI.md"]
IGNORE_DIRS = {
    "node_modules", ".git", ".venv", "venv", "__pycache__", "vendor",
    "dist", "out", "build", "release", "agents", ".cache", "tmp"
}

PATTERNS = [
    ("SEC-X94-K982", re.compile(r"SEC-X94-K982")),
    ("GitHub Token", re.compile(r"ghp_[A-Za-z0-9]{30,}")),
    ("OpenAI Key", re.compile(r"sk-[A-Za-z0-9]{32,}")),
    ("Private Key", re.compile(r"-----BEGIN [A-Z]+ PRIVATE KEY-----")),
]

EXTENSIONS = {
    ".py", ".ts", ".tsx", ".js", ".jsx", ".json", ".yaml", ".yml",
    ".toml", ".md", ".html", ".css", ".env", ".sh", ".bat", ".ps1"
}

findings = []
scanned_files = 0

for target in TARGET_DIRS:
    if not os.path.exists(target):
        continue
    for root, dirs, files in os.walk(target):
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
        for f in files:
            ext = os.path.splitext(f)[1].lower()
            if ext in EXTENSIONS:
                scanned_files += 1
                p = os.path.join(root, f)
                try:
                    with open(p, "r", encoding="utf-8", errors="ignore") as fh:
                        content = fh.read()
                        for name, pat in PATTERNS:
                            if pat.search(content):
                                findings.append((p, name))
                except Exception:
                    pass

for rf in ROOT_FILES:
    if os.path.exists(rf):
        scanned_files += 1
        with open(rf, "r", encoding="utf-8", errors="ignore") as fh:
            content = fh.read()
            for name, pat in PATTERNS:
                if pat.search(content):
                    findings.append((rf, name))

print(f"Scanned {scanned_files} source files.")
print(f"Total Secret Findings: {len(findings)}")
for f, name in findings:
    print(f"  [!] {f}: {name}")

if len(findings) > 0:
    sys.exit(1)
print("✅ Secret Audit Clean - 0 Leaks Detected.")
sys.exit(0)
