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

### Healthcheck (nur Dashboard — in Railway UI setzen)

**Nicht** in `railway.toml` — sonst erzwingt Railway `/health` auch für den Scheduler (kein Webserver → Deploy schlägt fehl).

1. **Dashboard-Service** → Settings → **Healthcheck Path:** `/health`
2. Optional **Healthcheck Timeout:** `300` (Sekunden), wenn der Docker-Build lange dauert
3. **Scheduler-Service** → **Healthcheck Path leer lassen**

Endpoint (Dashboard):

- `GET /health` → `{ ok: true, exports: true, exportsLight: true }`
- `GET /api/assets-manifest` → Liste aller PNG-Pfade

Siehe [Railway Healthchecks](https://docs.railway.com/deployments/healthchecks).

### Env-Variablen (Railway)

| Variable | Pflicht | Beschreibung |
|----------|---------|--------------|
| `PORT` | auto | von Railway gesetzt |
| `X_OAUTH2_ACCESS_TOKEN` | **für KPIs/Bot** | OAuth2 Access Token (@LucaBrandblue) |
| `X_OAUTH2_REFRESH_TOKEN` | **empfohlen** | Token-Refresh (sonst läuft Access Token ab) |
| `X_CLIENT_ID` / `X_CLIENT_SECRET` | **empfohlen** | OAuth2 App — nötig für automatischen Token-Refresh |
| `X_API_KEY` … | optional | OAuth1 Fallback für Media-Upload |
| `DASHBOARD_PASSWORD` | **empfohlen** | Login für umbra / zero / shade (Standard: `nb-umbra-zero-shade`) |
| `DASHBOARD_SESSION_SECRET` | optional | Cookie-Signatur (zufälliger String) |
| `DASHBOARD_AUTH_DISABLED` | optional | `1` = Login aus (nur lokal) |
| `BOT_LAST_INDEX` | optional | Nur Übergang: `0` = erster Post gilt als erledigt. **Entfernen**, sobald `data/persist/state.json` Historie mit `tweetId` hat — sonst springt Auto-Modus falsch. |
| `BOT_PERSIST_DIR` | optional | Pfad für Laufzeitdaten (Default: `/app/data/persist`). Nur setzen, wenn Volume anders gemountet ist. |

### Post-Historie (welche Posts schon gepostet wurden)

Keine separate DB nötig: **`data/persist/state.json`** auf dem Shared Volume speichert pro Erfolg `postId`, `tweetId`, Datum, Slot und Creative. Dashboard und Scheduler lesen/schreiben dieselbe Datei.

- **Auto-Modus:** Nächster Post = letzter Erfolg in Historie + 1 (◀ ▶ **Auto** im Dashboard).
- **Manuell:** Mit ◀ ▶ durch Wochenplan blättern, dann **Jetzt posten**.
- Historie wird beim Status-Abruf mit X-Analytics abgeglichen (`tweetId`-Merge).

**Shared Volume — Mount Path: `/app/data/persist`** (Dashboard **und** Scheduler).

> **Nicht** `/app/bot` mounten — das überschreibt den Bot-Quellcode (`dashboard.ts` etc.) und der Container startet mit `ERR_MODULE_NOT_FOUND`.

### KPIs / X-API funktionieren nicht (401 / 400)

**Typisch:** Erster Post des Tages klappt, späterer Slot (z. B. 11:57) scheitert mit `OAuth2 Access: 401` + `OAuth2 Refresh: 400`.

- OAuth2-Access-Tokens sind nur **~2 Stunden** gültig.
- Zwischen 07:55 und 11:57 ist der Access Token abgelaufen — der Bot versucht Refresh.
- `400 invalid_request` beim Refresh: Refresh-Token in Railway ist **veraltet** (z. B. nach KPI-Abruf im Dashboard rotiert, aber nicht in Railway gespeichert) oder `X_CLIENT_SECRET` ist falsch (API Secret statt OAuth-2.0-Client-Secret).

Frisch refreshte Tokens werden auf dem **Shared Volume** in `data/persist/oauth-tokens.json` gespeichert (Mount **`/app/data/persist`**, nicht `/app/bot`).

Access Tokens laufen ab. **Lokal erneuern**, dann Werte nach Railway kopieren:

```bash
cd naughtybounty-x-kit
npm run x:refresh    # oder npm run x:oauth2 bei abgelaufenem Refresh-Token
npm run x:verify     # muss ✓ zeigen
```

**Diese 4 Variablen in Railway neu setzen** (aus `naughtybounty-x-kit/.env.local`):

- `X_OAUTH2_ACCESS_TOKEN`
- `X_OAUTH2_REFRESH_TOKEN`
- `X_CLIENT_ID` — OAuth **2.0** Client ID (User Auth Settings), **nicht** API Key
- `X_CLIENT_SECRET` — OAuth **2.0** Client Secret, **nicht** API Secret

Diagnose nach Login: `GET /api/auth/status` auf deiner Railway-URL.

**Automatischer Token-Refresh:** Dashboard und Scheduler erneuern OAuth2-Tokens alle 90 Minuten und speichern sie in `data/persist/oauth-tokens.json`. Manueller Post: Button **„Jetzt posten“** im Scheduler-Bereich oder `POST /api/post/now`.

OAuth1 (`X_API_KEY` …) ist optional; KPIs laufen mit gültigem OAuth2.

Kopiere Werte aus `.env.local` (lokal) — **nie** committen.

### Dashboard-Login

- **Command Board:** `/` · **Content Studio:** `/studio`

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

- Gleiche Env-Variablen wie beim Dashboard (X OAuth — **ohne** `DASHBOARD_PASSWORD`)
- Fehlgeschlagene Posts erscheinen im **Command Board** (rotes Banner + Fehlermeldung)
- **Healthcheck Path leer** — Scheduler hat keinen HTTP-Server
- **Volume** (empfohlen): Mount **`/app/data/persist`** — **gleiches Volume** an Dashboard und Scheduler (`state.json`, `oauth-tokens.json`)
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
| Scheduler: „service unavailable“ beim Deploy | Healthcheck in UI leer; `railway.toml` darf kein `healthcheckPath` setzen |
| `ERR_MODULE_NOT_FOUND` `/app/bot/dashboard.ts` | Volume fälschlich auf `/app/bot` — auf **`/app/data/persist`** umhängen |
