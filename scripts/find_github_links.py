import os
import re

ignore_dirs = {'node_modules', 'dist', '.git', '.venv', '__pycache__', 'vendor', '.wrangler'}

for root in ['web']:
    for r, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in ignore_dirs and not d.startswith('.')]
        for f in files:
            if f.endswith(('.ts', '.tsx', '.html', '.js', '.json', '.toml')):
                p = os.path.join(r, f).replace('\\', '/')
                try:
                    with open(p, 'r', encoding='utf-8') as fh:
                        txt = fh.read()
                        matches = set(re.findall(r'NiranX[A-Za-z0-9_.-]*', txt))
                        if matches:
                            print(f"{p} -> {list(matches)}")
                except Exception:
                    pass
