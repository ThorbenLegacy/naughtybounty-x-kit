#!/usr/bin/env npx tsx
/** OAuth2-Login-URL ausgeben (ohne interaktives Warten). */

import { config } from "dotenv";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { OAUTH2_SCOPES } from "./lib/content";

const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STATE_PATH = resolve(KIT_ROOT, "bot", ".oauth2-pending.json");
const REDIRECT_URI = "http://127.0.0.1:1455/callback";

config({ path: resolve(KIT_ROOT, ".env.local") });

async function main(): Promise<void> {
  const clientId = process.env.X_CLIENT_ID?.trim();
  const clientSecret = process.env.X_CLIENT_SECRET?.trim();
  if (!clientId) {
    console.error("X_CLIENT_ID fehlt in .env.local");
    process.exit(1);
  }

  const { TwitterApi } = await import("twitter-api-v2");
  const app = clientSecret
    ? new TwitterApi({ clientId, clientSecret })
    : new TwitterApi({ clientId });

  const link = app.generateOAuth2AuthLink(REDIRECT_URI, { scope: [...OAUTH2_SCOPES] });
  writeFileSync(
    STATE_PATH,
    JSON.stringify({ state: link.state, codeVerifier: link.codeVerifier }, null, 2),
    "utf-8",
  );

  console.log("1. Im Browser öffnen (als @LucaBrandblue einloggen):\n");
  console.log(link.url);
  console.log("\n2. Nach Freigabe Callback-URL kopieren und einfügen:\n");
  console.log("   npm run x:oauth2 -- --exchange \"HIER-DIE-COMPLETE-URL\"");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
