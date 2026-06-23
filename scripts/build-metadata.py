"""Metadaten-Katalog für Creatives & Posts (Analyse-Dashboard)."""

from __future__ import annotations

import json
import re
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config"
DATA = ROOT / "data"
OUT = DATA / "content-catalog.json"

TAG_RE = re.compile(r"<[^>]+>")


def strip_html(value: str) -> str:
    return unescape(TAG_RE.sub(" ", value)).replace("\n", " ").strip()


def accent_from_tagline(tagline: str) -> str:
    m = re.search(r'class="accent"[^>]*>([^<]+)', tagline)
    return m.group(1).strip() if m else ""


def headline_from_brand(tagline: str) -> str:
    return " ".join(strip_html(tagline).split())


def keywords_from(*parts: str) -> list[str]:
    words: set[str] = set()
    for part in parts:
        for token in re.findall(r"[A-Za-zÄÖÜäöüß0-9+#]+", part):
            if len(token) >= 3 and token.lower() not in {"und", "the", "for", "auf", "bei", "der", "die", "das"}:
                words.add(token.replace("#", ""))
    return sorted(words)[:12]


def card_theme(kicker: str) -> str:
    if " · " in kicker:
        return kicker.split(" · ", 1)[1].strip()
    return kicker


def card_type(kicker: str) -> str:
    return kicker.split(" · ", 1)[0].strip() if " · " in kicker else "Card"


def bullets_summary(points: list[dict]) -> str:
    return " | ".join(f"{p['title']}: {p['description']}" for p in points)


def with_images(base: str) -> dict[str, str]:
    return {
        "image": base,
        "imageLight": base.replace("exports/", "exports-light/", 1),
    }


def brand_creative(v: dict, audience: str) -> dict:
    tagline = v["tagline"]
    header = headline_from_brand(tagline)
    accent = accent_from_tagline(tagline)
    trust = v.get("trust", "18+ only · Verifiziert · Du behältst die Kontrolle")
    href = v.get("href", "https://naughtybounty.com/for-creators")
    return {
        "id": v["id"],
        "type": "brand",
        "subtype": "brand-users" if audience == "users" else "brand",
        "audience": audience,
        "theme": "Brand",
        "header": header,
        "headerPre": strip_html(tagline.split("<br")[0]) if "<br" in tagline else header,
        "headerAccent": accent,
        "headerPost": "",
        "description": trust,
        "keywords": keywords_from(header, accent, trust, "NaughtyBounty", audience),
        "cta": None,
        "ctaUrl": href,
        "badge": None,
        "kicker": None,
        "bullets": None,
        "trustLine": trust,
        **with_images(f"exports/brand{'-users' if audience == 'users' else ''}/{v['id']}.png"),
        "colorScheme": "dark",
        "colorSchemes": ["dark", "light"],
        "format": "1200x675",
        "hasImage": True,
        "fontSize": v.get("fontSize"),
        "logoSize": v.get("logoSize", 360),
    }


def bullets_creative(cfg: dict, audience: str) -> dict:
    header = f"{cfg['headlinePre']} {cfg['headlineAccent']}{cfg.get('headlinePost', '')}".strip()
    href = cfg.get("href", "https://naughtybounty.com/for-creators" if audience == "creators" else "https://naughtybounty.com")
    bullets = bullets_summary(cfg["bullets"])
    return {
        "id": "default",
        "type": "bullets",
        "subtype": "bullets-users" if audience == "users" else "bullets",
        "audience": audience,
        "theme": "Bullets",
        "header": header,
        "headerPre": cfg["headlinePre"],
        "headerAccent": cfg["headlineAccent"],
        "headerPost": cfg.get("headlinePost", ""),
        "description": bullets,
        "keywords": keywords_from(header, cfg["badge"], cfg["cta"], audience),
        "cta": cfg["cta"],
        "ctaUrl": href,
        "badge": cfg["badge"],
        "kicker": cfg.get("brandTagline"),
        "bullets": [b["title"] for b in cfg["bullets"]],
        "trustLine": cfg.get("urlLine"),
        **with_images(f"exports/bullets{'-users' if audience == 'users' else ''}/default.png"),
        "colorScheme": "dark",
        "colorSchemes": ["dark", "light"],
        "format": "1200x675",
        "hasImage": True,
    }


def card_creative(v: dict, audience: str) -> dict:
    header = f"{v['headlinePre']} {v['headlineAccent']}{v.get('headlinePost', '')}".strip()
    kicker = v["kicker"]
    return {
        "id": v["id"],
        "type": "card",
        "subtype": card_type(kicker),
        "audience": audience,
        "theme": card_theme(kicker),
        "header": header,
        "headerPre": v["headlinePre"],
        "headerAccent": v["headlineAccent"],
        "headerPost": v.get("headlinePost", ""),
        "description": bullets_summary(v["points"]),
        "keywords": keywords_from(header, v["badge"], v["cta"], kicker, audience),
        "cta": v["cta"],
        "ctaUrl": v["href"],
        "badge": v["badge"],
        "kicker": kicker,
        "bullets": [p["title"] for p in v["points"]],
        "trustLine": v.get("urlLine"),
        **with_images(f"exports/cards/{v['id']}.png"),
        "colorScheme": "dark",
        "colorSchemes": ["dark", "light"],
        "format": "1200x675",
        "hasImage": True,
    }


def load_creatives() -> list[dict]:
    creatives: list[dict] = []
    for v in json.loads((CONFIG / "brand-variants.json").read_text(encoding="utf-8")):
        creatives.append(brand_creative(v, "creators"))
    for v in json.loads((CONFIG / "brand-variants-users.json").read_text(encoding="utf-8")):
        creatives.append(brand_creative(v, "users"))
    creatives.append(bullets_creative(json.loads((CONFIG / "bullets-default.json").read_text(encoding="utf-8")), "creators"))
    creatives.append(bullets_creative(json.loads((CONFIG / "bullets-users.json").read_text(encoding="utf-8")), "users"))
    for v in json.loads((CONFIG / "content" / "cards-creators.json").read_text(encoding="utf-8")):
        creatives.append(card_creative(v, "creators"))
    for v in json.loads((CONFIG / "content" / "cards-users.json").read_text(encoding="utf-8")):
        creatives.append(card_creative(v, "users"))
    return creatives


def creative_lookup(creatives: list[dict]) -> dict[str, dict]:
    by_id: dict[str, dict] = {}
    for c in creatives:
        by_id[c["id"]] = c
        by_id[f"{c['type']}/{c['id']}"] = c
        if c["type"] == "brand":
            prefix = "brand-users" if c["audience"] == "users" else "brand"
            by_id[f"{prefix}/{c['id']}"] = c
        if c["type"] == "bullets":
            prefix = "bullets-users" if c["audience"] == "users" else "bullets"
            by_id[f"{prefix}/default"] = c
    return by_id


def post_entry(p: dict, source: str, extra: dict | None = None) -> dict:
    extra = extra or {}
    creative_path = extra.get("creative") or p.get("image", "").replace("exports/", "").rsplit(".", 1)[0]
    if p.get("image"):
        parts = Path(p["image"]).parts
        if len(parts) >= 2:
            creative_path = f"{parts[-2]}/{parts[-1].replace('.png', '')}"
    hashtags = p.get("hashtags") or []
    text = p.get("text", "")
    return {
        "id": p["id"],
        "source": source,
        "audience": extra.get("audience") or ("creators" if "-c-" in p["id"] or p["id"].startswith(("deine-", "du-", "privat", "diskret", "keine", "kein", "anonym", "new-", "text-only")) else "users"),
        "theme": extra.get("theme"),
        "scheduledDate": extra.get("date"),
        "scheduledTime": extra.get("time"),
        "creativePath": creative_path,
        "creativeId": creative_path.split("/")[-1] if creative_path else None,
        "creativeType": creative_path.split("/")[0] if creative_path and "/" in creative_path else None,
        "header": text.split("\n")[0][:120] if text else p["id"],
        "description": text,
        "keywords": hashtags + keywords_from(text),
        "hashtags": hashtags,
        "ctaUrl": p.get("link"),
        "image": extra.get("image") or p.get("image"),
        "colorScheme": extra.get("colorScheme") or p.get("colorScheme"),
        "hasImage": bool(extra.get("image") or p.get("image")),
        "charCount": len(text),
        "status": extra.get("status", "planned"),
        "tweetId": extra.get("tweetId"),
    }


def load_posts(creatives_by_key: dict[str, dict]) -> list[dict]:
    posts: list[dict] = []
    history_by_post: dict[str, dict] = {}
    state_path = ROOT / "bot" / "state.json"
    if state_path.exists():
        state = json.loads(state_path.read_text(encoding="utf-8"))
        for h in state.get("history", []):
            history_by_post[h["postId"]] = h

    pool = json.loads((ROOT / "posts.json").read_text(encoding="utf-8"))
    for p in pool["posts"]:
        extra = {"status": "pool", "tweetId": history_by_post.get(p["id"], {}).get("tweetId")}
        if p["id"] in history_by_post:
            extra["status"] = "posted"
            extra["date"] = history_by_post[p["id"]].get("date")
            hist = history_by_post[p["id"]]
            if hist.get("image"):
                extra["image"] = hist["image"]
            if hist.get("colorScheme"):
                extra["colorScheme"] = hist["colorScheme"]
        posts.append(post_entry(p, "posts.json", extra))

    if (ROOT / "posts-week.json").exists():
        week = json.loads((ROOT / "posts-week.json").read_text(encoding="utf-8"))
        week_meta: dict[str, dict] = {}
        for wf in (CONFIG / "weeks").glob("*.json"):
            data = json.loads(wf.read_text(encoding="utf-8"))
            for day in data.get("days", []):
                for wp in day.get("posts", []):
                    week_meta[wp["id"]] = {
                        **wp,
                        "date": day["date"],
                        "status": "planned",
                    }
        for p in week["posts"]:
            meta = week_meta.get(p["id"], {})
            hist = history_by_post.get(p["id"])
            extra = {
                "audience": meta.get("audience"),
                "theme": meta.get("theme"),
                "creative": meta.get("creative"),
                "colorScheme": (hist.get("colorScheme") if hist else None)
                or meta.get("colorScheme")
                or p.get("colorScheme"),
                "date": meta.get("date"),
                "time": meta.get("time"),
                "status": "posted" if hist else meta.get("status", "planned"),
                "tweetId": hist.get("tweetId") if hist else None,
            }
            if hist and hist.get("image"):
                extra["image"] = hist["image"]
            posts.append(post_entry(p, "posts-week.json", extra))

    for post in posts:
        key = post.get("creativePath") or post.get("creativeId")
        c = creatives_by_key.get(key or "")
        if c:
            post["creativeMeta"] = {
                "type": c["type"],
                "theme": c.get("theme"),
                "header": c.get("header"),
                "cta": c.get("cta"),
            }
    return posts


def main() -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    creatives = load_creatives()
    lookup = creative_lookup(creatives)
    posts = load_posts(lookup)
    catalog = {
        "generatedAt": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
        "account": "LucaBrandblue",
        "brand": "NaughtyBounty",
        "format": "1200x675",
        "creatives": creatives,
        "posts": posts,
        "summary": {
            "creativeCount": len(creatives),
            "postCount": len(posts),
            "byType": {},
            "byAudience": {},
        },
    }
    for c in creatives:
        catalog["summary"]["byType"][c["type"]] = catalog["summary"]["byType"].get(c["type"], 0) + 1
        catalog["summary"]["byAudience"][c["audience"]] = catalog["summary"]["byAudience"].get(c["audience"], 0) + 1

    OUT.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)} — {len(creatives)} creatives, {len(posts)} posts")


if __name__ == "__main__":
    main()
