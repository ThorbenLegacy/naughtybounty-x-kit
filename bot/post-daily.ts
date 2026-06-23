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
  createXClientFresh,
  currentSlot,
  describePostError,
  findPostById,
  hasCredentials,
  loadPosts,
  loadSchedule,
  loadState,
  nextIndex,
  pickNextPost,
  postsRemainingToday,
  publishTweet,
  recordPost,
  recordPostFailure,
  resetDayIfNeeded,
  resolveImagePath,
  saveState,
  todayInTimezone,
  validateCreativeImage,
  verifyClient,
  xCredentialsHint,
} from "./lib/content";
import { ApiResponseError } from "twitter-api-v2";

const argv = process.argv.slice(2);
const args = new Set(argv.filter((a) => a.startsWith("--")));
function argValue(flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

const preview = args.has("--preview");
const dryRun = args.has("--dry-run") || (!args.has("--force") && !hasCredentials());
const force = args.has("--force");
const noImage = args.has("--no-image");
const useWeek = args.has("--week");
const allowTextOnly = args.has("--allow-text-only");
const noAdvance = args.has("--no-advance");
const postId = argValue("--post-id");

function persistFailure(
  state: ReturnType<typeof loadState>,
  today: string,
  slot: string,
  postId: string,
  index: number,
  error: unknown,
): void {
  const code = error instanceof ApiResponseError ? error.code : undefined;
  saveState(
    recordPostFailure(state, today, postId, describePostError(error), {
      slot,
      index,
      code,
    }),
  );
}

async function main(): Promise<void> {
  const schedule = loadSchedule();
  const { link, posts, account } = loadPosts({ week: useWeek });
  if (posts.length === 0) {
    console.error("posts.json ist leer.");
    process.exit(1);
  }

  const today = todayInTimezone(schedule.timezone);
  const slot = currentSlot(schedule.timezone);
  let state = resetDayIfNeeded(loadState(), today);

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
  const index = selected?.index ?? nextIndex(state, posts.length);
  const text = buildTweetText(post, link);
  const imagePath = noImage ? null : resolveImagePath(post);

  if (imagePath && !preview && !dryRun) {
    try {
      validateCreativeImage(imagePath);
    } catch (error) {
      persistFailure(state, today, slot, post.id, index, error);
      console.error(describePostError(error));
      process.exit(1);
    }
  }

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

  const authResult = await createXClientFresh();
  const client = authResult.client;
  if (!client) {
    const message = authResult.authErrors.join(" · ") || "X-Client konnte nicht erstellt werden.";
    saveState(
      recordPostFailure(state, today, post.id, message, { slot, index }),
    );
    console.error("X-Client konnte nicht erstellt werden.");
    for (const err of authResult.authErrors) console.error(`  ${err}`);
    console.error(`  ${xCredentialsHint()}`);
    process.exit(1);
  }

  try {
    const user = await verifyClient(client);
    const handle = `@${user.username}`;
    const expected = account.startsWith("@") ? account : `@${account}`;
    console.log(`Posten als: ${handle} (${authResult.authMethod ?? authMode()})`);
    if (handle.toLowerCase() !== expected.toLowerCase()) {
      console.warn(`Warnung: Token ist ${handle}, posts.json erwartet ${expected}.`);
    }

    const tweetId = await publishTweet(client, text, imagePath, {
      skipImage: noImage,
      allowTextOnly,
    });
    console.log(`\nGepostet: https://x.com/i/web/status/${tweetId}`);

    if (!noAdvance) {
      saveState(recordPost(state, today, index, post.id, tweetId, slot));
    } else {
      console.log("(State nicht aktualisiert — --no-advance)");
    }
    const after = postsRemainingToday(loadState(), schedule, today);
    console.log(`Verbleibend heute: ${after}/${schedule.postsPerDay}`);
  } catch (error) {
    persistFailure(state, today, slot, post.id, index, error);
    if (error instanceof ApiResponseError) {
      if (error.code === 401) {
        console.error("\nAuth fehlgeschlagen (401). npm run x:verify");
      } else if (error.code === 402) {
        console.error("\nKeine API-Credits (402). X Developer Plan upgraden.");
      } else if (error.code === 403) {
        console.error("\nKeine Schreibberechtigung (403). Token-Scopes prüfen (media.write).");
        console.error("  npm run x:oauth2  — Token mit media.write neu holen");
      } else {
        console.error(`\nX API Fehler ${error.code}:`, error.errors ?? error.data);
      }
      process.exit(1);
    }
    throw error;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
