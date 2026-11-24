import os
from pathlib import Path

candidates = [
    r"C:\Program Files\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd",
    r"C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd",
    os.path.expandvars(r"%LOCALAPPDATA%\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"),
    os.path.expandvars(r"%USERPROFILE%\google-cloud-sdk\bin\gcloud.cmd"),
    os.path.expandvars(r"%APPDATA%\google-cloud-sdk\bin\gcloud.cmd"),
]

found = []
for c in candidates:
    if os.path.exists(c):
        found.append(c)
        print("Found gcloud at:", c)

if not found:
    # Quick search in Program Files and AppData
    for base in [r"C:\Program Files", r"C:\Program Files (x86)", os.path.expandvars(r"%LOCALAPPDATA%")]:
        p = Path(base)
        for g in p.glob("*Google*/**/gcloud.cmd"):
            print("Found via glob:", g)
