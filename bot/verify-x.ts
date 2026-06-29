#!/usr/bin/env npx tsx
/** X-API Verbindung testen (Standalone Kit). */

import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(KIT_ROOT, ".env.local") });
config({ path: resolve(KIT_ROOT, ".env") });

import { ApiResponseError } from "twitter-api-v2";
import {
  authMode,
  createXClientFresh,
  loadPosts,
  OAUTH2_SCOPES,
  testMediaUpload,
  verifyClient,
} from "./lib/content";

async function main(): Promise<void> {
  const mode = authMode();
  if (!mode) {
    console.error("Keine X-Credentials in .env.local");
    console.error("OAuth 2.0: X_OAUTH2_ACCESS_TOKEN (+ X_CLIENT_ID für media.write)");
    console.error("OAuth 1.0a: X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET");
    process.exit(1);
  }

  console.log(`Auth-Modus: ${mode}`);

  const authResult = await createXClientFresh();
  const client = authResult.client;
  if (!client) {
    console.error("Client konnte nicht erstellt werden.");
    for (const err of authResult.authErrors) console.error(`  ${err}`);
    process.exit(1);
  }
  const effectiveMode = authResult.authMethod ?? mode;
  console.log(`Verbindung über: ${effectiveMode}`);

  try {
    const { account } = loadPosts();
    const user = await verifyClient(client);
    console.log(`✓ Authentifiziert als @${user.username} (${user.name})`);
    console.log(`  Geplant: @${account} postet Promo für NaughtyBounty`);
    if (user.username.toLowerCase() !== account.replace(/^@/, "").toLowerCase()) {
      console.warn(`  Abweichung: Token-Account weicht von posts.json ab.`);
    }

    console.log("\nBild-Upload testen …");
    const mediaOk = await testMediaUpload(client);
    if (mediaOk) {
      console.log("✓ Bild-Upload funktioniert (media.write)");
    } else {
      console.error("✗ Bild-Upload fehlgeschlagen — Posts würden ohne Bild rausgehen.");
      console.error(`  OAuth2 neu holen: npm run x:oauth2`);
      console.error(`  Benötigte Scopes: ${OAUTH2_SCOPES.join(", ")}`);
      process.exit(1);
    }

    console.log("\nHinweis: Posten erfordert X API Write-Credits (Paid Plan).");
    console.log("Test: npm run x:preview -- --week");
  } catch (error) {
    if (error instanceof ApiResponseError && error.code === 401) {
      console.error("✗ Auth fehlgeschlagen (401)");
      if (effectiveMode === "oauth1") {
        console.error("  OAuth 1.0a Keys prüfen/regenerieren.");
      } else {
        console.error("  X_OAUTH2_ACCESS_TOKEN erneuern: npm run x:oauth2");
      }
    } else {
      console.error("✗ Auth fehlgeschlagen:", error);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
