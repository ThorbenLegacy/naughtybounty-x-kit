#!/usr/bin/env npx tsx
/**
 * Lokales Status-Dashboard mit Countdown zum nächsten Post-Slot.
 * Usage: npm run x:dashboard
 * URL:   http://127.0.0.1:8765
 */

import { createServer, type ServerResponse, type IncomingMessage } from "node:http";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { exec, execSync } from "node:child_process";
import { config } from "dotenv";

const BOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)));
const KIT_ROOT = resolve(BOT_DIR, "..");
const PORT = Number(process.env.PORT ?? 8765);
const HOST = process.env.HOST ?? (process.env.RAILWAY_ENVIRONMENT ? "0.0.0.0" : "127.0.0.1");
const IS_PRODUCTION = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === "production");
const DASHBOARD_HTML = resolve(KIT_ROOT, "schedule", "dashboard.html");
const STUDIO_HTML = resolve(KIT_ROOT, "schedule", "studio.html");
const CATALOG_PATH = resolve(KIT_ROOT, "data", "content-catalog.json");
const ASSETS_DIR = resolve(KIT_ROOT, "assets");
const EXPORTS_DIR = resolve(KIT_ROOT, "exports");
const EXPORTS_LIGHT_DIR = resolve(KIT_ROOT, "exports-light");

config({ path: resolve(KIT_ROOT, ".env.local") });
config({ path: resolve(KIT_ROOT, ".env") });

import {
  buildTweetText,
  currentSlot,
  loadPosts,
  loadSchedule,
  loadState,
  pickNextPost,
  postsRemainingToday,
  resetDayIfNeeded,
  todayInTimezone,
  xCredentialsHint,
  createXClientFresh,
} from "./lib/content";
import { fetchAnalytics, loadAnalytics } from "./lib/analytics";
import {
  authEnabled,
  clearSessionCookie,
  isPublicPath,
  loginPageHtml,
  parseLoginBody,
  redirect,
  resolveUser,
  setSessionCookie,
  verifyCredentials,
} from "./lib/auth";
import { handleStudioApi, serveCreativeHtml, serveUpload } from "./lib/studio";

let refreshInFlight = false;

function readJson(path: string): unknown {
  if (!existsSync(path)) return { error: "Datei fehlt — bitte Metadaten neu bauen." };
  return JSON.parse(readFileSync(path, "utf-8"));
}

function rebuildCatalog(): unknown {
  execSync("python3 scripts/build-metadata.py", { cwd: KIT_ROOT, encoding: "utf-8" });
  return readJson(CATALOG_PATH);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf-8");
}

function addDays(dateStr: string, days: number): string {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, mo! - 1, d! + days));
  return dt.toISOString().slice(0, 10);
}

function slotTargetMs(dateStr: string, slot: string, timeZone: string): number {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, mi] = slot.split(":").map(Number);
  let guess = Date.UTC(y!, mo! - 1, d!, h! - 1, mi!, 0);
  for (let i = 0; i < 6; i++) {
    const probe = new Date(guess);
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
        .formatToParts(probe)
        .map((p) => [p.type, p.value]),
    );
    const gotDate = `${parts.year}-${parts.month}-${parts.day}`;
    const gotTime = `${parts.hour}:${parts.minute}`;
    if (gotDate === dateStr && gotTime === slot) return probe.getTime();
    const targetMin = h! * 60 + mi!;
    const gotMin = Number(parts.hour) * 60 + Number(parts.minute);
    guess += (targetMin - gotMin) * 60_000;
  }
  return guess;
}

function nextScheduledSlot(
  slots: string[],
  postedSlots: string[],
  today: string,
  nowTime: string,
  timeZone: string,
): { slot: string; date: string; at: number; skippedPast: boolean } {
  for (const slot of slots) {
    if (postedSlots.includes(slot)) continue;
    if (slot > nowTime) {
      return { slot, date: today, at: slotTargetMs(today, slot, timeZone), skippedPast: false };
    }
  }
  const tomorrow = addDays(today, 1);
  const first = slots.find((s) => !postedSlots.includes(s)) ?? slots[0]!;
  return {
    slot: first,
    date: tomorrow,
    at: slotTargetMs(tomorrow, first, timeZone),
    skippedPast: true,
  };
}

function buildStatus() {
  const schedule = loadSchedule();
  const useWeek = existsSync(resolve(KIT_ROOT, "posts-week.json"));
  const { link, posts, account } = loadPosts({ week: useWeek });
  const today = todayInTimezone(schedule.timezone);
  const nowTime = currentSlot(schedule.timezone);
  const state = resetDayIfNeeded(loadState(), today);
  const nextPost = pickNextPost(posts, state);
  const nextIndex = (state.lastIndex + 1) % posts.length;
  const remaining = postsRemainingToday(state, schedule, today);
  const next = nextScheduledSlot(
    schedule.slots,
    state.postedSlots,
    today,
    nowTime,
    schedule.timezone,
  );
  const lastHistory = state.history[state.history.length - 1];

  return {
    account,
    timezone: schedule.timezone,
    now: { date: today, time: nowTime, label: new Date().toLocaleString("de-DE", { timeZone: schedule.timezone }) },
    schedule: {
      slots: schedule.slots,
      postsPerDay: schedule.postsPerDay,
    },
    postsSource: useWeek ? "posts-week.json" : "posts.json",
    today: {
      postsToday: state.postsToday,
      remaining,
      postedSlots: state.postedSlots,
      limitReached: remaining <= 0,
    },
    nextSlot: {
      slot: next.slot,
      date: next.date,
      at: next.at,
      inMs: Math.max(0, next.at - Date.now()),
      skippedPast: next.skippedPast,
    },
    nextPost: {
      id: nextPost.id,
      index: nextIndex + 1,
      total: posts.length,
      text: buildTweetText(nextPost, link),
      image: nextPost.image ?? null,
    },
    lastPost: lastHistory
      ? {
          date: lastHistory.date,
          postId: lastHistory.postId,
          slot: lastHistory.slot ?? null,
          tweetId: lastHistory.tweetId ?? null,
          url: lastHistory.tweetId
            ? `https://x.com/i/web/status/${lastHistory.tweetId}`
            : null,
        }
      : null,
    lastFailure: state.lastFailure
      ? {
          at: state.lastFailure.at,
          date: state.lastFailure.date,
          slot: state.lastFailure.slot ?? null,
          postId: state.lastFailure.postId,
          index: state.lastFailure.index ?? null,
          message: state.lastFailure.message,
          code: state.lastFailure.code ?? null,
        }
      : null,
  };
}

function sendJson(res: ServerResponse, data: unknown, code = 200): void {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd);
}

function listPngAssets(root: string, urlPrefix: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  function walk(dir: string, rel: string) {
    for (const name of readdirSync(dir)) {
      const abs = resolve(dir, name);
      const nextRel = rel ? `${rel}/${name}` : name;
      if (statSync(abs).isDirectory()) walk(abs, nextRel);
      else if (name.endsWith(".png")) out.push(`${urlPrefix}/${nextRel.replace(/\\/g, "/")}`);
    }
  }
  walk(root, "");
  return out.sort();
}

function buildAssetsManifest(): { files: string[]; generatedAt: string } {
  const files = [
    ...listPngAssets(EXPORTS_DIR, "exports"),
    ...listPngAssets(EXPORTS_LIGHT_DIR, "exports-light"),
  ];
  return { files, generatedAt: new Date().toISOString() };
}

const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
};

const STATIC_ROUTES: Array<{ prefix: string; root: string }> = [
  { prefix: "/exports-light/", root: EXPORTS_LIGHT_DIR },
  { prefix: "/exports/", root: EXPORTS_DIR },
  { prefix: "/assets/", root: ASSETS_DIR },
];

function contentTypeFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_TYPES[ext] ?? "application/octet-stream";
}

function serveStatic(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
  rel: string,
): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  let decoded = rel;
  try {
    decoded = decodeURIComponent(rel);
  } catch {
    sendJson(res, { error: "Bad request" }, 400);
    return true;
  }
  if (decoded.includes("..")) {
    sendJson(res, { error: "Forbidden" }, 403);
    return true;
  }
  const filePath = resolve(root, decoded.replace(/^\/+/, ""));
  if (!existsSync(filePath)) {
    sendJson(res, { error: "Not found", path: decoded }, 404);
    return true;
  }
  const body = readFileSync(filePath);
  res.writeHead(200, {
    "Content-Type": contentTypeFor(filePath),
    "Content-Length": body.length,
    "Cache-Control": "public, max-age=60",
  });
  if (req.method === "HEAD") {
    res.end();
  } else {
    res.end(body);
  }
  return true;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);

  if (req.method === "GET" && url.pathname === "/login") {
    if (resolveUser(req)) {
      redirect(res, "/");
      return;
    }
    sendHtml(res, loginPageHtml(url.searchParams.get("error") ?? undefined));
    return;
  }

  if (req.method === "POST" && url.pathname === "/login") {
    const body = await readBody(req);
    const { username, password } = parseLoginBody(body);
    if (verifyCredentials(username, password)) {
      setSessionCookie(res, username as "umbra" | "zero" | "shade");
      redirect(res, "/");
      return;
    }
    redirect(res, "/login?error=Falscher+Benutzer+oder+Passwort");
    return;
  }

  if (req.method === "GET" && url.pathname === "/logout") {
    clearSessionCookie(res);
    redirect(res, "/login");
    return;
  }

  if (authEnabled() && !isPublicPath(url.pathname, req.method ?? "GET")) {
    const user = resolveUser(req);
    if (!user) {
      if (url.pathname.startsWith("/api/")) {
        sendJson(res, { error: "Unauthorized" }, 401);
        return;
      }
      redirect(res, `/login?next=${encodeURIComponent(url.pathname)}`);
      return;
    }
  }

  for (const route of STATIC_ROUTES) {
    if (url.pathname.startsWith(route.prefix)) {
      const rel = url.pathname.slice(route.prefix.length);
      if (serveStatic(req, res, route.root, rel)) return;
    }
  }

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, {
      ok: true,
      exports: existsSync(EXPORTS_DIR),
      exportsLight: existsSync(EXPORTS_LIGHT_DIR),
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/assets-manifest") {
    sendJson(res, buildAssetsManifest());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/status") {
    const result = await createXClientFresh();
    let username: string | null = null;
    if (result.client) {
      try {
        const me = await result.client.v2.me();
        username = me.data?.username ?? null;
      } catch {
        /* ignore */
      }
    }
    sendJson(res, {
      authMethod: result.authMethod,
      username,
      ok: Boolean(result.client),
      errors: result.authErrors,
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/status") {
    sendJson(res, buildStatus());
    return;
  }

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html" || url.pathname === "/analytics")) {
    if (!existsSync(DASHBOARD_HTML)) {
      sendJson(res, { error: "dashboard.html fehlt" }, 404);
      return;
    }
    sendHtml(res, readFileSync(DASHBOARD_HTML, "utf-8"));
    return;
  }

  if (req.method === "GET" && url.pathname === "/studio") {
    if (!existsSync(STUDIO_HTML)) {
      sendJson(res, { error: "studio.html fehlt" }, 404);
      return;
    }
    sendHtml(res, readFileSync(STUDIO_HTML, "utf-8"));
    return;
  }

  if (url.pathname.startsWith("/creatives/html/")) {
    const rel = url.pathname.slice("/creatives/html/".length);
    if (serveCreativeHtml(req, res, rel)) return;
  }

  if (url.pathname.startsWith("/uploads/")) {
    const rel = url.pathname.slice("/uploads/".length);
    if (serveUpload(req, res, rel)) return;
  }

  if (url.pathname.startsWith("/api/studio/")) {
    if (handleStudioApi(req, res, url.pathname, req.method ?? "GET")) return;
  }

  if (req.method === "GET" && url.pathname === "/api/catalog") {
    sendJson(res, readJson(CATALOG_PATH));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/analytics") {
    sendJson(res, loadAnalytics() ?? { fetchedAt: null, tweets: [], totals: {}, account: null, errors: [], notes: [] });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/catalog/rebuild") {
    await readBody(req);
    try {
      sendJson(res, rebuildCatalog());
    } catch (e) {
      sendJson(res, { error: String(e) }, 500);
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/analytics/refresh") {
    await readBody(req);
    if (refreshInFlight) {
      sendJson(res, { error: "Refresh läuft bereits" }, 429);
      return;
    }
    refreshInFlight = true;
    try {
      const data = await fetchAnalytics();
      sendJson(res, data);
    } catch (e) {
      sendJson(res, { error: String(e) }, 500);
    } finally {
      refreshInFlight = false;
    }
    return;
  }

  sendJson(res, { error: "Not found" }, 404);
});

function printStartupBanner(port: number): void {
  const hostLabel = HOST === "0.0.0.0" ? "0.0.0.0" : HOST;
  const url = `http://${hostLabel === "0.0.0.0" ? "127.0.0.1" : hostLabel}:${port}`;
  const lightOk = existsSync(EXPORTS_LIGHT_DIR);
  console.log("NaughtyBounty X Command Board + Content Studio");
  console.log(`  listening on ${hostLabel}:${port}`);
  if (!IS_PRODUCTION) {
    console.log(`  ${url}`);
    console.log(`  Content Studio: ${url.replace(/\/$/, "")}/studio`);
  }
  console.log(`  exports: ${existsSync(EXPORTS_DIR) ? "ok" : "fehlt"} · exports-light: ${lightOk ? "ok" : "fehlt — npm run build:all"}`);
  if (authEnabled()) {
    console.log(`  login: aktiv · Nutzer umbra / zero / shade · Passwort via DASHBOARD_PASSWORD`);
  } else {
    console.log("  login: deaktiviert (DASHBOARD_AUTH_DISABLED=1)");
  }
  console.log(`  x-api: ${xCredentialsHint()}`);
  if (!lightOk) {
    console.log("  Light-Previews: exports-light/ fehlt — npm run build:all oder npm run assets:pull");
  }
  console.log("  Strg+C zum Beenden\n");
  if (!IS_PRODUCTION) openBrowser(url);
}

function tryListen(port: number, attemptsLeft: number): void {
  server.once("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && attemptsLeft > 1 && !IS_PRODUCTION) {
      console.warn(`Port ${port} belegt — versuche ${port + 1} …`);
      tryListen(port + 1, attemptsLeft - 1);
      return;
    }
    if (err.code === "EADDRINUSE") {
      console.error(`\nPort ${port} ist bereits belegt (alter Dashboard-Server?).`);
      console.error("Windows: netstat -ano | findstr :8765  →  taskkill /PID <PID> /F");
      console.error("Oder anderen Port: $env:PORT=8766; npm start\n");
    }
    throw err;
  });
  server.listen(port, HOST, () => {
    if (port !== PORT) {
      console.warn(`  Port ${PORT} war belegt — nutze ${port}.`);
    }
    printStartupBanner(port);
  });
}

tryListen(PORT, 5);

process.on("SIGINT", () => {
  server.close();
  process.exit(0);
});
