#!/usr/bin/env npx tsx
/**
 * Scheduler: löst Posts über das Dashboard aus (Option C — kein X-OAuth hier).
 * Railway: DASHBOARD_INTERNAL_URL auf Private Network des Dashboard-Services setzen.
 *
 * Usage: npm run x:schedule
 */

import { existsSync } from "node:fs";
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(KIT_ROOT, ".env.local") });
config({ path: resolve(KIT_ROOT, ".env") });

import { loadSchedule, todayInTimezone, currentSlot } from "./lib/content";
import { dashboardInternalBaseUrl, requestScheduledPost, waitForDashboard } from "./lib/dashboard-client";

const CHECK_MS = 60_000;
const POSTS_WEEK = resolve(KIT_ROOT, "posts-week.json");
const useWeek = process.argv.includes("--week") || existsSync(POSTS_WEEK);

function slotMatches(configured: string, now: string): boolean {
  return configured === now;
}

async function waitForDashboardAtStartup(): Promise<void> {
  console.log(`Dashboard: ${dashboardInternalBaseUrl()}`);
  console.log("Warte auf Dashboard — Deploy-Reihenfolge: Dashboard zuerst, dann Scheduler.\n");
  const health = await waitForDashboard();
  if (health.ok) {
    console.log("✓ Dashboard erreichbar — Posts laufen über /api/internal/schedule-post\n");
    return;
  }
  console.error(`✗ Dashboard nach Wartezeit nicht erreichbar: ${health.error ?? "unbekannt"}`);
  console.error("  Railway: Dashboard-Service muss vor dem Scheduler deployen (Healthcheck /health grün).");
  console.error("  DASHBOARD_INTERNAL_URL=http://${{naughtybounty-x-kit.RAILWAY_PRIVATE_DOMAIN}}:${{naughtybounty-x-kit.PORT}}");
  console.error("  Lokal: npm start (Dashboard) in zweitem Terminal, dann Scheduler neu starten.\n");
  process.exit(1);
}

async function tick(): Promise<void> {
  const schedule = loadSchedule();
  const today = todayInTimezone(schedule.timezone);
  const now = currentSlot(schedule.timezone);
  const matchedSlot = schedule.slots.find((s) => slotMatches(s, now));
  if (!matchedSlot) return;

  console.log(`\n[${today} ${now}] Slot ${matchedSlot} — Dashboard-Post anfragen …`);
  const result = await requestScheduledPost({ week: useWeek, slot: matchedSlot });

  if ("skipped" in result && result.skipped) {
    console.log(`[${now}] Übersprungen: ${result.error ?? "bereits gepostet"}`);
    return;
  }

  if (result.ok) {
    console.log(`[${now}] ✓ ${result.postId} → ${result.url}`);
    return;
  }

  console.warn(`[${now}] Post fehlgeschlagen: ${result.error ?? "unbekannt"}`);
}

async function main(): Promise<void> {
  const schedule = loadSchedule();
  console.log("NaughtyBounty X-Scheduler (via Dashboard-API)");
  console.log(`Timezone: ${schedule.timezone}`);
  console.log(`Slots:    ${schedule.slots.join(", ")} (${schedule.postsPerDay}/Tag)`);
  console.log(`Posts:    ${useWeek ? "posts-week.json (Wochenplan)" : "posts.json"}`);
  console.log(`Prüfung alle ${CHECK_MS / 1000}s — Strg+C zum Beenden\n`);

  await waitForDashboardAtStartup();
  await tick();
  setInterval(() => {
    tick().catch((err) => console.error("Scheduler-Fehler:", err));
  }, CHECK_MS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
