import os

for root in ['web']:
    for r, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in ('node_modules', 'dist', '.git', '.venv') and not d.startswith('.')]
        for f in files:
            if f.endswith(('.html', '.js', '.ts', '.tsx', '.json', '.toml')):
                p = os.path.join(r, f)
                try:
                    with open(p, 'r', encoding='utf-8') as fh:
                        c = fh.read()
                    if 'NEXUS-OSreleases' in c:
                        c = c.replace('NEXUS-OSreleases', 'NEXUS-OS/releases')
                        with open(p, 'w', encoding='utf-8') as fh:
                            fh.write(c)
                        print(f"Fixed slash in {p}")
                except Exception as e:
                    print(e)
