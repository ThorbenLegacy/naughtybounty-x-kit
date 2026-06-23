# NaughtyBounty X-Kit

Standalone Marketing-Paket für X/Twitter — **ohne Website-Repo**. Enthält Creatives (1200×675), Dokumentation, optionalen Daily-Bot.

## Ordnerstruktur

```
naughtybounty-x-kit/
├── .env.example          → kopieren nach .env.local
├── assets/               Logos (SVG)
├── bot/                  X Daily Bot (optional)
├── config/               Text-Varianten für HTML-Generierung
├── creatives/
│   ├── html/
│   │   ├── brand/        Große NB-Logo Creatives (8 Varianten)
│   │   └── bullets/      3-Stichpunkte Creative
│   └── preview.html      Alle Creatives in der Vorschau
├── docs/
│   ├── WORDING.md        Textregeln & Hooks
│   ├── FOR-CREATORS.md   Inhalte von /for-creators
│   ├── STYLE-GUIDE.css   Design-Tokens (Dark Theme)
│   └── ad-wordings.json  Vollständige Wording-Matrix
├── exports/
│   ├── brand/            PNG-Exports (Brand)
│   └── bullets/          PNG-Exports (Bullets)
├── posts.json            Rotierende X-Post-Texte + Bild-Pfade
├── scripts/
│   ├── build-creatives.py
│   └── export-png.py
└── package.json
```

## Schnellstart

### 1. Umgebung

```bash
cd naughtybounty-x-kit
cp .env.example .env.local
# X_OAUTH2_ACCESS_TOKEN eintragen (Account @LucaBrandblue)
npm install
pip install -r requirements.txt
playwright install chromium
```

### 2. Creatives bauen & exportieren

```bash
npm run build:all
```

- HTML: `creatives/html/`
- PNG: `exports/brand/*.png`, `exports/bullets/default.png`
- Vorschau im Browser: `creatives/preview.html` öffnen

### 3. X-Bot (optional, 3 Posts/Tag)

Zeiten in `config/schedule.json` (Standard: 08:00, 14:00, 07:17 Europe/Berlin):

```bash
npm run x:verify      # Auth testen
npm run x:preview     # nächsten Post anzeigen
npm run x:post          # einen Post (max. 3/Tag)
npm run x:schedule      # lokaler Scheduler (läuft dauerhaft)
```

GitHub Actions: `.github/workflows/x-posts.yml` — 3 Cron-Trigger/Tag.

**Wochenplan:** `config/weeks/2026-06-23.json` → `npm run week:build` → `schedule/woche-2026-06-23.html` + `posts-week.json` (21 Posts). Bot: `npm run x:preview -- --week`

### Content Studio (Web-UI)

Mit laufendem Dashboard (`npm start`):

- **Command Board:** `http://127.0.0.1:8765/` — Scheduler, KPIs, Analyse
- **Content Studio:** `http://127.0.0.1:8765/studio` — Wortings bearbeiten, Creatives als PNG exportieren (Dark/Light), Wochenplan per Drag &amp; Drop, Bilder/Videos hochladen

Workflow: Wortings speichern → **HTML neu bauen** → **PNG exportieren** · Oder unter **Custom HTML** eigenes Template einfügen → speichern → PNG exportieren → Wochenplan anpassen → **posts-week.json bauen**

**Hinweis:** Live-Posting braucht X API Write-Credits (Paid Plan).

## Creative-Formate

| Typ | Beschreibung | Größe |
|-----|--------------|-------|
| **Brand** | Großes NB-Logo Mitte + H1 Hook | 1200×675 (16:9) |
| **Bullets** | Headline + 3 Stichpunkte + CTA | 1200×675 (16:9) |

Texte anpassen:

- Brand: `config/brand-variants.json` → `npm run build`
- Bullets: `config/bullets-default.json` → `npm run build`

## Dokumentation

- **Wording:** `docs/WORDING.md` — erlaubte Texte, CTAs, Tabus
- **For Creators:** `docs/FOR-CREATORS.md` — Plattform-Botschaften
- **Style:** `docs/STYLE-GUIDE.css` — Farben, Typo, Pills

## posts.json

Rotiert täglich durch die Einträge. Jedes Post-Objekt:

```json
{
  "id": "deine-regeln",
  "text": "Hook…\n\nZweite Zeile…",
  "image": "exports/brand/deine-regeln.png"
}
```

Ohne `image`: reiner Text-Post.

## Portabilität

Diesen Ordner kannst du kopieren/zippen und unabhängig vom Hauptprojekt nutzen. Nur Node.js + Python + Playwright für PNG-Export nötig.

## Cloud-Deploy (Railway)

Siehe **[DEPLOY.md](./DEPLOY.md)** — Docker-Build auf Railway, Dashboard unter öffentlicher URL, PNGs lokal mit:

```bash
npm run assets:pull -- https://deine-app.up.railway.app
```
