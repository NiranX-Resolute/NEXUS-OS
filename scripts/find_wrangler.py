import os

for root in ['.', 'web', 'apps', 'core', 'functions']:
    for r, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in ('node_modules', 'dist', '.git', '.venv', 'agents', 'out', 'vendor')]
        if 'wrangler.toml' in files:
            p = os.path.join(r, 'wrangler.toml')
            print(p)
