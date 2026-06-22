#!/usr/bin/env npx tsx
/**
 * OAuth 2.0 User-Token mit media.write neu holen (PKCE).
 *
 * Usage:
 *   npm run x:oauth2
 *   npx tsx bot/oauth2-setup.ts --exchange "http://127.0.0.1:1455/callback?state=...&code=..."
 */

import { config } from "dotenv";
import { createInterface } from "node:readline/promises";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stdin as input, stdout as output } from "node:process";
import { OAUTH2_SCOPES } from "./lib/content";

const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = resolve(KIT_ROOT, ".env.local");
const REDIRECT_URI = "http://127.0.0.1:1455/callback";
const STATE_PATH = resolve(KIT_ROOT, "bot", ".oauth2-pending.json");

config({ path: ENV_PATH });
config({ path: resolve(KIT_ROOT, ".env") });

function argValue(flag: string): string | undefined {
  const argv = process.argv.slice(2);
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

function getExchangeUrl(): string | undefined {
  const explicit = argValue("--exchange");
  if (explicit) return explicit;
  return process.argv.slice(2).find((a) => a.startsWith("http"));
}

function parseCallbackUrl(raw: string): { code: string; state: string } {
  const url = new URL(raw.trim());
  const code = url.searchParams.get("code")?.trim();
  const state = url.searchParams.get("state")?.trim();
  if (!code || !state) {
    throw new Error("Callback-URL muss code= und state= enthalten.");
  }
  return { code, state };
}

function upsertEnv(path: string, updates: Record<string, string>): void {
  const lines = existsSync(path) ? readFileSync(path, "utf-8").split(/\r?\n/) : [];
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

  for (const key of keys) {
    out.push(`${key}=${updates[key]!}`);
  }

  writeFileSync(path, out.join("\n").replace(/\n*$/, "\n"), "utf-8");
}

async function main(): Promise<void> {
  const clientId = process.env.X_CLIENT_ID?.trim();
  const clientSecret = process.env.X_CLIENT_SECRET?.trim();
  if (!clientId) {
    console.error("X_CLIENT_ID fehlt in .env.local");
    process.exit(1);
  }

  const { TwitterApi, ApiResponseError } = await import("twitter-api-v2");
  // Native App (public): nur clientId. Web App (confidential): clientId + clientSecret.
  const app = clientSecret
    ? new TwitterApi({ clientId, clientSecret })
    : new TwitterApi({ clientId });

  async function exchangeCallback(
    pasted: string,
    pending: { state: string; codeVerifier: string },
  ): Promise<void> {
    const { code, state } = parseCallbackUrl(pasted);
    if (state !== pending.state) {
      console.error("State stimmt nicht — Link aus demselben Durchlauf neu öffnen.");
      process.exit(1);
    }
    try {
      const result = await app.loginWithOAuth2({
        code,
        codeVerifier: pending.codeVerifier,
        redirectUri: REDIRECT_URI,
      });
      upsertEnv(ENV_PATH, {
        X_OAUTH2_ACCESS_TOKEN: result.accessToken,
        ...(result.refreshToken ? { X_OAUTH2_REFRESH_TOKEN: result.refreshToken } : {}),
      });
      const me = await result.client.v2.me();
      console.log(`\n✓ Token gespeichert für @${me.data?.username}`);
      console.log(`  Scopes: ${result.scope ?? "(nicht gemeldet)"}`);
      console.log("\nTest: npm run x:verify");
    } catch (error) {
      if (error instanceof ApiResponseError && error.data?.error === "unauthorized_client") {
        console.error("\n✗ Client Secret ungültig (unauthorized_client).");
        console.error("  Developer Portal → App → OAuth 2.0 → Client Secret kopieren");
        console.error("  In .env.local als X_CLIENT_SECRET (NICHT X_API_SECRET!)");
        console.error("  Dann npm run x:oauth2 neu starten und erneut freigeben.");
      }
      throw error;
    }
  }

  const exchangeUrl = getExchangeUrl();
  if (exchangeUrl) {
    if (!existsSync(STATE_PATH)) {
      console.error("Keine pending OAuth2-Session. Zuerst npm run x:oauth2 ohne --exchange.");
      process.exit(1);
    }
    const pending = JSON.parse(readFileSync(STATE_PATH, "utf-8")) as {
      state: string;
      codeVerifier: string;
    };
    await exchangeCallback(exchangeUrl, pending);
    return;
  }

  const link = app.generateOAuth2AuthLink(REDIRECT_URI, {
    scope: [...OAUTH2_SCOPES],
  });

  writeFileSync(
    STATE_PATH,
    JSON.stringify({ state: link.state, codeVerifier: link.codeVerifier }, null, 2),
    "utf-8",
  );

  console.log("OAuth 2.0 — Token mit media.write holen\n");
  if (!clientSecret) {
    console.log("Modus: Native App (public) — kein Client Secret nötig\n");
  } else {
    console.log("Modus: Web App (confidential) — Client Secret wird genutzt\n");
  }
  console.log("1. Callback im Developer Portal setzen:");
  console.log(`   ${REDIRECT_URI}\n`);
  console.log("2. Diese URL im Browser öffnen (als @LucaBrandblue einloggen):\n");
  console.log(link.url);
  console.log("\n3. Nach Freigabe: URL aus Adressleiste kopieren und hier einfügen.\n");

  const rl = createInterface({ input, output });
  const pasted = await rl.question("Callback-URL einfügen und Enter: ");
  rl.close();

  if (pasted.trim()) {
    const pending = JSON.parse(readFileSync(STATE_PATH, "utf-8")) as {
      state: string;
      codeVerifier: string;
    };
    await exchangeCallback(pasted, pending);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
