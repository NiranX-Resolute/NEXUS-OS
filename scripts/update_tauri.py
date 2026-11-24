path = 'apps/tauri/tauri.conf.json'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace('"identifier": "com.nexus.app"', '"identifier": "io.github.niranx-resolute.nexus-os"')
c = c.replace('"active": false', '"active": true,\n      "endpoints": ["https://github.com/NiranX-Resolute/NEXUS-OS/releases/latest/download/latest.json"]')
c = c.replace('"title": "NEXUS Desktop Runtime"', '"title": "NEXUS OS v5.0 Sovereign Desktop Runtime"')

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
print('Updated tauri.conf.json successfully')
