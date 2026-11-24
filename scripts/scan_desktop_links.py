import os
import re

for target_dir in ['apps/desktop/src/renderer/src', 'apps/command_center']:
    for r, dirs, files in os.walk(target_dir):
        dirs[:] = [d for d in dirs if d not in ('node_modules', 'dist', '.git') and not d.startswith('.')]
        for f in files:
            if f.endswith(('.ts', '.tsx', '.js', '.jsx', '.html', '.json')):
                p = os.path.join(r, f)
                try:
                    with open(p, 'r', encoding='utf-8') as fh:
                        c = fh.read()
                    matches = re.findall(r'https?://github\.com/[^\s"\'`<>)]+', c)
                    if matches:
                        print(f"{p} -> {set(matches)}")
                except Exception as e:
                    pass
