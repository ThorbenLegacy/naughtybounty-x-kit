import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { TwitterApi, ApiResponseError } from "twitter-api-v2";
import type { PostEntry, PostFailureEntry, PostHistoryEntry, PostsFile, PostState, ScheduleConfig } from "./types";

const BOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KIT_ROOT = resolve(BOT_DIR, "..");
const POSTS_PATH = resolve(KIT_ROOT, "posts.json");
const POSTS_WEEK_PATH = resolve(KIT_ROOT, "posts-week.json");
const SCHEDULE_PATH = resolve(KIT_ROOT, "config", "schedule.json");

/** Laufzeitdaten — nicht unter bot/ (Railway-Volume würde sonst Quellcode überschreiben). */
export function getPersistDir(): string {
  const custom = process.env.BOT_PERSIST_DIR?.trim();
  return custom ? resolve(custom) : resolve(KIT_ROOT, "data", "persist");
}

function ensurePersistDir(): string {
  const dir = getPersistDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

const LEGACY_STATE_PATH = resolve(BOT_DIR, "state.json");
const LEGACY_OAUTH_TOKENS_PATH = resolve(BOT_DIR, "oauth-tokens.json");

function persistPath(name: string): string {
  return resolve(ensurePersistDir(), name);
}

function migrateLegacyFile(name: string, legacyPath: string): void {
  const target = persistPath(name);
  if (!existsSync(target) && existsSync(legacyPath)) {
    ensurePersistDir();
    copyFileSync(legacyPath, target);
  }
}

type OAuthTokenStore = {
  accessToken: string;
  refreshToken?: string;
  updatedAt: string;
};

/** Shared Volume: frisch refreshte Tokens (Dashboard + Scheduler). */
export function loadOAuthTokenStore(): OAuthTokenStore | null {
  migrateLegacyFile("oauth-tokens.json", LEGACY_OAUTH_TOKENS_PATH);
  const path = persistPath("oauth-tokens.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as OAuthTokenStore;
  } catch {
    return null;
  }
}

export function saveOAuthTokenStore(accessToken: string, refreshToken?: string): void {
  const data: OAuthTokenStore = {
    accessToken,
    ...(refreshToken ? { refreshToken } : {}),
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(persistPath("oauth-tokens.json"), JSON.stringify(data, null, 2), "utf-8");
  process.env.X_OAUTH2_ACCESS_TOKEN = accessToken;
  if (refreshToken) process.env.X_OAUTH2_REFRESH_TOKEN = refreshToken;
}

function effectiveOAuth2Tokens(): { access?: string; refresh?: string } {
  const store = loadOAuthTokenStore();
  return {
    access: store?.accessToken ?? env("X_OAUTH2_ACCESS_TOKEN"),
    refresh: store?.refreshToken ?? env("X_OAUTH2_REFRESH_TOKEN"),
  };
}

export function loadSchedule(): ScheduleConfig {
  return JSON.parse(readFileSync(SCHEDULE_PATH, "utf-8")) as ScheduleConfig;
}

export function loadPosts(options: { week?: boolean } = {}): PostsFile {
  const useWeek = options.week ?? false;
  const path = useWeek && existsSync(POSTS_WEEK_PATH) ? POSTS_WEEK_PATH : POSTS_PATH;
  return JSON.parse(readFileSync(path, "utf-8")) as PostsFile;
}

function emptyState(): PostState {
  return {
    lastIndex: -1,
    todayDate: null,
    postsToday: 0,
    postedSlots: [],
    queueIndex: null,
    history: [],
    lastFailure: null,
    failures: [],
  };
}

export function loadState(): PostState {
  migrateLegacyFile("state.json", LEGACY_STATE_PATH);
  const statePath = persistPath("state.json");
  let state: PostState;
  if (!existsSync(statePath)) {
    state = emptyState();
  } else {
    const raw = JSON.parse(readFileSync(statePath, "utf-8")) as PostState & {
      lastPostedDate?: string | null;
    };
    state = {
      ...emptyState(),
      ...raw,
      todayDate: raw.todayDate ?? raw.lastPostedDate ?? null,
      postsToday: raw.postsToday ?? (raw.todayDate || raw.lastPostedDate ? 1 : 0),
      postedSlots: raw.postedSlots ?? [],
      lastFailure: raw.lastFailure ?? null,
      failures: raw.failures ?? [],
    };
  }

  const seed = process.env.BOT_LAST_INDEX?.trim();
  if (seed !== undefined && seed !== "") {
    const n = Number.parseInt(seed, 10);
    if (!Number.isNaN(n) && n >= -1 && state.lastIndex < n) {
      state.lastIndex = n;
    }
  }
  return state;
}

export function saveState(state: PostState): void {
  writeFileSync(persistPath("state.json"), JSON.stringify(state, null, 2), "utf-8");
}

export function resetDayIfNeeded(state: PostState, today: string): PostState {
  if (state.todayDate === today) return state;
  return {
    ...state,
    todayDate: today,
    postsToday: 0,
    postedSlots: [],
  };
}

/** Höchster Post-Index laut erfolgreicher Historie (tweetId gesetzt). */
export function effectiveLastIndex(state: PostState, posts: PostEntry[]): number {
  let maxIdx = state.lastIndex;
  for (const h of state.history) {
    if (!isVerifiedHistoryEntry(h)) continue;
    const found = posts.findIndex((p) => p.id === h.postId);
    if (found >= 0) maxIdx = Math.max(maxIdx, found);
  }
  return maxIdx;
}

/** State mit Historie und Tages-Slots abgleichen (Dashboard + Scheduler). */
export function applyStateReconciliation(
  state: PostState,
  posts: PostEntry[],
  today: string,
): PostState {
  const base = resetDayIfNeeded(state, today);
  const lastIndex = effectiveLastIndex(base, posts);
  const todaySuccess = base.history.filter((h) => h.date === today && isVerifiedHistoryEntry(h));
  const postedSlots = [...base.postedSlots];
  for (const h of todaySuccess) {
    if (h.slot && !postedSlots.includes(h.slot)) postedSlots.push(h.slot);
  }
  const postsToday = Math.max(base.postsToday, todaySuccess.length);
  return { ...base, lastIndex, postsToday, postedSlots };
}

export function canPostToday(
  state: PostState,
  schedule: ScheduleConfig,
  today: string,
  options: { force?: boolean } = {},
): boolean {
  if (options.force) return true;
  const current = resetDayIfNeeded(state, today);
  return current.postsToday < schedule.postsPerDay;
}

export function postsRemainingToday(
  state: PostState,
  schedule: ScheduleConfig,
  today: string,
): number {
  const current = resetDayIfNeeded(state, today);
  return Math.max(0, schedule.postsPerDay - current.postsToday);
}

/** Nächster Index: manuelle Queue oder auto (letzter Erfolg + 1). */
export function autoNextIndex(state: PostState, posts: PostEntry[]): number {
  return (effectiveLastIndex(state, posts) + 1) % posts.length;
}

export function resolveQueueIndex(state: PostState, posts: PostEntry[]): number {
  const auto = autoNextIndex(state, posts);
  if (state.queueIndex == null || state.queueIndex === undefined) return auto;
  const idx = state.queueIndex;
  if (idx >= 0 && idx < posts.length) return idx;
  return auto;
}

export function pickNextPost(posts: PostEntry[], state: PostState): PostEntry {
  return posts[resolveQueueIndex(state, posts)]!;
}

export function nextIndex(state: PostState, total: number, posts?: PostEntry[]): number {
  if (posts) return resolveQueueIndex(state, posts);
  return (state.queueIndex ?? state.lastIndex + 1) % total;
}

/** Entfernt fälschlich aus Analytics importierte Historie (ohne Bot-Slot). */
export function stripUnverifiedHistory(state: PostState): PostState {
  const history = state.history.filter((h) => !h.tweetId || h.slot);
  return history.length === state.history.length ? state : { ...state, history };
}

export function isVerifiedHistoryEntry(h: PostHistoryEntry): boolean {
  return Boolean(h.tweetId && h.slot);
}

export function isPostPublished(state: PostState, postId: string): boolean {
  return state.history.some((h) => h.postId === postId && isVerifiedHistoryEntry(h));
}

export function publishedPostIds(state: PostState): string[] {
  const ids = new Set<string>();
  for (const h of state.history) {
    if (isVerifiedHistoryEntry(h)) ids.add(h.postId);
  }
  return [...ids];
}

export function shiftQueue(state: PostState, posts: PostEntry[], delta: number): PostState {
  const current = resolveQueueIndex(state, posts);
  const next = (current + delta + posts.length) % posts.length;
  return { ...state, queueIndex: next };
}

export function resetQueue(state: PostState): PostState {
  return { ...state, queueIndex: null };
}

export function setQueueByPostId(
  state: PostState,
  posts: PostEntry[],
  postId: string,
): PostState | null {
  const found = findPostById(posts, postId);
  if (!found) return null;
  return { ...state, queueIndex: found.index };
}

export function findPostById(posts: PostEntry[], id: string): { post: PostEntry; index: number } | null {
  const index = posts.findIndex((p) => p.id === id);
  if (index < 0) return null;
  return { post: posts[index]!, index };
}

export const OAUTH2_SCOPES = [
  "tweet.read",
  "tweet.write",
  "users.read",
  "media.write",
  "offline.access",
] as const;

const X_HANDLE = "@naughtybounty";

export function formatHashtags(tags?: string[]): string {
  if (!tags?.length) return "";
  return tags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");
}

export function buildTweetText(post: PostEntry, defaultLink: string): string {
  const body = post.text.trim();
  const link = post.link?.trim() || defaultLink;
  const tagLine = formatHashtags(post.hashtags);
  const footer = tagLine ? `\n\n${X_HANDLE} ${tagLine}` : `\n\n${X_HANDLE}`;
  const suffix = `\n\n${link}${footer}`;
  const maxBody = 280 - suffix.length;
  if (body.length <= maxBody) {
    return body + suffix;
  }
  return body.slice(0, maxBody - 1).trimEnd() + "…" + suffix;
}

export function resolveImagePath(post: PostEntry): string | null {
  if (!post.image) return null;
  const abs = resolve(KIT_ROOT, post.image);
  return existsSync(abs) ? abs : null;
}

export function validateCreativeImage(imagePath: string): void {
  if (isVideoPath(imagePath) || imagePath.replace(/\\/g, "/").includes("/uploads/")) {
    return;
  }
  const rel = relative(KIT_ROOT, imagePath).replace(/\\/g, "/");
  const script = resolve(KIT_ROOT, "scripts", "validate-creative.py");
  const py = process.platform === "win32" ? "python" : "python3";
  const result = spawnSync(py, [script, rel], {
    cwd: KIT_ROOT,
    encoding: "utf-8",
  });
  if (result.stdout?.trim()) console.log(result.stdout.trim());
  if (result.status !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim() || "Unbekannter Fehler";
    throw new Error(
      `Creative-Check fehlgeschlagen — Post abgebrochen.\n${detail}\nFix: npm run build && npm run export`,
    );
  }
}

function env(name: string): string | undefined {
  let value = process.env[name]?.trim();
  if (!value) return undefined;
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value || undefined;
}

function formatApiError(error: unknown): string {
  if (error instanceof ApiResponseError) {
    const detail = error.errors?.length
      ? error.errors.map((e) => e.message).join("; ")
      : typeof error.data === "object" && error.data && "detail" in error.data
        ? String((error.data as { detail?: string }).detail)
        : JSON.stringify(error.errors ?? error.data ?? "");
    return `X API ${error.code}: ${detail}`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

export function describePostError(error: unknown): string {
  return formatApiError(error);
}

async function verifyXClient(client: TwitterApi): Promise<void> {
  await client.v2.me({ "user.fields": ["username"] });
}

export type XClientResult = {
  client: TwitterApi | null;
  authMethod: "oauth2" | "oauth1" | null;
  authErrors: string[];
};

/** OAuth2 testen/refreshen, bei Fehler OAuth1 — wichtig für Railway. */
export async function createXClientFresh(): Promise<XClientResult> {
  const authErrors: string[] = [];

  const { access: oauth2Token, refresh: refreshTokenEnv } = effectiveOAuth2Tokens();
  if (oauth2Token) {
    const direct = new TwitterApi(oauth2Token);
    try {
      await verifyXClient(direct);
      return { client: direct, authMethod: "oauth2", authErrors: [] };
    } catch (e) {
      authErrors.push(`OAuth2 Access: ${formatApiError(e)}`);
    }

    const clientId = env("X_CLIENT_ID");
    const clientSecret = env("X_CLIENT_SECRET");
    const refreshToken = refreshTokenEnv;
    if (clientId && clientSecret && refreshToken) {
      try {
        const app = new TwitterApi({ clientId, clientSecret });
        const result = await app.refreshOAuth2Token(refreshToken);
        saveOAuthTokenStore(result.accessToken, result.refreshToken ?? refreshToken);
        await verifyXClient(result.client);
        return { client: result.client, authMethod: "oauth2", authErrors: [] };
      } catch (e) {
        authErrors.push(`OAuth2 Refresh: ${formatApiError(e)}`);
        authErrors.push(
          "Hinweis: X_CLIENT_ID/SECRET = OAuth-2.0-Client aus Developer Portal (User Auth Settings), nicht API Key/Secret.",
        );
        authErrors.push(
          "Nach Token-Rotation: oauth-tokens.json auf Shared Volume prüfen (Mount /app/data/persist, nicht /app/bot).",
        );
      }
    }
  }

  const oauth1 = createOAuth1Client();
  if (oauth1) {
    try {
      await verifyXClient(oauth1);
      return { client: oauth1, authMethod: "oauth1", authErrors: [] };
    } catch (e) {
      authErrors.push(`OAuth1: ${formatApiError(e)}`);
    }
  }

  return { client: null, authMethod: null, authErrors };
}

export function authMode(): "oauth2" | "oauth1" | null {
  if (env("X_OAUTH2_ACCESS_TOKEN")) return "oauth2";
  if (
    env("X_API_KEY") &&
    env("X_API_SECRET") &&
    env("X_ACCESS_TOKEN") &&
    env("X_ACCESS_TOKEN_SECRET")
  ) {
    return "oauth1";
  }
  return null;
}

export function createOAuth1Client(): TwitterApi | null {
  const appKey = env("X_API_KEY");
  const appSecret = env("X_API_SECRET");
  const accessToken = env("X_ACCESS_TOKEN");
  const accessSecret = env("X_ACCESS_TOKEN_SECRET");
  if (!appKey || !appSecret || !accessToken || !accessSecret) return null;
  return new TwitterApi({ appKey, appSecret, accessToken, accessSecret });
}

export function createXClient(): TwitterApi | null {
  const oauth2 = env("X_OAUTH2_ACCESS_TOKEN");
  if (oauth2) return new TwitterApi(oauth2);
  return createOAuth1Client();
}

export function xCredentialsHint(): string {
  const mode = authMode();
  if (mode === "oauth2") return "OAuth2 konfiguriert";
  if (mode === "oauth1") return "OAuth1 konfiguriert";
  return "X-API fehlt — X_OAUTH2_ACCESS_TOKEN (+ Refresh) in Railway Variables setzen";
}

/** Welche X-Variablen gesetzt sind (ohne Werte) — für Scheduler-Logs / Railway-Diagnose. */
export function xCredentialsDiagnostic(): string[] {
  const lines: string[] = [];
  const mark = (name: string) => {
    const v = env(name);
    if (!v) return lines.push(`  ${name}: fehlt`);
    lines.push(`  ${name}: gesetzt (${v.length} Zeichen)`);
  };
  mark("X_OAUTH2_ACCESS_TOKEN");
  mark("X_OAUTH2_REFRESH_TOKEN");
  mark("X_CLIENT_ID");
  mark("X_CLIENT_SECRET");
  mark("X_API_KEY");
  mark("X_ACCESS_TOKEN");
  const cid = env("X_CLIENT_ID");
  const apiKey = env("X_API_KEY");
  if (cid && apiKey && cid === apiKey) {
    lines.push("  ⚠ X_CLIENT_ID = X_API_KEY — falsch! OAuth-2.0-Client-ID aus User Auth Settings verwenden.");
  }
  return lines;
}

function mediaTypeForPath(imagePath: string): string {
  const lower = imagePath.toLowerCase();
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/png";
}

function isVideoPath(imagePath: string): boolean {
  return /\.(mp4|mov|webm)$/i.test(imagePath);
}

function mediaUploadError(error: unknown): string {
  if (error instanceof ApiResponseError) {
    return `${error.code} ${JSON.stringify(error.errors ?? error.data ?? "")}`;
  }
  return String(error);
}

export async function uploadPostMedia(
  imagePath: string,
  primaryClient: TwitterApi,
): Promise<string> {
  const attempts: Array<{ label: string; run: () => Promise<string> }> = [
    {
      label: "OAuth2 v2",
      run: async () => {
        const buf = readFileSync(imagePath);
        return primaryClient.readWrite.v2.uploadMedia(buf, {
          media_type: mediaTypeForPath(imagePath),
        });
      },
    },
    {
      label: "v1",
      run: () => primaryClient.readWrite.v1.uploadMedia(imagePath),
    },
  ];

  const oauth1 = createOAuth1Client();
  if (oauth1) {
    attempts.push({
      label: "OAuth1 v1",
      run: () => oauth1.readWrite.v1.uploadMedia(imagePath),
    });
  }

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      const mediaId = await attempt.run();
      console.log(`Bild hochgeladen (${attempt.label}): ${mediaId}`);
      return mediaId;
    } catch (error) {
      lastError = error;
      console.warn(`Bild-Upload ${attempt.label} fehlgeschlagen: ${mediaUploadError(error)}`);
    }
  }

  const hint =
    "OAuth2-Token braucht Scope media.write — npm run x:oauth2 ausführen und Token neu holen.";
  throw new Error(`Bild-Upload fehlgeschlagen. ${hint}`, { cause: lastError });
}

export async function testMediaUpload(client: TwitterApi): Promise<boolean> {
  const sample = resolve(KIT_ROOT, "exports/brand/deine-regeln.png");
  if (!existsSync(sample)) return false;
  try {
    await uploadPostMedia(sample, client);
    return true;
  } catch {
    return false;
  }
}

export async function verifyClient(client: TwitterApi) {
  const { data } = await client.v2.me({ "user.fields": ["username", "name"] });
  if (!data?.id || !data.username) {
    throw new Error("X API: /2/users/me lieferte keine User-Daten");
  }
  return { id: data.id, username: data.username, name: data.name ?? data.username };
}

export async function publishTweet(
  client: TwitterApi,
  text: string,
  imagePath: string | null,
  options: { skipImage?: boolean; allowTextOnly?: boolean } = {},
): Promise<string> {
  const rw = client.readWrite;
  let mediaIds: [string] | undefined;
  if (imagePath && !options.skipImage) {
    try {
      mediaIds = [await uploadPostMedia(imagePath, client)];
    } catch (error) {
      if (options.allowTextOnly) {
        console.warn("Bild-Upload fehlgeschlagen — poste nur Text (--allow-text-only).");
      } else {
        throw error;
      }
    }
  }
  const { data } = await rw.v2.tweet({
    text,
    ...(mediaIds ? { media: { media_ids: mediaIds } } : {}),
  });
  if (!data?.id) throw new Error("X API: Tweet ohne ID");
  return data.id;
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function todayInTimezone(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function currentSlot(timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

export function recordPost(
  state: PostState,
  today: string,
  index: number,
  postId: string,
  tweetId?: string,
  slot?: string,
  media?: { image?: string; colorScheme?: "dark" | "light" },
): PostState {
  const base = resetDayIfNeeded(state, today);
  const postedSlots = slot && !base.postedSlots.includes(slot)
    ? [...base.postedSlots, slot]
    : base.postedSlots;
  return {
    lastIndex: index,
    todayDate: today,
    postsToday: base.postsToday + 1,
    postedSlots,
    queueIndex: null,
    lastFailure: null,
    failures: base.failures ?? [],
    history: [
      ...base.history.slice(-180),
      {
        date: today,
        postId,
        tweetId,
        slot,
        ...(media?.image ? { image: media.image } : {}),
        ...(media?.colorScheme ? { colorScheme: media.colorScheme } : {}),
      },
    ],
  };
}

/** Bild + Look aus Post-Eintrag (tatsächlich gepostetes Creative). */
export function postMediaMeta(post: PostEntry): { image?: string; colorScheme?: "dark" | "light" } {
  const image = post.image?.replace(/\\/g, "/");
  if (!image) return {};
  const colorScheme =
    post.colorScheme ?? (image.includes("exports-light") ? "light" : "dark");
  return { image, colorScheme };
}

export function recordPostFailure(
  state: PostState,
  today: string,
  postId: string,
  message: string,
  options: { slot?: string; index?: number; code?: number } = {},
): PostState {
  const base = resetDayIfNeeded(state, today);
  const failure: PostFailureEntry = {
    at: new Date().toISOString(),
    date: today,
    slot: options.slot,
    postId,
    index: options.index,
    message,
    code: options.code,
  };
  return {
    ...base,
    lastFailure: failure,
    failures: [...(base.failures ?? []).slice(-49), failure],
  };
}

export function hasCredentials(): boolean {
  return authMode() !== null;
}

export { KIT_ROOT };
