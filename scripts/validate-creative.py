"""Creative-Layout und PNG vor X-Upload prüfen (Overlap, Größe)."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
W, H = 1200, 675


def html_for_png(png: Path) -> Path | None:
    name = png.stem
    for folder in ("brand", "brand-users", "bullets", "bullets-users", "cards"):
        html_dir = ROOT / "creatives" / "html" / folder
        if folder == "brand-users":
            candidate = html_dir / f"x-brand-u-{name}-standalone.html"
        elif folder == "brand":
            candidate = html_dir / f"x-brand-{name}-standalone.html"
        elif folder == "bullets":
            if name != "default":
                continue
            candidate = html_dir / "x-bullets-default-standalone.html"
        elif folder == "bullets-users":
            candidate = html_dir / f"x-bullets-u-{name}-standalone.html"
        elif folder == "cards":
            candidate = html_dir / f"x-card-{name}-standalone.html"
        if candidate.exists():
            return candidate
    return None


def check_layout(html: Path) -> list[str]:
    errors: list[str] = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_context(viewport={"width": W, "height": H}).new_page()
        page.goto(html.resolve().as_uri(), wait_until="networkidle", timeout=60_000)
        page.wait_for_function("document.fonts.status === 'loaded'", timeout=30_000)
        result = page.evaluate(
            """() => {
          const canvas = document.querySelector('.ad-canvas');
          const tagline = document.querySelector('.tagline, .headline');
          const trust = document.querySelector('.trust, .url-line');
          const logo = document.querySelector('.logo');
          const issues = [];
          const cb = canvas?.getBoundingClientRect();
          if (!cb) return { issues: ['Kein .ad-canvas gefunden'] };

          function rect(el) {
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height };
          }

          const t = rect(tagline);
          const tr = rect(trust);
          const lg = rect(logo);
          const ct = rect(document.querySelector('.cta'));

          if (t && tr && t.bottom > tr.top + 2) {
            issues.push(`Text überlappt Footer (${Math.round(t.bottom - tr.top)}px)`);
          }
          if (ct && tr && ct.bottom > tr.top + 2) {
            issues.push(`CTA überlappt Link (${Math.round(ct.bottom - tr.top)}px)`);
          }
          if (ct && tr && tr.top - ct.bottom < 8) {
            issues.push(`CTA zu nah am Link (${Math.round(tr.top - ct.bottom)}px Abstand)`);
          }
          if (lg && t && lg.bottom > t.top + 4) {
            issues.push('Logo überlappt Headline');
          }
          if (t && t.bottom > cb.bottom - 8) {
            issues.push('Headline ragt aus Canvas');
          }
          if (tr && tr.bottom > cb.bottom + 1) {
            issues.push('Footer ragt aus Canvas');
          }
          return { issues };
        }"""
        )
        browser.close()
    errors.extend(result.get("issues", []))
    return errors


def check_png(png: Path) -> list[str]:
    errors: list[str] = []
    if not png.exists():
        return [f"PNG fehlt: {png}"]
    with Image.open(png) as img:
        if img.size != (W, H):
            errors.append(f"PNG-Größe {img.size[0]}×{img.size[1]}, erwartet {W}×{H}")
    html = html_for_png(png)
    if html and html.stat().st_mtime > png.stat().st_mtime + 1:
        errors.append(f"PNG älter als HTML — bitte exportieren: {png.name}")
    return errors


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("png", type=Path, help="Pfad zum PNG (relativ zum Kit-Root oder absolut)")
    args = parser.parse_args()

    png = args.png if args.png.is_absolute() else ROOT / args.png
    errors = check_png(png)

    html = html_for_png(png)
    if html:
        errors.extend(check_layout(html))
    elif not errors:
        print(f"Hinweis: Kein Standalone-HTML für {png.name} — nur PNG-Größe geprüft.")

    if errors:
        print("Creative-Validierung fehlgeschlagen:")
        for err in errors:
            print(f"  X {err}")
        sys.exit(1)

    print(f"OK Creative: {png.relative_to(ROOT) if png.is_relative_to(ROOT) else png}")


if __name__ == "__main__":
    main()
