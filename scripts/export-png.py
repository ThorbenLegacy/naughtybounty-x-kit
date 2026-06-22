"""PNG-Export für alle X-Creatives (1200×675) via Playwright — Dark + Light."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
W, H = 1200, 675

EXPORT_THEMES = [
    {
        "label": "dark",
        "ad_bg": (30, 30, 44),
        "jobs": [
            ("creatives/html/brand", "exports/brand"),
            ("creatives/html/brand-users", "exports/brand-users"),
            ("creatives/html/bullets", "exports/bullets"),
            ("creatives/html/bullets-users", "exports/bullets-users"),
            ("creatives/html/cards", "exports/cards"),
        ],
    },
    {
        "label": "light",
        "ad_bg": (255, 255, 255),
        "jobs": [
            ("creatives/html/brand-light", "exports-light/brand"),
            ("creatives/html/brand-users-light", "exports-light/brand-users"),
            ("creatives/html/bullets-light", "exports-light/bullets"),
            ("creatives/html/bullets-users-light", "exports-light/bullets-users"),
            ("creatives/html/cards-light", "exports-light/cards"),
        ],
    },
]


def flatten(img: Image.Image, ad_bg: tuple[int, int, int]) -> Image.Image:
    if img.mode == "RGBA":
        base = Image.new("RGBA", img.size, ad_bg + (255,))
        return Image.alpha_composite(base, img).convert("RGB")
    return img.convert("RGB")


def export_one(html: Path, out: Path, ad_bg: tuple[int, int, int], scale: int = 2) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    standalone = html.with_name(html.stem + "-standalone.html")
    src = standalone if standalone.exists() else html

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_context(
            viewport={"width": W, "height": H},
            device_scale_factor=scale,
        ).new_page()
        page.goto(src.resolve().as_uri(), wait_until="networkidle", timeout=60_000)
        page.wait_for_function("document.fonts.status === 'loaded'", timeout=30_000)
        page.evaluate(
            """() => {
          for (const el of document.querySelectorAll('[class*="anim-"]')) {
            el.style.animation = 'none'; el.style.opacity = '1'; el.style.transform = 'none';
          }
        }"""
        )
        page.wait_for_timeout(120)
        shot = page.locator(".ad-canvas").screenshot()
        browser.close()

    tmp = out.with_suffix(".raw.png")
    tmp.write_bytes(shot)
    img = flatten(Image.open(tmp), ad_bg)
    if scale != 1:
        img = img.resize((W, H), Image.Resampling.LANCZOS)
    img.save(out, optimize=True)
    tmp.unlink(missing_ok=True)
    kb = out.stat().st_size // 1024
    print(f"  {out.relative_to(ROOT)} ({kb} KB)")


def stem_to_id(stem: str) -> str:
    for prefix in ("x-brand-u-", "x-brand-", "x-bullets-u-", "x-bullets-", "x-card-"):
        if stem.startswith(prefix):
            return stem[len(prefix):]
    return stem


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scale", type=int, default=2)
    args = parser.parse_args()

    for theme in EXPORT_THEMES:
        print(f"\nExport {theme['label']} …")
        for html_rel, export_rel in theme["jobs"]:
            html_dir = ROOT / html_rel
            export_dir = ROOT / export_rel
            if not html_dir.exists():
                continue
            label = export_rel.split("/")[-1]
            print(f"  {label} …")
            for html in sorted(html_dir.glob("*.html")):
                if html.name.endswith("-standalone.html"):
                    continue
                slug = stem_to_id(html.stem)
                export_one(html, export_dir / f"{slug}.png", theme["ad_bg"], args.scale)

    print("\nFertig.")


if __name__ == "__main__":
    main()
