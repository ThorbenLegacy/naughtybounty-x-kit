import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ApiResponseError } from "twitter-api-v2";
import {
  applyStateReconciliation,
  buildTweetText,
  canPostToday,
  createXClientFresh,
  currentSlot,
  describePostError,
  findPostById,
  loadPosts,
  loadSchedule,
  loadState,
  nextIndex,
  pickNextPost,
  postMediaMeta,
  publishTweet,
  recordPost,
  recordPostFailure,
  resolveImagePath,
  saveState,
  todayInTimezone,
  validateCreativeImage,
  verifyClient,
  xCredentialsHint,
} from "./content";

const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const POSTS_WEEK_PATH = resolve(KIT_ROOT, "posts-week.json");

export type RunPostResult =
  | {
      ok: true;
      tweetId: string;
      url: string;
      postId: string;
      index: number;
      handle: string;
      slot: string;
      postsToday: number;
      postsPerDay: number;
    }
  | {
      ok: false;
      error: string;
      code?: number;
      authErrors?: string[];
      postId?: string;
    };

export type RunPostOptions = {
  force?: boolean;
  postId?: string;
  week?: boolean;
};

export async function runNextPost(options: RunPostOptions = {}): Promise<RunPostResult> {
  const useWeek = options.week ?? existsSync(POSTS_WEEK_PATH);
  const schedule = loadSchedule();
  const { link, posts, account } = loadPosts({ week: useWeek });
  if (posts.length === 0) {
    return { ok: false, error: "posts.json ist leer." };
  }

  const today = todayInTimezone(schedule.timezone);
  const slot = currentSlot(schedule.timezone);
  let state = applyStateReconciliation(loadState(), posts, today);

  if (!options.force && !canPostToday(state, schedule, today)) {
    return {
      ok: false,
      error: `Tageslimit erreicht (${state.postsToday}/${schedule.postsPerDay}).`,
    };
  }

  const selected = options.postId ? findPostById(posts, options.postId) : null;
  if (options.postId && !selected) {
    return { ok: false, error: `Post-ID nicht gefunden: ${options.postId}` };
  }

  const post = selected?.post ?? pickNextPost(posts, state);
  const index = selected?.index ?? nextIndex(state, posts.length, posts);
  const text = buildTweetText(post, link);
  const imagePath = resolveImagePath(post);

  if (imagePath) {
    try {
      validateCreativeImage(imagePath);
    } catch (error) {
      const message = describePostError(error);
      saveState(recordPostFailure(state, today, post.id, message, { slot, index }));
      return { ok: false, error: message, postId: post.id };
    }
  }

  const authResult = await createXClientFresh();
  const client = authResult.client;
  if (!client) {
    const message = authResult.authErrors.join(" · ") || "X-Client konnte nicht erstellt werden.";
    saveState(recordPostFailure(state, today, post.id, message, { slot, index }));
    return {
      ok: false,
      error: `${message} · ${xCredentialsHint()}`,
      authErrors: authResult.authErrors,
      postId: post.id,
    };
  }

  try {
    const user = await verifyClient(client);
    const handle = `@${user.username}`;
    const tweetId = await publishTweet(client, text, imagePath);
    state = recordPost(state, today, index, post.id, tweetId, slot, postMediaMeta(post));
    saveState(state);

    return {
      ok: true,
      tweetId,
      url: `https://x.com/i/web/status/${tweetId}`,
      postId: post.id,
      index: index + 1,
      handle,
      slot,
      postsToday: state.postsToday,
      postsPerDay: schedule.postsPerDay,
    };
  } catch (error) {
    const code = error instanceof ApiResponseError ? error.code : undefined;
    const message = describePostError(error);
    saveState(recordPostFailure(state, today, post.id, message, { slot, index, code }));
    return {
      ok: false,
      error: message,
      code,
      postId: post.id,
    };
  }
}
