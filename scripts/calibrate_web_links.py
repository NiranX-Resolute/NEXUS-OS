import os
import re

replacements = [
    (re.compile(r'https?://github\.com/NiranX-music/Nexus-desktop-/?', re.IGNORECASE), 'https://github.com/NiranX-Resolute/NEXUS-OS'),
    (re.compile(r'https?://niranx-music\.github\.io/Nexus-desktop-/?', re.IGNORECASE), 'https://nexus-landing.pages.dev'),
    (re.compile(r'https?://github\.com/NiranX/NEXUS-OS/?', re.IGNORECASE), 'https://github.com/NiranX-Resolute/NEXUS-OS'),
]

ignore_dirs = {'node_modules', 'dist', '.git', '.venv', '__pycache__'}

modified_files = []

for root in ['web']:
    for r, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in ignore_dirs and not d.startswith('.')]
        for f in files:
            if f.endswith(('.html', '.js', '.ts', '.tsx', '.json', '.toml')):
                p = os.path.join(r, f)
                try:
                    with open(p, 'r', encoding='utf-8') as fh:
                        content = fh.read()
                    
                    new_content = content
                    for pattern, repl in replacements:
                        new_content = pattern.sub(repl, new_content)
                    
                    if new_content != content:
                        with open(p, 'w', encoding='utf-8') as fh:
                            fh.write(new_content)
                        modified_files.append(p)
                except Exception as e:
                    print(f"Error processing {p}: {e}")

print(f"Calibrated {len(modified_files)} files in web:")
for mf in modified_files:
    print(f"  - {mf}")
