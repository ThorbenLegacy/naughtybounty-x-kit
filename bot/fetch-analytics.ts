#!/usr/bin/env npx tsx
/** Analytics von @LucaBrandblue abrufen. Usage: npm run x:analytics */

import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchAnalytics } from "./lib/analytics";

const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(KIT_ROOT, ".env.local") });
config({ path: resolve(KIT_ROOT, ".env") });

async function main() {
  console.log("X Analytics abrufen …");
  const data = await fetchAnalytics();
  console.log(`Account: @${data.account?.username ?? "?"}`);
  console.log(`Tweets: ${data.totals.tweetsFetched} · Verknüpft: ${data.totals.linkedPosts}`);
  console.log(
    `Impressions: ${data.totals.totalImpressions} · Likes: ${data.totals.totalLikes} · Ø ER: ${data.totals.avgEngagementRate ?? "n/a"}%`,
  );
  if (data.errors.length) {
    console.warn("Fehler:", data.errors.join("; "));
  }
  console.log(`Gespeichert: data/analytics.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
