"""HTML bauen + PNG exportieren (Windows/Linux/macOS)."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "scripts"


def run(name: str) -> None:
    path = SCRIPTS / name
    print(f"\n=== {name} ===", flush=True)
    result = subprocess.run([sys.executable, str(path)], cwd=ROOT)
    if result.returncode != 0:
        sys.exit(result.returncode)


def main() -> None:
    run("build-creatives.py")
    run("export-png.py")
    run("build-week-schedule.py")
    print("\nFertig — Vorschau: creatives/preview.html · Wochenplan: schedule/woche-*.html")


if __name__ == "__main__":
    main()
