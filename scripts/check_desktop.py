import os
from pathlib import Path

desktop = Path(os.path.expanduser(r"~\Desktop"))
print(f"Listing Desktop ({desktop}):")
for item in desktop.glob("*"):
    print(" ", item.name)
