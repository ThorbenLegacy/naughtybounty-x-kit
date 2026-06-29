"""Creative-PNGs vom deployed Dashboard lokal ziehen (exports + exports-light)."""

from __future__ import annotations

import base64
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def auth_header() -> dict[str, str]:
    user = os.environ.get("DASHBOARD_USER", "umbra")
    password = os.environ.get("DASHBOARD_PASSWORD", "")
    if not password:
        return {}
    token = base64.b64encode(f"{user}:{password}".encode()).decode("ascii")
    return {"Authorization": f"Basic {token}"}


def fetch_json(url: str) -> dict:
    headers = {"Accept": "application/json", **auth_header()}
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers=auth_header())
    with urllib.request.urlopen(req, timeout=120) as resp:
        dest.write_bytes(resp.read())


def main() -> None:
    base = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get("KIT_URL", "")).rstrip("/")
    if not base:
        print("Usage: python3 scripts/pull-assets.py https://your-app.up.railway.app")
        print("   or: KIT_URL=https://... DASHBOARD_PASSWORD=... npm run assets:pull")
        sys.exit(1)

    manifest_url = f"{base}/api/assets-manifest"
    print(f"Manifest: {manifest_url}")
    try:
        data = fetch_json(manifest_url)
    except urllib.error.HTTPError as e:
        print(f"Fehler {e.code}: {manifest_url}")
        sys.exit(1)

    files = data.get("files") or []
    if not files:
        print("Keine PNGs auf dem Server — dort zuerst npm run build:all ausführen.")
        sys.exit(1)

    ok = 0
    for rel in files:
        rel = rel.replace("\\", "/").lstrip("/")
        dest = ROOT / rel
        url = f"{base}/{rel}"
        try:
            download(url, dest)
            kb = dest.stat().st_size // 1024
            print(f"  {rel} ({kb} KB)")
            ok += 1
        except urllib.error.HTTPError as e:
            print(f"  SKIP {rel} — HTTP {e.code}")

    print(f"\nFertig — {ok}/{len(files)} Dateien nach {ROOT}")


if __name__ == "__main__":
    main()
