"""HTML-Creatives für X (1200×675) bauen — Dark + Light (for-creators)."""

from __future__ import annotations

import json
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
CONFIG = ROOT / "config"

W, H = 1200, 675

TRUST = "18+ only · Verifiziert · Du behältst die Kontrolle"
URL = "naughtybounty.com/for-creators"
BRAND_SUBTITLE = "Adult-Challenge-Marketplace"

ICON_PACKAGE = '<svg viewBox="0 0 24 24"><path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.29 7 9 5 9-5"/></svg>'
ICON_FLAME = '<svg viewBox="0 0 24 24"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>'
ICON_REPEAT = '<svg viewBox="0 0 24 24"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>'

THEMES: dict[str, dict] = {
    "dark": {
        "id": "dark",
        "html_suffix": "",
        "export_prefix": "exports",
        "ad_bg": (30, 30, 44),
        "logo_file": "logo_darkmode.svg",
        "background": "#1e1e2c",
        "foreground": "#f4f4fc",
        "muted": "#9e9ebc",
        "primary": "#a78bfa",
        "primary_fg": "#f4f4fc",
        "border": "#3c3c58",
        "badge_bg": "rgba(40, 40, 62, 0.85)",
        "brand_glow": "radial-gradient(circle at 50% 40%, rgba(167, 139, 250, 0.16), transparent 58%)",
        "bullets_glow": "radial-gradient(circle at 70% 20%, rgba(167, 139, 250, 0.15), transparent 55%)",
        "logo_shadow": "0 12px 40px rgba(167, 139, 250, 0.22)",
        "accent_shadow": "0 4px 20px rgba(167, 139, 250, 0.28)",
        "accent_shadow_sm": "0 4px 16px rgba(167, 139, 250, 0.28)",
        "cta_shadow": "0 6px 24px rgba(167, 139, 250, 0.25)",
        "kicker_bg": "rgba(167, 139, 250, 0.12)",
        "kicker_border": "rgba(167, 139, 250, 0.35)",
    },
    "light": {
        "id": "light",
        "html_suffix": "-light",
        "export_prefix": "exports-light",
        "ad_bg": (255, 255, 255),
        "logo_file": "logo_light.svg",
        "background": "#ffffff",
        "foreground": "#18181b",
        "muted": "#71717a",
        "primary": "#7511bd",
        "primary_fg": "#ffffff",
        "border": "#e4e4e7",
        "badge_bg": "#f4f4f5",
        "brand_glow": "radial-gradient(circle at 50% 40%, rgba(117, 17, 189, 0.08), transparent 58%)",
        "bullets_glow": "radial-gradient(circle at 70% 20%, rgba(117, 17, 189, 0.07), transparent 55%)",
        "logo_shadow": "0 12px 40px rgba(117, 17, 189, 0.14)",
        "accent_shadow": "0 4px 20px rgba(117, 17, 189, 0.22)",
        "accent_shadow_sm": "0 4px 16px rgba(117, 17, 189, 0.2)",
        "cta_shadow": "0 6px 24px rgba(117, 17, 189, 0.18)",
        "kicker_bg": "rgba(117, 17, 189, 0.08)",
        "kicker_border": "rgba(117, 17, 189, 0.25)",
    },
}


def svg_data_uri(path: Path) -> str:
    raw = path.read_text(encoding="utf-8")
    enc = urllib.parse.quote(raw, safe="")
    return f"data:image/svg+xml;charset=utf-8,{enc}"


LOGO_CTA = svg_data_uri(ASSETS / "logo_small_light.svg")
LOGO_CTA_REL = "../../../assets/logo_small_light.svg"


def brand_css(t: dict) -> str:
    return f"""
    :root {{
      --background: {t["background"]};
      --foreground: {t["foreground"]};
      --muted-foreground: {t["muted"]};
      --primary: {t["primary"]};
      --primary-foreground: {t["primary_fg"]};
      --radius-2xl: 16px;
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    html, body {{ width: 1200px; height: 675px; overflow: hidden; }}
    body {{
      font-family: Figtree, ui-sans-serif, system-ui, sans-serif;
      -webkit-font-smoothing: antialiased;
      background: var(--background);
      color: var(--foreground);
    }}
    .ad-canvas {{
      width: 1200px; height: 675px; overflow: hidden; position: relative;
    }}
    .ad-canvas::before {{
      content: "";
      position: absolute; inset: -30%;
      background: {t["brand_glow"]};
      pointer-events: none;
    }}
    .banner {{
      position: relative; z-index: 1;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 16px; width: 1200px; height: 675px;
      padding: 22px 48px 52px; text-decoration: none; color: inherit;
    }}
    .logo {{
      width: var(--logo-size, 360px); height: var(--logo-size, 360px);
      object-fit: contain; flex-shrink: 0;
      filter: drop-shadow({t["logo_shadow"]});
    }}
    .brand-lockup {{
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      text-align: center; flex-shrink: 0;
    }}
    .brand-name-center {{
      font-size: 28px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.1;
    }}
    .brand-subtitle-center {{
      font-size: 16px; font-weight: 600; letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--muted-foreground); line-height: 1.15;
    }}
    .tagline {{
      max-width: 1050px; text-align: center; flex-shrink: 0;
      font-weight: 900; line-height: 1.05; letter-spacing: -0.025em;
      color: var(--foreground);
    }}
    .accent-wrap {{ display: inline-flex; align-items: baseline; }}
    .accent {{
      border-radius: var(--radius-2xl); background: var(--primary);
      color: var(--primary-foreground); padding: 0 20px;
      box-shadow: {t["accent_shadow"]};
    }}
    .trust {{
      position: absolute; bottom: 28px; left: 0; right: 0;
      text-align: center; font-size: 15px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--muted-foreground);
    }}
"""


def bullets_css(t: dict) -> str:
    return f"""
    :root {{
      --background: {t["background"]};
      --foreground: {t["foreground"]};
      --muted-foreground: {t["muted"]};
      --primary: {t["primary"]};
      --primary-foreground: {t["primary_fg"]};
      --border: {t["border"]};
      --radius-xl: 12px;
      --radius-2xl: 16px;
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    html, body {{ width: 1200px; height: 675px; overflow: hidden; }}
    body {{
      font-family: Figtree, ui-sans-serif, system-ui, sans-serif;
      -webkit-font-smoothing: antialiased;
      background: var(--background);
      color: var(--foreground);
    }}
    .ad-canvas {{ width: 1200px; height: 675px; overflow: hidden; position: relative; }}
    .ad-canvas::before {{
      content: "";
      position: absolute; inset: -40%;
      background: {t["bullets_glow"]};
      pointer-events: none; z-index: 0;
    }}
    .banner {{
      position: relative; z-index: 1;
      display: flex; flex-direction: column;
      width: 1200px; height: 675px;
      padding: 36px 56px 24px; text-decoration: none; color: inherit;
    }}
    .brand-row {{
      display: flex; align-items: center; gap: 16px;
      flex-shrink: 0; margin-bottom: 28px;
    }}
    .brand-row img {{
      width: 56px; height: 56px; object-fit: contain; flex-shrink: 0;
    }}
    .brand-text {{
      display: flex; flex-direction: column; gap: 4px; min-width: 0;
    }}
    .brand-name {{
      font-size: 24px; font-weight: 800;
      letter-spacing: -0.02em; line-height: 1.1;
    }}
    .brand-tagline {{
      font-size: 15px; font-weight: 600;
      letter-spacing: 0.08em; line-height: 1.15;
      text-transform: uppercase;
      color: var(--muted-foreground);
    }}
    .headline {{
      font-size: 46px; font-weight: 900; line-height: 0.95;
      letter-spacing: -0.025em; margin-bottom: 32px;
    }}
    .accent-wrap {{ display: inline-flex; align-items: baseline; }}
    .accent {{
      border-radius: var(--radius-2xl); background: var(--primary);
      color: var(--primary-foreground); padding: 0 16px;
      box-shadow: {t["accent_shadow_sm"]};
    }}
    .bullets {{
      display: flex; flex-direction: column; gap: 18px; flex: 1;
      min-height: 0;
      padding-top: 20px; border-top: 1px solid var(--border);
    }}
    .bullet {{ display: flex; align-items: flex-start; gap: 18px; }}
    .bullet-icon {{
      width: 36px; height: 36px; flex-shrink: 0; margin-top: 4px;
      color: var(--primary);
    }}
    .bullet-icon svg {{ width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-width: 2; }}
    .bullet-title {{ font-size: 28px; font-weight: 700; line-height: 1.15; }}
    .bullet-desc {{ font-size: 22px; color: var(--muted-foreground); margin-top: 4px; line-height: 1.3; }}
    .badges {{ margin-top: 14px; margin-bottom: 0; flex-shrink: 0; }}
    .badge {{
      display: inline-flex; padding: 10px 22px; border-radius: 999px;
      border: 1px solid var(--border); background: {t["badge_bg"]};
      font-size: 20px; font-weight: 600; color: var(--foreground);
    }}
    .cta {{
      display: inline-flex; align-items: center; justify-content: center; gap: 14px;
      width: 100%; height: 68px; border-radius: var(--radius-xl);
      background: var(--primary); color: var(--primary-foreground);
      font-size: 26px; font-weight: 700; flex-shrink: 0;
      box-shadow: {t["cta_shadow"]};
    }}
    .cta-logo {{ width: 28px; height: 34px; object-fit: contain; }}
    .cta svg {{ width: 28px; height: 28px; stroke: currentColor; fill: none; stroke-width: 2; }}
    .footer-area {{
      margin-top: auto; flex-shrink: 0;
      display: flex; flex-direction: column; gap: 14px;
      padding-top: 14px;
    }}
    .url-line {{
      text-align: center;
      font-size: 13px; font-weight: 600; letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--muted-foreground);
      line-height: 1.2; flex-shrink: 0;
    }}
    .kicker {{
      display: inline-flex; padding: 8px 16px; border-radius: 999px;
      background: {t["kicker_bg"]}; border: 1px solid {t["kicker_border"]};
      font-size: 13px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;
      color: var(--primary); margin-bottom: 18px; width: fit-content;
    }}
"""


def brand_html(
    title: str,
    tagline: str,
    font_size: int,
    logo_uri: str,
    css: str,
    href: str = "https://naughtybounty.com/for-creators",
    trust: str = TRUST,
    logo_size: int = 360,
) -> str:
    return f"""<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=1200, height=675" />
  <title>NaughtyBounty — {title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Figtree:wght@600;700;900&display=swap" rel="stylesheet" />
  <style>{css}
    .ad-canvas {{ --logo-size: {logo_size}px; }}
    .tagline {{ font-size: {font_size}px; }}
  </style>
</head>
<body>
  <div class="ad-canvas">
    <a class="banner" href="{href}">
      <img class="logo" src="{logo_uri}" alt="NaughtyBounty" width="{logo_size}" height="{logo_size}" />
      <div class="brand-lockup">
        <span class="brand-name-center">NaughtyBounty</span>
        <span class="brand-subtitle-center">{BRAND_SUBTITLE}</span>
      </div>
      <h1 class="tagline">{tagline}</h1>
    </a>
    <p class="trust">{trust}</p>
  </div>
</body>
</html>
"""


def bullets_html(cfg: dict, logo_main: str, logo_cta: str, css: str) -> str:
    bullets_html_parts = []
    icons = [ICON_PACKAGE, ICON_FLAME, ICON_REPEAT]
    for i, b in enumerate(cfg["bullets"]):
        bullets_html_parts.append(f"""
        <div class="bullet">
          <span class="bullet-icon" aria-hidden="true">{icons[i % len(icons)]}</span>
          <div>
            <div class="bullet-title">{b["title"]}</div>
            <div class="bullet-desc">{b["description"]}</div>
          </div>
        </div>""")

    href = cfg.get("href", "https://naughtybounty.com/for-creators")
    brand_tagline = cfg.get("brandTagline", BRAND_SUBTITLE)
    url_line = cfg.get("urlLine", URL)
    headline_post = cfg.get("headlinePost", "")

    return f"""<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=1200, height=675" />
  <title>NaughtyBounty — Bullets</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Figtree:wght@600;700;900&display=swap" rel="stylesheet" />
  <style>{css}</style>
</head>
<body>
  <div class="ad-canvas">
    <a class="banner" href="{href}">
      <div class="brand-row">
        <img src="{logo_main}" alt="NaughtyBounty" width="56" height="56" />
        <div class="brand-text">
          <span class="brand-name">NaughtyBounty</span>
          <span class="brand-tagline">{brand_tagline}</span>
        </div>
      </div>
      <h1 class="headline">
        {cfg["headlinePre"]}
        <span class="accent-wrap"><span class="accent">{cfg["headlineAccent"]}</span></span>{headline_post}
      </h1>
      <div class="bullets">{"".join(bullets_html_parts)}
      </div>
      <div class="badges"><span class="badge">{cfg["badge"]}</span></div>
      <div class="footer-area">
        <div class="cta">
          <img class="cta-logo" src="{logo_cta}" alt="" width="28" height="34" />
          {cfg["cta"]}
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
        </div>
        <p class="url-line">{url_line}</p>
      </div>
    </a>
  </div>
</body>
</html>
"""


def card_html(cfg: dict, logo_main: str, logo_cta: str, css: str) -> str:
    parts = []
    icons = [ICON_PACKAGE, ICON_FLAME, ICON_REPEAT]
    for i, p in enumerate(cfg["points"]):
        parts.append(f"""
        <div class="bullet">
          <span class="bullet-icon" aria-hidden="true">{icons[i % len(icons)]}</span>
          <div>
            <div class="bullet-title">{p["title"]}</div>
            <div class="bullet-desc">{p["description"]}</div>
          </div>
        </div>""")

    headline_post = cfg.get("headlinePost", "")
    brand_tagline = cfg.get("brandTagline", BRAND_SUBTITLE)
    url_line = cfg.get("urlLine", URL)
    return f"""<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=1200, height=675" />
  <title>NaughtyBounty — {cfg.get("kicker", "Card")}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Figtree:wght@600;700;900&display=swap" rel="stylesheet" />
  <style>{css}</style>
</head>
<body>
  <div class="ad-canvas">
    <a class="banner" href="{cfg["href"]}">
      <div class="brand-row">
        <img src="{logo_main}" alt="NaughtyBounty" width="56" height="56" />
        <div class="brand-text">
          <span class="brand-name">NaughtyBounty</span>
          <span class="brand-tagline">{brand_tagline}</span>
        </div>
      </div>
      <span class="kicker">{cfg["kicker"]}</span>
      <h1 class="headline">
        {cfg["headlinePre"]}
        <span class="accent-wrap"><span class="accent">{cfg["headlineAccent"]}</span></span>{headline_post}
      </h1>
      <div class="bullets">{"".join(parts)}
      </div>
      <div class="badges"><span class="badge">{cfg["badge"]}</span></div>
      <div class="footer-area">
        <div class="cta">
          <img class="cta-logo" src="{logo_cta}" alt="" width="28" height="34" />
          {cfg["cta"]}
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
        </div>
        <p class="url-line">{url_line}</p>
      </div>
    </a>
  </div>
</body>
</html>
"""


def write_standalone(src: Path, logo_main_uri: str, logo_main_rel: str, logo_cta_uri: str) -> None:
    content = src.read_text(encoding="utf-8")
    out = src.with_name(src.stem + "-standalone.html")
    for old in (logo_main_rel, "../../assets/logo_darkmode.svg", "../../assets/logo_light.svg",
                "assets/logo_darkmode.svg", "assets/logo_light.svg"):
        content = content.replace(old, logo_main_uri)
    for old in (LOGO_CTA_REL, "../../assets/logo_small_light.svg", "assets/logo_small_light.svg"):
        content = content.replace(old, logo_cta_uri)
    out.write_text(content, encoding="utf-8")


def build_preview(brand_files: list[str]) -> None:
    def brand_card(name: str, theme: dict) -> str:
        slug = Path(name).stem.replace("x-brand-", "")
        folder = f"brand{theme['html_suffix']}"
        export = theme["export_prefix"]
        return f"""      <article class="card">
        <h3>{slug} <span class="scheme">{theme['id']}</span></h3>
        <iframe src="html/{folder}/{Path(name).stem}-standalone.html" width="600" height="338" title="{slug}"></iframe>
        <p class="links">
          <a href="../{export}/brand/{slug}.png" target="_blank" rel="noopener">PNG öffnen</a>
          · <a href="html/{folder}/{Path(name).stem}-standalone.html" target="_blank" rel="noopener">HTML</a>
        </p>
        <img class="png-preview" src="../{export}/brand/{slug}.png" alt="PNG {slug}" loading="lazy"
             onerror="this.hidden=true;this.nextElementSibling.hidden=false" />
        <p class="png-missing" hidden>PNG fehlt — <code>npm run export</code></p>
      </article>"""

    dark, light = THEMES["dark"], THEMES["light"]
    brand_dark = "\n".join(brand_card(f, dark) for f in brand_files)
    brand_light = "\n".join(brand_card(f, light) for f in brand_files)

    preview = f"""<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>NaughtyBounty X-Kit — Preview</title>
  <style>
    body {{ font-family: system-ui, sans-serif; background: #14141f; color: #eee; padding: 24px; }}
    h1, h2 {{ color: #a78bfa; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(620px, 1fr)); gap: 20px; }}
    .card {{ background: #1e1e2c; padding: 16px; border-radius: 12px; }}
    iframe {{ border: 0; border-radius: 8px; width: 100%; max-width: 600px; aspect-ratio: 16/9; background: #1e1e2c; }}
    a {{ color: #a78bfa; }}
    .lead, .hint {{ color: #9e9ebc; max-width: 52rem; line-height: 1.5; }}
    .hint {{ margin: 12px 0 24px; padding: 12px 16px; background: #28283e; border-radius: 8px; border: 1px solid #3c3c58; }}
    .hint code {{ color: #f4f4fc; background: #1e1e2c; padding: 2px 6px; border-radius: 4px; }}
    .links {{ margin: 10px 0 8px; font-size: 14px; }}
    .png-preview {{ display: block; width: 100%; max-width: 600px; border-radius: 8px; margin-top: 8px; border: 1px solid #3c3c58; }}
    .png-missing {{ font-size: 13px; color: #f59e0b; margin-top: 8px; }}
    .scheme {{ font-size: 11px; font-weight: 700; text-transform: uppercase; color: #71717a; background: #28283e; padding: 2px 8px; border-radius: 999px; margin-left: 6px; }}
  </style>
</head>
<body>
  <h1>NaughtyBounty X-Kit</h1>
  <p class="lead">Creatives 1200×675 · Dark + Light (for-creators)</p>
  <p class="hint">PNGs: <code>npm run build:all</code> · Wochenplan wechselt Dark/Light ab.</p>
  <h2>Brand — Dark</h2>
  <div class="grid">{brand_dark}</div>
  <h2>Brand — Light</h2>
  <div class="grid">{brand_light}</div>
</body>
</html>
"""
    (ROOT / "creatives" / "preview.html").write_text(preview, encoding="utf-8")


def build_theme(theme: dict, brand_files_out: list[str]) -> None:
    suffix = theme["html_suffix"]
    logo_uri = svg_data_uri(ASSETS / theme["logo_file"])
    logo_rel = f"../../../assets/{theme['logo_file']}"
    b_css = brand_css(theme)
    bl_css = bullets_css(theme)

    dirs = {
        "brand": ROOT / "creatives" / "html" / f"brand{suffix}",
        "brand-users": ROOT / "creatives" / "html" / f"brand-users{suffix}",
        "bullets": ROOT / "creatives" / "html" / f"bullets{suffix}",
        "bullets-users": ROOT / "creatives" / "html" / f"bullets-users{suffix}",
        "cards": ROOT / "creatives" / "html" / f"cards{suffix}",
    }
    for d in dirs.values():
        d.mkdir(parents=True, exist_ok=True)

    label = theme["id"]
    print(f"\n  [{label}]")

    if theme["id"] == "dark":
        brand_files_out.clear()

    for v in json.loads((CONFIG / "brand-variants.json").read_text(encoding="utf-8")):
        html = brand_html(
            v["title"], v["tagline"], v["fontSize"], logo_rel, b_css,
            logo_size=v.get("logoSize", 360),
        )
        path = dirs["brand"] / f"x-brand-{v['id']}.html"
        path.write_text(html, encoding="utf-8")
        write_standalone(path, logo_uri, logo_rel, LOGO_CTA)
        if theme["id"] == "dark":
            brand_files_out.append(path.name)
        print(f"    brand{suffix}/{path.name}")

    for v in json.loads((CONFIG / "brand-variants-users.json").read_text(encoding="utf-8")):
        html = brand_html(
            v["title"], v["tagline"], v["fontSize"], logo_rel, b_css,
            href=v.get("href", "https://naughtybounty.com"),
            trust=v.get("trust", TRUST),
            logo_size=v.get("logoSize", 360),
        )
        path = dirs["brand-users"] / f"x-brand-u-{v['id']}.html"
        path.write_text(html, encoding="utf-8")
        write_standalone(path, logo_uri, logo_rel, LOGO_CTA)
        print(f"    brand-users{suffix}/{path.name}")

    bullets_path = dirs["bullets"] / "x-bullets-default.html"
    bullets_path.write_text(
        bullets_html(json.loads((CONFIG / "bullets-default.json").read_text(encoding="utf-8")), logo_rel, LOGO_CTA_REL, bl_css),
        encoding="utf-8",
    )
    write_standalone(bullets_path, logo_uri, logo_rel, LOGO_CTA)
    print(f"    bullets{suffix}/{bullets_path.name}")

    bullets_u_path = dirs["bullets-users"] / "x-bullets-u-default.html"
    bullets_u_path.write_text(
        bullets_html(json.loads((CONFIG / "bullets-users.json").read_text(encoding="utf-8")), logo_rel, LOGO_CTA_REL, bl_css),
        encoding="utf-8",
    )
    write_standalone(bullets_u_path, logo_uri, logo_rel, LOGO_CTA)
    print(f"    bullets-users{suffix}/{bullets_u_path.name}")

    for src in (CONFIG / "content" / "cards-creators.json", CONFIG / "content" / "cards-users.json"):
        for card in json.loads(src.read_text(encoding="utf-8")):
            path = dirs["cards"] / f"x-card-{card['id']}.html"
            path.write_text(card_html(card, logo_rel, LOGO_CTA_REL, bl_css), encoding="utf-8")
            write_standalone(path, logo_uri, logo_rel, LOGO_CTA)
            print(f"    cards{suffix}/{path.name}")


def main() -> None:
    brand_files: list[str] = []
    for theme in THEMES.values():
        build_theme(theme, brand_files)
    build_preview(brand_files)
    print("\nWrote creatives/preview.html (dark + light)")


if __name__ == "__main__":
    main()
