#!/usr/bin/env npx tsx
/** Diagnose: liest .env.local direkt (ohne dotenv-Injection) und testet X-Auth. */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TwitterApi } from "twitter-api-v2";

const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = resolve(KIT_ROOT, ".env.local");

function loadEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    out[m[1]!] = m[2]!.replace(/^["']|["']$/g, "").trim();
  }
  return out;
}

async function tryMe(label: string, client: TwitterApi): Promise<boolean> {
  try {
    const me = await client.v2.me({ "user.fields": ["username"] });
    console.log(`✓ ${label}: @${me.data?.username}`);
    return true;
  } catch (e: unknown) {
    const err = e as { code?: number; data?: unknown };
    console.log(`✗ ${label}:`, err.code ?? err.data ?? e);
    return false;
  }
}

async function main(): Promise<void> {
  const env = loadEnvFile(ENV_PATH);
  console.log("Quelle:", ENV_PATH);
  console.log("Keys:", Object.keys(env).filter((k) => k.startsWith("X_")).join(", "));
  console.log("CLIENT_SECRET gesetzt:", !!env.X_CLIENT_SECRET);
  console.log("ACCESS len:", env.X_OAUTH2_ACCESS_TOKEN?.length ?? 0);
  console.log("REFRESH len:", env.X_OAUTH2_REFRESH_TOKEN?.length ?? 0);
  console.log("");

  const cid = env.X_CLIENT_ID;
  const sec = env.X_CLIENT_SECRET;
  const access = env.X_OAUTH2_ACCESS_TOKEN;
  const refresh = env.X_OAUTH2_REFRESH_TOKEN;

  let accessOk = false;
  if (access) accessOk = await tryMe("OAuth2 Access (Datei)", new TwitterApi(access));

  // Refresh nur wenn Access fehlschlägt — sonst rotiert X den Refresh-Token ohne Speicherung.
  if (!accessOk && cid && refresh) {
    const app = sec ? new TwitterApi({ clientId: cid, clientSecret: sec }) : new TwitterApi({ clientId: cid });
    try {
      const result = await app.refreshOAuth2Token(refresh);
      await tryMe("OAuth2 Refresh (Datei)", result.client);
      console.log("  ⚠ Refresh hat Token rotiert — npm run x:oauth2 oder Tokens in .env.local aktualisieren.");
    } catch (e: unknown) {
      const err = e as { data?: unknown; code?: number };
      console.log("✗ OAuth2 Refresh (Datei):", err.data ?? err.code ?? e);
    }
  } else if (accessOk) {
    console.log("ℹ OAuth2 Refresh übersprungen (Access ok).");
  }

  if (env.X_API_KEY && env.X_ACCESS_TOKEN) {
    await tryMe(
      "OAuth1 (Datei)",
      new TwitterApi({
        appKey: env.X_API_KEY,
        appSecret: env.X_API_SECRET!,
        accessToken: env.X_ACCESS_TOKEN,
        accessSecret: env.X_ACCESS_TOKEN_SECRET!,
      }),
    );
  }

  console.log("\n→ Wenn alles ✗: npm run x:oauth2 (Browser-Login als @LucaBrandblue)");
}

main();
