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
            ("creatives/html/custom/dark", "exports/custom"),
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
            ("creatives/html/custom/light", "exports-light/custom"),
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


def creative_to_paths(creative: str, theme_label: str) -> tuple[Path, Path, tuple[int, int, int]] | None:
    """Resolve HTML source + PNG output for one creative slug (e.g. brand/deine-regeln)."""
    theme = next((t for t in EXPORT_THEMES if t["label"] == theme_label), None)
    if not theme:
        return None
    kind, name = creative.split("/", 1)
    suffix = "-light" if theme_label == "light" else ""
    html_rel: str | None = None
    export_rel: str | None = None
    if kind == "brand":
        html_rel = f"creatives/html/brand{suffix}/x-brand-{name}.html"
        export_rel = f"exports-light/brand/{name}.png" if theme_label == "light" else f"exports/brand/{name}.png"
    elif kind == "brand-users":
        html_rel = f"creatives/html/brand-users{suffix}/x-brand-u-{name}.html"
        export_rel = f"exports-light/brand-users/{name}.png" if theme_label == "light" else f"exports/brand-users/{name}.png"
    elif kind == "bullets":
        slug = "default" if name == "default" else name
        html_rel = f"creatives/html/bullets{suffix}/x-bullets-{slug}.html"
        export_rel = f"exports-light/bullets/default.png" if theme_label == "light" else f"exports/bullets/default.png"
    elif kind == "bullets-users":
        html_rel = f"creatives/html/bullets-users{suffix}/x-bullets-u-default.html"
        export_rel = f"exports-light/bullets-users/default.png" if theme_label == "light" else f"exports/bullets-users/default.png"
    elif kind == "cards":
        html_rel = f"creatives/html/cards{suffix}/x-card-{name}.html"
        export_rel = f"exports-light/cards/{name}.png" if theme_label == "light" else f"exports/cards/{name}.png"
    elif kind == "custom":
        html_rel = f"creatives/html/custom/{theme_label}/{name}.html"
        export_rel = f"exports-light/custom/{name}.png" if theme_label == "light" else f"exports/custom/{name}.png"
    else:
        return None
    html = ROOT / html_rel
    out = ROOT / export_rel
    return html, out, theme["ad_bg"]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scale", type=int, default=2)
    parser.add_argument("--creative", type=str, help="Einzelnes Creative, z.B. brand/deine-regeln")
    parser.add_argument("--theme", choices=["dark", "light", "both"], default="both")
    args = parser.parse_args()

    if args.creative:
        themes = ["dark", "light"] if args.theme == "both" else [args.theme]
        for theme_label in themes:
            resolved = creative_to_paths(args.creative, theme_label)
            if not resolved:
                print(f"Unbekanntes Creative: {args.creative}")
                raise SystemExit(1)
            html, out, ad_bg = resolved
            if not html.exists():
                print(f"HTML fehlt: {html.relative_to(ROOT)} — npm run build")
                raise SystemExit(1)
            print(f"Export {theme_label} … {args.creative}")
            export_one(html, out, ad_bg, args.scale)
        print("Fertig.")
        return

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
