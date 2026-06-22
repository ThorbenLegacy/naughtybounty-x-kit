"""Wochenplan-HTML + posts-week.json aus config/weeks/*.json erzeugen."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEEKS = ROOT / "config" / "weeks"
SCHEDULE_DIR = ROOT / "schedule"
POSTS_WEEK = ROOT / "posts-week.json"


def creative_to_html(creative: str, color_scheme: str = "dark") -> str:
    suffix = "-light" if color_scheme == "light" else ""
    kind, name = creative.split("/", 1)
    if kind == "brand":
        return f"../creatives/html/brand{suffix}/x-brand-{name}-standalone.html"
    if kind == "brand-users":
        return f"../creatives/html/brand-users{suffix}/x-brand-u-{name}-standalone.html"
    if kind == "bullets":
        slug = "default" if name == "default" else name
        return f"../creatives/html/bullets{suffix}/x-bullets-{slug}-standalone.html"
    if kind == "bullets-users":
        return f"../creatives/html/bullets-users{suffix}/x-bullets-u-default-standalone.html"
    if kind == "cards":
        return f"../creatives/html/cards{suffix}/x-card-{name}-standalone.html"
    return ""


def image_for_scheme(image: str | None, color_scheme: str) -> str | None:
    if not image:
        return image
    if color_scheme == "light":
        return image.replace("exports/", "exports-light/", 1)
    return image


def audience_badge(audience: str) -> str:
    return "Creators" if audience == "creators" else "Users"


def theme_class(theme: str) -> str:
    t = theme.lower().replace(" ", "-")
    return f"theme-{t}"


def hashtags_for(audience: str, theme: str) -> list[str]:
    theme_l = theme.lower()
    if audience == "creators":
        if "fact" in theme_l:
            return ["OnlyFans", "CreatorEconomy", "AdultCreator", "NaughtyBounty"]
        if "content" in theme_l or "tipp" in theme_l:
            return ["CreatorTips", "ContentMonetization", "NaughtyBounty"]
        if "function" in theme_l:
            return ["Challenges", "Drops", "NaughtyBounty"]
        if "bullet" in theme_l:
            return ["MonetizeContent", "AdultCreator", "NaughtyBounty"]
        return ["Creator", "ContentCreator", "OnlyFansAlternative", "NaughtyBounty"]
    if "how" in theme_l:
        return ["CustomContent", "Challenge", "AdultContent", "NaughtyBounty"]
    if "fact" in theme_l:
        return ["OnlyFansAlternative", "Escrow", "VerifiedCreators", "NaughtyBounty"]
    if "bullet" in theme_l:
        return ["CustomContent", "Challenge", "NaughtyBounty"]
    return ["CustomContent", "AdultContent", "NaughtyBounty"]


def format_tweet_preview(post: dict, default_link: str) -> str:
    link = post.get("link") or default_link
    tags = post.get("hashtags") or hashtags_for(post["audience"], post["theme"])
    tag_str = " ".join(f"#{t.lstrip('#')}" for t in tags)
    return f"{post['text']}\n\n{link}\n\n@naughtybounty {tag_str}"


def build_week(week_path: Path) -> None:
    week = json.loads(week_path.read_text(encoding="utf-8"))
    slots = week.get("slots", ["08:00", "14:00", "19:00"])
    posts_out: list[dict] = []

    day_blocks: list[str] = []
    post_index = 0
    for day in week["days"]:
        rows: list[str] = []
        for post in day["posts"]:
            tags = post.get("hashtags") or hashtags_for(post["audience"], post["theme"])
            color_scheme = post.get("colorScheme") or ("light" if post_index % 2 else "dark")
            post_index += 1
            img = image_for_scheme(post.get("image"), color_scheme)
            post_full = {**post, "hashtags": tags, "colorScheme": color_scheme, "image": img}
            posts_out.append({
                "id": post["id"],
                "text": post["text"],
                "image": img,
                "link": post.get("link", "https://naughtybounty.com/for-creators"),
                "hashtags": tags,
                "colorScheme": color_scheme,
            })
            html = creative_to_html(post["creative"], color_scheme)
            png = f"../{img}" if img else ""
            scheme_badge = f'<span class="scheme scheme-{color_scheme}">{color_scheme}</span>'
            tweet_preview = format_tweet_preview(
                post_full, week.get("defaultLink", "https://naughtybounty.com/for-creators")
            )
            rows.append(f"""
        <article class="post-card {theme_class(post['theme'])}">
          <div class="post-meta">
            <span class="time">{post['time']}</span>
            <span class="audience aud-{post['audience']}">{audience_badge(post['audience'])}</span>
            <span class="theme">{post['theme']}</span>
            {scheme_badge}
          </div>
          <h4>{post['id']}</h4>
          <iframe src="{html}" title="{post['theme']}" loading="lazy"></iframe>
          <blockquote class="tweet">{tweet_preview.replace(chr(10), '<br>')}</blockquote>
          <p class="links">
            <a href="{png}" target="_blank" rel="noopener">PNG</a>
            · <a href="{html}" target="_blank" rel="noopener">HTML</a>
            · <a href="{post.get('link', '#')}" target="_blank" rel="noopener">Link</a>
          </p>
        </article>""")

        day_blocks.append(f"""
    <section class="day">
      <h2>{day['label']} · {day['date']}</h2>
      <div class="posts">{''.join(rows)}
      </div>
    </section>""")

    html_out = f"""<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>NaughtyBounty X — {week.get('title', week['weekStart'])}</title>
  <style>
    :root {{
      --bg: #14141f; --card: #1e1e2c; --fg: #f4f4fc; --muted: #9e9ebc;
      --primary: #a78bfa; --creators: #a78bfa; --users: #60a5fa; --border: #3c3c58;
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{ font-family: Figtree, system-ui, sans-serif; background: var(--bg); color: var(--fg); padding: 24px; }}
    h1 {{ color: var(--primary); margin-bottom: 8px; }}
    .lead {{ color: var(--muted); margin-bottom: 8px; }}
    .slots {{ color: var(--muted); font-size: 14px; margin-bottom: 28px; }}
    .legend {{ display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 28px; }}
    .legend span {{ font-size: 12px; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--border); }}
    .day {{ margin-bottom: 36px; }}
    .day h2 {{ font-size: 1.25rem; margin-bottom: 14px; color: var(--primary); border-bottom: 1px solid var(--border); padding-bottom: 8px; }}
    .posts {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 16px; }}
    .post-card {{ background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 14px; }}
    .post-meta {{ display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; align-items: center; }}
    .time {{ font-weight: 800; font-size: 1.1rem; }}
    .audience, .theme {{ font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 4px 10px; border-radius: 999px; }}
    .aud-creators {{ background: rgba(167,139,250,.15); color: var(--creators); }}
    .aud-users {{ background: rgba(96,165,250,.15); color: var(--users); }}
    .theme {{ background: rgba(255,255,255,.06); color: var(--muted); }}
    .post-card h4 {{ font-size: 12px; color: var(--muted); margin-bottom: 8px; font-weight: 600; }}
    iframe {{ width: 100%; aspect-ratio: 16/9; border: 0; border-radius: 8px; background: #1e1e2c; }}
    .tweet {{ margin: 10px 0; padding: 10px 12px; background: rgba(0,0,0,.25); border-left: 3px solid var(--primary); border-radius: 6px; font-size: 13px; line-height: 1.45; color: #ddd; }}
    .links {{ font-size: 13px; }}
    .links a {{ color: var(--primary); }}
    .theme-facts .theme {{ border: 1px solid rgba(245,158,11,.4); color: #fbbf24; }}
    .theme-brand .theme {{ border: 1px solid rgba(167,139,250,.4); }}
    .scheme {{ font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; padding: 4px 10px; border-radius: 999px; }}
    .scheme-dark {{ background: rgba(30,30,44,.9); color: #c4b5fd; border: 1px solid #3c3c58; }}
    .scheme-light {{ background: rgba(255,255,255,.12); color: #fafafa; border: 1px solid rgba(255,255,255,.25); }}
    .hint {{ margin-top: 32px; padding: 14px 16px; background: var(--card); border-radius: 8px; color: var(--muted); font-size: 14px; }}
    code {{ background: #28283e; padding: 2px 6px; border-radius: 4px; color: var(--fg); }}
  </style>
</head>
<body>
  <h1>X-Wochenplan · {week.get('title', '')}</h1>
  <p class="lead">3 Posts/Tag · For Creators & For Users · rotierende Themen</p>
  <p class="slots">Zeiten ({week.get('timezone', 'Europe/Berlin')}): {' · '.join(slots)}</p>
  <div class="legend">
    <span>For Creators: Brand · Bullets · Facts · Content-Tipps · Function</span>
    <span>For Users: Brand · Bullets · Facts · How-to Challenge</span>
  </div>
  {''.join(day_blocks)}
  <p class="hint">Bot: <code>npm run x:preview -- --week</code> · Creatives: <code>npm run build:all</code> · Plan neu bauen: <code>npm run week:build</code></p>
</body>
</html>
"""

    SCHEDULE_DIR.mkdir(parents=True, exist_ok=True)
    out_name = f"woche-{week['weekStart']}.html"
    (SCHEDULE_DIR / out_name).write_text(html_out, encoding="utf-8")

    POSTS_WEEK.write_text(
        json.dumps({
            "account": "LucaBrandblue",
            "link": "https://naughtybounty.com/for-creators",
            "weekStart": week["weekStart"],
            "posts": posts_out,
        }, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"  schedule/{out_name}")
    print(f"  posts-week.json ({len(posts_out)} Posts)")


def main() -> None:
    target = sys.argv[1] if len(sys.argv) > 1 else None
    files = [WEEKS / target] if target else sorted(WEEKS.glob("*.json"))
    if not files:
        print("Keine Wochenpläne in config/weeks/")
        sys.exit(1)
    for f in files:
        build_week(f)


if __name__ == "__main__":
    main()
