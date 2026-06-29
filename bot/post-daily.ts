#!/usr/bin/env npx tsx
/**
 * NaughtyBounty X Bot — ein Post pro Aufruf (max. 3/Tag laut config/schedule.json)
 *
 * Usage:
 *   npm run x:preview
 *   npm run x:post
 *   npm run x:post -- --dry-run
 *   npm run x:post -- --force
 *   npm run x:schedule          # lokaler Scheduler (3 Slots/Tag)
 */

import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(KIT_ROOT, ".env.local") });
config({ path: resolve(KIT_ROOT, ".env") });

import {
  authMode,
  buildTweetText,
  canPostToday,
  currentSlot,
  findPostById,
  hasCredentials,
  loadPosts,
  loadSchedule,
  loadState,
  nextIndex,
  applyStateReconciliation,
  pickNextPost,
  postsRemainingToday,
  resolveImagePath,
  todayInTimezone,
  xCredentialsHint,
} from "./lib/content";
import { runNextPost } from "./lib/post-runner";

const argv = process.argv.slice(2);
const args = new Set(argv.filter((a) => a.startsWith("--")));
function argValue(flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

const preview = args.has("--preview");
const dryRun = args.has("--dry-run") || (!args.has("--force") && !hasCredentials());
const force = args.has("--force");
const useWeek = args.has("--week");
const postId = argValue("--post-id");

async function main(): Promise<void> {
  const schedule = loadSchedule();
  const { posts, account } = loadPosts({ week: useWeek });
  if (posts.length === 0) {
    console.error("posts.json ist leer.");
    process.exit(1);
  }

  const today = todayInTimezone(schedule.timezone);
  const slot = currentSlot(schedule.timezone);
  const state = applyStateReconciliation(loadState(), posts, today);

  if (!force && !preview && !canPostToday(state, schedule, today)) {
    console.log(
      `Heute (${today}) bereits ${state.postsToday}/${schedule.postsPerDay} Posts. --force zum Überschreiben.`,
    );
    console.log(`Nächste Slots: ${schedule.slots.join(", ")} (${schedule.timezone})`);
    process.exit(0);
  }

  const selected = postId ? findPostById(posts, postId) : null;
  if (postId && !selected) {
    console.error(`Post-ID nicht gefunden: ${postId}`);
    process.exit(1);
  }

  const post = selected?.post ?? pickNextPost(posts, state);
  const index = selected?.index ?? nextIndex(state, posts.length, posts);
  const { link } = loadPosts({ week: useWeek });
  const text = buildTweetText(post, link);
  const imagePath = resolveImagePath(post);

  console.log("--- Nächster X-Post ---");
  console.log(`Account: @${account} (Promo für NaughtyBounty)${useWeek ? " · Wochenplan" : ""}`);
  console.log(`Datum:   ${today} · Slot ${slot} · ${state.postsToday + 1}/${schedule.postsPerDay} heute`);
  console.log(`ID:      ${post.id}`);
  console.log(`Index:   ${index + 1}/${posts.length}`);
  console.log(`Bild:    ${imagePath ?? "(keins)"}`);
  console.log("---");
  console.log(text);
  console.log("---");
  console.log(`Zeichen: ${text.length}/280`);

  if (preview) {
    console.log(`\nNoch ${postsRemainingToday(state, schedule, today)} Post(s) heute möglich.`);
    return;
  }

  if (dryRun) {
    console.log("\n[DRY-RUN] Kein Post — X-Credentials fehlen oder --dry-run gesetzt.");
    return;
  }

  const result = await runNextPost({ force, postId, week: useWeek });
  if (!result.ok) {
    console.error("Post fehlgeschlagen.");
    if (result.authErrors) {
      for (const err of result.authErrors) console.error(`  ${err}`);
    }
    console.error(`  ${result.error}`);
    console.error(`  ${xCredentialsHint()}`);
    process.exit(1);
  }

  console.log(`\nPosten als: ${result.handle} (${authMode() ?? "?"})`);
  console.log(`Gepostet: ${result.url}`);
  console.log(`Verbleibend heute: ${schedule.postsPerDay - result.postsToday}/${schedule.postsPerDay}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
