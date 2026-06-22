#!/usr/bin/env npx tsx
import { config } from "dotenv";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TwitterApi } from "twitter-api-v2";

const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = resolve(KIT_ROOT, ".env.local");

config({ path: ENV_PATH });

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
  for (const key of keys) out.push(`${key}=${updates[key]!}`);
  writeFileSync(path, out.join("\n").replace(/\n*$/, "\n"), "utf-8");
}

async function main(): Promise<void> {
  const clientId = process.env.X_CLIENT_ID?.trim();
  const clientSecret = process.env.X_CLIENT_SECRET?.trim();
  const refreshToken = process.env.X_OAUTH2_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) {
    console.error("X_CLIENT_ID, X_CLIENT_SECRET, X_OAUTH2_REFRESH_TOKEN fehlen.");
    process.exit(1);
  }

  const app = new TwitterApi({ clientId, clientSecret });
  const result = await app.refreshOAuth2Token(refreshToken);
  upsertEnv(ENV_PATH, {
    X_OAUTH2_ACCESS_TOKEN: result.accessToken,
    ...(result.refreshToken ? { X_OAUTH2_REFRESH_TOKEN: result.refreshToken } : {}),
  });

  const me = await result.client.v2.me();
  console.log(`Token refreshed für @${me.data?.username}`);
  console.log(`Scopes: ${result.scope ?? "?"}`);
}

main().catch((err) => {
  console.error(err?.data ?? err);
  process.exit(1);
});
