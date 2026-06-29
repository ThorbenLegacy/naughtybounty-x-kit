from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
W, H = 300, 250
DISPLAY_DIR = ROOT / "creatives/html/display"

THEMES = {
    "dark": {
        "ad_bg": (30, 30, 44),
        "logo": "logo_darkmode.svg",
        "export_dir": "exports/display",
    },
    "light": {
        "ad_bg": (255, 255, 255),
        "logo": "logo_light.svg",
        "export_dir": "exports-light/display",
    },
    "pink": {
        "ad_bg": (24, 6, 16),
        "logo": "logo_darkmode.svg",
        "export_dir": "exports-pink/display",
    },
    "rose": {
        "ad_bg": (255, 245, 248),
        "logo": "logo_light.svg",
        "export_dir": "exports-rose/display",
    },
}


def theme_for_stem(stem: str) -> str:
    if stem.endswith("-light"):
        return "light"
    if stem.endswith("-rose"):
        return "rose"
    if stem.endswith("-pink"):
        return "pink"
    return "dark"


def export_one(stem: str) -> Path:
    theme = THEMES[theme_for_stem(stem)]
    html = DISPLAY_DIR / f"{stem}.html"
    if not html.exists():
        raise SystemExit(f"HTML fehlt: {html.relative_to(ROOT)}")

    standalone = html.with_name(f"{stem}-standalone.html")
    src = standalone if standalone.exists() else html
    out = ROOT / theme["export_dir"] / f"{stem}.png"
    out.parent.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_context(
            viewport={"width": W, "height": H},
            device_scale_factor=2,
        ).new_page()
        page.goto(src.resolve().as_uri(), wait_until="networkidle", timeout=60_000)
        page.wait_for_function("document.fonts.status === 'loaded'", timeout=30_000)
        page.wait_for_timeout(120)
        shot = page.locator(".ad-canvas").screenshot()
        browser.close()

    tmp = out.with_suffix(".raw.png")
    tmp.write_bytes(shot)
    img = Image.open(tmp)
    ad_bg = theme["ad_bg"]
    if img.mode == "RGBA":
        base = Image.new("RGBA", img.size, ad_bg + (255,))
        img = Image.alpha_composite(base, img).convert("RGB")
    else:
        img = img.convert("RGB")
    if img.size != (W, H):
        img = img.resize((W, H), Image.Resampling.LANCZOS)
    img.save(out, optimize=True)
    tmp.unlink(missing_ok=True)
    return out


def write_standalone(stem: str) -> None:
    import urllib.parse

    theme = THEMES[theme_for_stem(stem)]
    html = DISPLAY_DIR / f"{stem}.html"
    out = html.with_name(f"{stem}-standalone.html")
    logo_rel = f"../../../assets/{theme['logo']}"
    logo_uri = "data:image/svg+xml;charset=utf-8," + urllib.parse.quote(
        (ROOT / "assets" / theme["logo"]).read_text(encoding="utf-8"),
        safe="",
    )
    out.write_text(
        html.read_text(encoding="utf-8").replace(logo_rel, logo_uri),
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "stem",
        nargs="?",
        default="300x250-header-anonym",
        help="Dateiname ohne Endung in creatives/html/display/",
    )
    parser.add_argument("--all", action="store_true", help="Alle Display-Creatives exportieren")
    args = parser.parse_args()

    if args.all:
        stems = sorted(p.stem for p in DISPLAY_DIR.glob("*.html") if not p.name.endswith("-standalone.html"))
    else:
        stems = [args.stem]

    for stem in stems:
        write_standalone(stem)
        path = export_one(stem)
        print(path)


if __name__ == "__main__":
    main()
