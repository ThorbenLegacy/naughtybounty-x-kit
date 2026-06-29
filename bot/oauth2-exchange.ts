#!/usr/bin/env npx tsx
/** OAuth2 token exchange — confidential (Basic) oder public (nur client_id). */
import { config } from "dotenv";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = resolve(KIT_ROOT, ".env.local");
const REDIRECT_URI = "http://127.0.0.1:1455/callback";

config({ path: ENV_PATH });

const callbackUrl = process.argv[2];
if (!callbackUrl?.startsWith("http")) {
  console.error("Usage: npx tsx bot/oauth2-exchange.ts \"CALLBACK_URL\"");
  process.exit(1);
}

const pending = JSON.parse(
  readFileSync(resolve(KIT_ROOT, "bot/.oauth2-pending.json"), "utf-8"),
) as { state: string; codeVerifier: string };

const url = new URL(callbackUrl.trim());
const code = url.searchParams.get("code")?.trim();
const state = url.searchParams.get("state")?.trim();
if (!code || !state || state !== pending.state) {
  console.error("State/code ungültig oder passt nicht zur pending-Session.");
  process.exit(1);
}

const clientId = process.env.X_CLIENT_ID?.trim() ?? "";
const clientSecret = process.env.X_CLIENT_SECRET?.trim() ?? "";

async function exchange(mode: "confidential" | "public") {
  const body = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    redirect_uri: REDIRECT_URI,
    code_verifier: pending.codeVerifier,
    client_id: clientId,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (mode === "confidential" && clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  }

  const res = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers,
    body,
  });
  const data = (await res.json()) as Record<string, unknown>;
  return { ok: res.ok, data };
}

function upsertEnv(updates: Record<string, string>): void {
  const lines = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf-8").split(/\r?\n/) : [];
  const keys = new Set(Object.keys(updates));
  const out: string[] = [];
  for (const line of lines) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=/);
    if (match && keys.has(match[1]!)) {
      out.push(`${match[1]}=${updates[match[1]!]}`);
      keys.delete(match[1]!);
      continue;
    }
    out.push(line);
  }
  for (const key of keys) out.push(`${key}=${updates[key]!}`);
  writeFileSync(ENV_PATH, out.join("\n").replace(/\n*$/, "\n"), "utf-8");
}

async function main(): Promise<void> {
  for (const mode of ["confidential", "public"] as const) {
    console.log(`Versuche ${mode} …`);
    const { ok, data } = await exchange(mode);
    if (!ok) {
      console.log(`  Fehler: ${JSON.stringify(data)}`);
      continue;
    }
    const access = String(data.access_token ?? "");
    const refresh = data.refresh_token ? String(data.refresh_token) : undefined;
    if (!access) {
      console.log("  Kein access_token in Antwort.");
      continue;
    }
    upsertEnv({
      X_OAUTH2_ACCESS_TOKEN: access,
      ...(refresh ? { X_OAUTH2_REFRESH_TOKEN: refresh } : {}),
    });
    console.log(`✓ Token gespeichert (${mode})`);
    console.log(`  Scope: ${data.scope ?? "?"}`);
    return;
  }
  console.error("\nBeide Modi fehlgeschlagen.");
  console.error("Option A: App-Typ → Native App, nur X_CLIENT_ID, npm run x:oauth2 neu");
  console.error("Option B: Web App → OAuth 2.0 Client Secret neu kopieren → X_CLIENT_SECRET");
  process.exit(1);
}

main();
