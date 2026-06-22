#!/usr/bin/env npx tsx
/**
 * Lokaler Scheduler: prüft jede Minute die Slots aus config/schedule.json
 * und postet automatisch (max. postsPerDay).
 *
 * Usage: npm run x:schedule
 */

import { existsSync } from "node:fs";
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(KIT_ROOT, ".env.local") });
config({ path: resolve(KIT_ROOT, ".env") });

import {
  canPostToday,
  currentSlot,
  loadSchedule,
  loadState,
  resetDayIfNeeded,
  todayInTimezone,
} from "./lib/content";

const CHECK_MS = 60_000;
const POSTS_WEEK = resolve(KIT_ROOT, "posts-week.json");
const useWeek = process.argv.includes("--week") || existsSync(POSTS_WEEK);

function runPost(): Promise<number> {
  const postArgs = ["run", "x:post", "--", ...(useWeek ? ["--week"] : [])];
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", postArgs, {
      cwd: KIT_ROOT,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise(code ?? 1));
  });
}

function slotMatches(configured: string, now: string): boolean {
  return configured === now;
}

async function tick(): Promise<void> {
  const schedule = loadSchedule();
  const today = todayInTimezone(schedule.timezone);
  const now = currentSlot(schedule.timezone);
  const state = resetDayIfNeeded(loadState(), today);

  const matchedSlot = schedule.slots.find((s) => slotMatches(s, now));
  if (!matchedSlot) return;

  if (state.postedSlots.includes(matchedSlot)) {
    return;
  }

  if (!canPostToday(state, schedule, today)) {
    console.log(`[${now}] Tageslimit (${schedule.postsPerDay}) erreicht.`);
    return;
  }

  console.log(`\n[${today} ${now}] Slot ${matchedSlot} — starte Post …`);
  const code = await runPost();
  if (code !== 0) {
    console.warn(`[${now}] Post fehlgeschlagen (exit ${code}).`);
  }
}

async function main(): Promise<void> {
  const schedule = loadSchedule();
  console.log("NaughtyBounty X-Scheduler");
  console.log(`Timezone: ${schedule.timezone}`);
  console.log(`Slots:    ${schedule.slots.join(", ")} (${schedule.postsPerDay}/Tag)`);
  console.log(`Posts:    ${useWeek ? "posts-week.json (Wochenplan)" : "posts.json"}`);
  console.log(`Prüfung alle ${CHECK_MS / 1000}s — Strg+C zum Beenden\n`);

  await tick();
  setInterval(() => {
    tick().catch((err) => console.error("Scheduler-Fehler:", err));
  }, CHECK_MS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
