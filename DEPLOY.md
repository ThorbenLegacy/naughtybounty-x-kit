# Deploy — Railway

Dashboard + X-Bot als Cloud-Service. **PNG-Exports liegen nicht im Git** — auf dem Server werden sie beim Docker-Build erzeugt; lokal kannst du sie mit `npm run assets:pull` synchronisieren.

## 1. GitHub-Repo

Repository: [github.com/ThorbenLegacy/naughtybounty-x-kit](https://github.com/ThorbenLegacy/naughtybounty-x-kit)

```bash
git remote add origin https://github.com/ThorbenLegacy/naughtybounty-x-kit.git
git push -u origin main
```

## 2. Railway — Dashboard (Web)

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Repo `ThorbenLegacy/naughtybounty-x-kit` wählen
3. Railway erkennt `Dockerfile` + `railway.toml` automatisch
4. **Variables** setzen (siehe unten)
5. Nach Deploy: öffentliche URL z. B. `https://naughtybounty-x-kit-production.up.railway.app`

Der Container baut beim ersten Deploy alle Creatives (`npm run build:all` inkl. PNG-Export). Das dauert einige Minuten.

### Healthcheck

- `GET /health` → `{ ok: true, exports: true, exportsLight: true }`
- `GET /api/assets-manifest` → Liste aller PNG-Pfade

### Env-Variablen (Railway)

| Variable | Pflicht | Beschreibung |
|----------|---------|--------------|
| `PORT` | auto | von Railway gesetzt |
| `X_OAUTH2_ACCESS_TOKEN` | für Bot/Analytics | OAuth2 Access Token |
| `X_OAUTH2_REFRESH_TOKEN` | empfohlen | Token-Refresh |
| `X_CLIENT_ID` / `X_CLIENT_SECRET` | empfohlen | OAuth2 App |
| `X_API_KEY` … | optional | OAuth1 Fallback für Media-Upload |
| `DASHBOARD_PASSWORD` | **empfohlen** | Login für umbra / zero / shade (Standard: `nb-umbra-zero-shade`) |
| `DASHBOARD_SESSION_SECRET` | optional | Cookie-Signatur (zufälliger String) |
| `DASHBOARD_AUTH_DISABLED` | optional | `1` = Login aus (nur lokal) |

Kopiere Werte aus `.env.local` (lokal) — **nie** committen.

### Dashboard-Login

- **Benutzer:** `umbra`, `zero`, `shade` (Dropdown auf `/login`)
- **Passwort:** `DASHBOARD_PASSWORD` in Railway setzen — sonst Default `nb-umbra-zero-shade`
- **Abmelden:** Link oben rechts im Dashboard
- **`/health`** bleibt ohne Login (Railway Healthcheck)
- **`assets:pull`:** `DASHBOARD_USER=umbra` + `DASHBOARD_PASSWORD=...` mitsenden

### Schnellerer Build (ohne PNG-Export im Image)

Docker-Build-Arg `BUILD_ASSETS=0` setzen (Railway → Settings → Build → Build Args). Dann PNGs nur lokal bauen oder von anderem Service ziehen.

## 3. Railway — Scheduler (optional, 2. Service)

Zweiten Service im gleichen Projekt anlegen, **gleiches Repo**, anderer Start-Befehl:

```bash
npm run x:schedule -- --week
```

- Gleiche Env-Variablen wie beim Dashboard
- **Volume** (empfohlen): `/app/bot/state.json` und `/app/data/` mounten, damit Post-Status zwischen Restarts erhalten bleibt
- PNGs müssen im Image vorhanden sein (`BUILD_ASSETS=1`) oder per Volume

## 4. Bilder lokal ziehen

Nach dem Cloud-Deploy:

```bash
# Windows PowerShell
$env:KIT_URL="https://deine-app.up.railway.app"
$env:DASHBOARD_PASSWORD="dein-passwort"
npm run assets:pull

# oder direkt
npm run assets:pull -- https://deine-app.up.railway.app
```

Lädt alle PNGs aus `exports/` und `exports-light/` vom live Dashboard.

## 5. Lokal entwickeln

```bash
cp .env.example .env.local
npm install
pip install -r requirements.txt
playwright install chromium
npm run build:all
npm start
```

Öffnen: http://127.0.0.1:8765

## Architektur

```
GitHub Repo (ohne PNGs)
    │
    ▼
Railway Docker Build
    ├── HTML/CSS Creatives (Quelle)
    ├── Playwright PNG-Export
    └── npm start → Dashboard :PORT
            │
            ├── /exports/*.png
            ├── /exports-light/*.png
            └── /api/assets-manifest
                    │
                    ▼
            npm run assets:pull (lokal)
```

## Troubleshooting

| Problem | Lösung |
|---------|--------|
| Dashboard ohne Thumbnails | `BUILD_ASSETS=1` oder `npm run assets:pull` |
| Light-Bilder 404 | Dashboard neu deployen, `/health` prüfen |
| Bot postet ohne Bild | PNGs auf dem Scheduler-Service vorhanden? |
| Build timeout | `BUILD_ASSETS=0`, PNGs lokal bauen + Volume |
