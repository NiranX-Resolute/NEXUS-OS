import os
import re

for root in ['.', 'functions', 'web', 'core']:
    for r, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in ('node_modules', 'dist', '.git', '.venv', 'agents', 'out', 'vendor')]
        for f in files:
            if f.endswith(('.toml', '.js', '.ts', '.json')):
                p = os.path.join(r, f)
                try:
                    with open(p, 'r', encoding='utf-8') as fh:
                        c = fh.read()
                    if 'GITHUB_OWNER' in c or 'GITHUB_REPO' in c or 'NiranX' in c:
                        matches = re.findall(r'(GITHUB_OWNER|GITHUB_REPO)\s*[:=]\s*["\']([^"\']+)["\']', c)
                        if matches:
                            print(f"{p} -> {matches}")
                except Exception:
                    pass
