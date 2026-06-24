import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

export const DASHBOARD_USERS = ["umbra", "zero", "shade"] as const;
export type DashboardUser = (typeof DASHBOARD_USERS)[number];

const SESSION_COOKIE = "nb_session";
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Standard-Passwort — in Produktion via DASHBOARD_PASSWORD überschreiben. */
export const DEFAULT_DASHBOARD_PASSWORD = "nb-umbra-zero-shade";

export function dashboardPassword(): string {
  return process.env.DASHBOARD_PASSWORD?.trim() || DEFAULT_DASHBOARD_PASSWORD;
}

export function authEnabled(): boolean {
  return process.env.DASHBOARD_AUTH_DISABLED !== "1";
}

function sessionSecret(): string {
  return process.env.DASHBOARD_SESSION_SECRET?.trim() || `${dashboardPassword()}:nb-kit`;
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function isDashboardUser(name: string): name is DashboardUser {
  return (DASHBOARD_USERS as readonly string[]).includes(name);
}

export function verifyCredentials(username: string, password: string): boolean {
  if (!authEnabled()) return true;
  if (!isDashboardUser(username)) return false;
  return safeEqual(password, dashboardPassword());
}

function sign(value: string): string {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

export function createSessionToken(username: DashboardUser): string {
  const exp = String(Date.now() + SESSION_MAX_AGE_MS);
  const payload = `${username}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function parseSessionToken(token: string | null | undefined): DashboardUser | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [username, exp, sig] = parts as [string, string, string];
  const payload = `${username}.${exp}`;
  if (sign(payload) !== sig) return null;
  if (!isDashboardUser(username)) return null;
  if (Date.now() > Number(exp)) return null;
  return username;
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function parseBasicAuth(header: string | undefined): { user: string; pass: string } | null {
  if (!header?.startsWith("Basic ")) return null;
  try {
    const raw = Buffer.from(header.slice(6), "base64").toString("utf-8");
    const i = raw.indexOf(":");
    if (i < 0) return null;
    return { user: raw.slice(0, i), pass: raw.slice(i + 1) };
  } catch {
    return null;
  }
}

export function resolveUser(req: IncomingMessage): DashboardUser | null {
  if (!authEnabled()) return "umbra";

  const cookies = parseCookies(req.headers.cookie);
  const fromCookie = parseSessionToken(cookies[SESSION_COOKIE]);
  if (fromCookie) return fromCookie;

  const basic = parseBasicAuth(req.headers.authorization);
  if (basic && verifyCredentials(basic.user, basic.pass)) {
    return basic.user as DashboardUser;
  }
  return null;
}

export function setSessionCookie(res: ServerResponse, username: DashboardUser): void {
  const token = createSessionToken(username);
  const maxAge = Math.floor(SESSION_MAX_AGE_MS / 1000);
  const secure = process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`,
  );
}

export function clearSessionCookie(res: ServerResponse): void {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; Max-Age=0`);
}

export function redirect(res: ServerResponse, location: string, code = 302): void {
  res.writeHead(code, { Location: location });
  res.end();
}

export function loginPageHtml(error?: string): string {
  const err = error
    ? `<p class="err">${error.replace(/</g, "&lt;")}</p>`
    : "";
  const options = DASHBOARD_USERS.map(
    (u) => `<option value="${u}">${u}</option>`,
  ).join("");
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>NaughtyBounty X — Login</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Figtree:wght@500;600;700&display=swap" rel="stylesheet" />
  <style>
    :root { --primary: #7511bd; --fg: #18181b; --muted: #71717a; --border: #e4e4e7; --err: #dc2626; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Figtree, system-ui, sans-serif;
      min-height: 100vh; display: grid; place-items: center; padding: 24px;
      background: radial-gradient(ellipse 80% 50% at 50% 0%, rgba(117,17,189,.08), transparent 60%), #fff;
      color: var(--fg);
    }
    .card {
      width: min(400px, 100%); padding: 32px 28px; border-radius: 20px;
      border: 1px solid var(--border); box-shadow: 0 8px 32px rgba(117,17,189,.08);
    }
    h1 { font-size: 1.35rem; margin-bottom: 6px; }
    .sub { color: var(--muted); font-size: .9rem; margin-bottom: 24px; }
    label { display: block; font-size: .78rem; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin-bottom: 6px; }
    input, select {
      width: 100%; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--border);
      font: inherit; margin-bottom: 16px; background: #fff;
    }
    input:focus, select:focus { outline: 2px solid rgba(117,17,189,.25); border-color: var(--primary); }
    button {
      width: 100%; padding: 13px; border: 0; border-radius: 12px; cursor: pointer;
      background: var(--primary); color: #fff; font: inherit; font-weight: 700;
    }
    button:hover { filter: brightness(1.05); }
    .err { color: var(--err); font-size: .88rem; margin-bottom: 12px; }
  </style>
</head>
<body>
  <form class="card" method="post" action="/login">
    <h1>Command Board</h1>
    <p class="sub">NaughtyBounty X-Kit</p>
    ${err}
    <label for="username">Benutzer</label>
    <select id="username" name="username" required>${options}</select>
    <label for="password">Passwort</label>
    <input id="password" name="password" type="password" required autocomplete="current-password" />
    <button type="submit">Anmelden</button>
  </form>
</body>
</html>`;
}

export function parseLoginBody(body: string): { username: string; password: string } {
  const params = new URLSearchParams(body);
  return {
    username: (params.get("username") ?? "").trim().toLowerCase(),
    password: params.get("password") ?? "",
  };
}

export function isPublicPath(pathname: string, method: string): boolean {
  if (pathname === "/health") return true;
  if (pathname === "/login" && (method === "GET" || method === "POST")) return true;
  if (pathname === "/logout" && method === "GET") return true;
  return false;
}

/** Geheimer Scheduler→Dashboard-Zugriff (Railway Private Network). */
export function schedulerSecret(): string | null {
  const explicit = process.env.SCHEDULER_SECRET?.trim();
  if (explicit) return explicit;
  const pw = process.env.DASHBOARD_PASSWORD?.trim();
  if (pw) return pw;
  if (!authEnabled()) return DEFAULT_DASHBOARD_PASSWORD;
  return null;
}

export function verifySchedulerSecret(req: IncomingMessage): boolean {
  const secret = schedulerSecret();
  if (!secret) return false;
  const auth = req.headers.authorization ?? "";
  if (auth.startsWith("Bearer ")) {
    return safeEqual(auth.slice(7), secret);
  }
  const header = req.headers["x-scheduler-secret"];
  return typeof header === "string" && safeEqual(header, secret);
}

export function isSchedulerInternalPath(pathname: string, method: string): boolean {
  return method === "POST" && pathname === "/api/internal/schedule-post";
}
