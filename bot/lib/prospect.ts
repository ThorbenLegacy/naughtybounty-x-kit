import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import { TwitterApi, ApiResponseError } from "twitter-api-v2";
import { createXClientFresh, describePostError, getPersistDir } from "./content";

const BOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KIT_ROOT = resolve(BOT_DIR, "..");
const CONFIG_PATH = resolve(KIT_ROOT, "config", "prospect.json");

export type ProspectConfig = {
  defaultQuery: string;
  defaultComment: string;
  followersMin: number;
  followersMax: number;
  femaleHeuristic: boolean;
  preferLatestTweet: boolean;
  searchMaxResults: number;
  autoCommentDelayMs: number;
  autoCommentMaxPerRun: number;
};

export type ProspectHit = {
  tweetId: string;
  tweetText: string;
  tweetCreatedAt: string;
  tweetUrl: string;
  userId: string;
  username: string;
  name: string;
  description: string;
  followers: number;
  alreadyCommented: boolean;
};

type ProspectState = {
  commentedTweetIds: string[];
  lastSearch?: { at: string; query: string; found: number };
};

const FEMALE_KEYWORDS = [
  "she/her",
  "frau",
  "girl",
  "model",
  "content creator",
  "onlyfans",
  "göttin",
  "princess",
  "queen",
  "creatorin",
  "domina",
  "mistress",
];

function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v || undefined;
}

function statePath(): string {
  const dir = getPersistDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return resolve(dir, "prospect-state.json");
}

export function loadProspectConfig(): ProspectConfig {
  const defaults: ProspectConfig = {
    defaultQuery:
      "#onlyfans OR #contentcreator place_country:DE lang:de -is:retweet -is:reply",
    defaultComment:
      "Hey! Auf NaughtyBounty behältst du die Kontrolle: https://naughtybounty.com/for-creators",
    followersMin: 200,
    followersMax: 10000,
    femaleHeuristic: true,
    preferLatestTweet: false,
    searchMaxResults: 40,
    autoCommentDelayMs: 3000,
    autoCommentMaxPerRun: 10,
  };
  if (!existsSync(CONFIG_PATH)) return defaults;
  return { ...defaults, ...JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) };
}

export function loadProspectState(): ProspectState {
  const path = statePath();
  if (!existsSync(path)) return { commentedTweetIds: [] };
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as ProspectState;
  } catch {
    return { commentedTweetIds: [] };
  }
}

function saveProspectState(state: ProspectState): void {
  writeFileSync(statePath(), JSON.stringify(state, null, 2), "utf-8");
}

function commentedSet(state: ProspectState): Set<string> {
  return new Set(state.commentedTweetIds);
}

function markCommented(tweetId: string): void {
  const state = loadProspectState();
  if (!state.commentedTweetIds.includes(tweetId)) {
    state.commentedTweetIds = [...state.commentedTweetIds.slice(-4999), tweetId];
    saveProspectState(state);
  }
}

export function isFemaleProfile(name: string, username: string, description: string): boolean {
  const text = `${name} ${username} ${description}`.toLowerCase();
  return FEMALE_KEYWORDS.some((kw) => text.includes(kw));
}

function createReadClient(oauth: TwitterApi | null): { client: TwitterApi | null; via: "oauth" | "bearer" | null } {
  // OAuth2/OAuth1 zuerst — funktioniert zuverlässig, wenn Posting/KPIs laufen.
  // Bearer nur als Fallback (App-only Token aus dem Portal ist oft ungültig/abgelaufen).
  if (oauth) return { client: oauth, via: "oauth" };
  const bearer = env("X_BEARER_TOKEN");
  if (bearer) return { client: new TwitterApi(bearer), via: "bearer" };
  return { client: null, via: null };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export async function searchProspects(options: {
  query: string;
  followersMin: number;
  followersMax: number;
  femaleHeuristic: boolean;
  maxResults: number;
}): Promise<{ hits: ProspectHit[]; scanned: number; notes: string[] }> {
  const auth = await createXClientFresh();
  const { client, via } = createReadClient(auth.client);
  if (!client) {
    throw new Error(
      auth.authErrors.join(" · ") ||
        "X-API fehlt — OAuth2 (tweet.read) oder X_BEARER_TOKEN für Suche konfigurieren.",
    );
  }

  const notes: string[] = [];
  if (via === "oauth" && auth.authMethod) notes.push(`Suche via ${auth.authMethod}`);
  else if (via === "bearer") notes.push("Suche via Bearer Token");

  const state = loadProspectState();
  const commented = commentedSet(state);
  const hits: ProspectHit[] = [];
  let scanned = 0;
  const target = Math.min(100, Math.max(10, options.maxResults));
  const perPage = Math.min(100, Math.max(10, Math.min(50, target)));

  try {
    const paginator = await client.v2.search(options.query, {
      max_results: perPage,
      "tweet.fields": ["author_id", "created_at", "public_metrics", "text"],
      "user.fields": ["public_metrics", "description", "location", "username", "name"],
      expansions: ["author_id"],
    });

    for await (const tweet of paginator) {
      scanned += 1;
      const usersById = new Map((paginator.includes?.users ?? []).map((u) => [u.id, u]));
      const user = usersById.get(tweet.author_id ?? "");
      if (!user) continue;
      const followers = user.public_metrics?.followers_count ?? 0;
      if (followers < options.followersMin || followers > options.followersMax) continue;
      if (
        options.femaleHeuristic &&
        !isFemaleProfile(user.name ?? "", user.username ?? "", user.description ?? "")
      ) {
        continue;
      }
      const tweetId = tweet.id;
      hits.push({
        tweetId,
        tweetText: tweet.text ?? "",
        tweetCreatedAt: tweet.created_at ?? "",
        tweetUrl: `https://x.com/${user.username}/status/${tweetId}`,
        userId: user.id,
        username: user.username ?? "",
        name: user.name ?? "",
        description: user.description ?? "",
        followers,
        alreadyCommented: commented.has(tweetId),
      });
      if (hits.length >= target) break;
    }
  } catch (e) {
    if (e instanceof ApiResponseError && e.code === 401) {
      throw new Error(
        via === "bearer"
          ? "Bearer Token ungültig (401). OAuth2 in .env.local/Railway setzen oder neuen Bearer im X Developer Portal erzeugen."
          : "X-Auth ungültig (401). OAuth2 erneuern: npm run x:oauth2 bzw. npm run x:refresh",
      );
    }
    if (e instanceof ApiResponseError && e.code === 403) {
      throw new Error(
        "Search API nicht freigeschaltet (403). X API Basic/Elevated + Recent Search nötig, oder X_BEARER_TOKEN setzen.",
      );
    }
    throw e;
  }

  state.lastSearch = { at: new Date().toISOString(), query: options.query, found: hits.length };
  saveProspectState(state);

  return { hits, scanned, notes };
}

async function resolveTargetTweetId(
  client: TwitterApi,
  options: { tweetId?: string; username?: string; preferLatest: boolean },
): Promise<string> {
  if (!options.preferLatest && options.tweetId) return options.tweetId;
  const username = options.username?.replace(/^@/, "").trim();
  if (!username) throw new Error("username oder tweetId erforderlich");

  const userRes = await client.v2.userByUsername(username, { "user.fields": ["id"] });
  const userId = userRes.data?.id;
  if (!userId) throw new Error(`Profil @${username} nicht gefunden`);

  const timeline = await client.v2.userTimeline(userId, {
    max_results: 10,
    exclude: ["replies", "retweets"],
    "tweet.fields": ["created_at", "text"],
  });
  const latest = timeline.tweets[0];
  if (!latest?.id) throw new Error(`Kein öffentlicher Tweet von @${username}`);
  return latest.id;
}

export async function postProspectComment(options: {
  tweetId?: string;
  username?: string;
  text: string;
  preferLatestTweet?: boolean;
}): Promise<{ ok: true; tweetId: string; replyId: string; url: string } | { ok: false; error: string }> {
  const auth = await createXClientFresh();
  if (!auth.client) {
    return { ok: false, error: auth.authErrors.join(" · ") || "OAuth2 für Kommentare nötig (tweet.write)" };
  }

  const text = options.text.trim();
  if (!text) return { ok: false, error: "Kommentar-Text fehlt" };
  if (text.length > 280) return { ok: false, error: "Kommentar zu lang (max. 280 Zeichen)" };

  try {
    const targetId = await resolveTargetTweetId(auth.client, {
      tweetId: options.tweetId,
      username: options.username,
      preferLatest: options.preferLatestTweet ?? false,
    });

    const state = loadProspectState();
    if (commentedSet(state).has(targetId)) {
      return { ok: false, error: "Auf diesen Tweet wurde bereits geantwortet" };
    }

    const reply = await auth.client.v2.reply(text, targetId);
    const replyId = reply.data?.id;
    if (!replyId) return { ok: false, error: "X API: Antwort ohne ID" };

    markCommented(targetId);
    return {
      ok: true,
      tweetId: targetId,
      replyId,
      url: `https://x.com/i/web/status/${replyId}`,
    };
  } catch (e) {
    return { ok: false, error: describePostError(e) };
  }
}

export async function autoCommentProspects(options: {
  items: Array<{ tweetId?: string; username: string }>;
  text: string;
  preferLatestTweet?: boolean;
  delayMs: number;
  maxCount: number;
}): Promise<{
  results: Array<{ username: string; ok: boolean; url?: string; error?: string }>;
  stopped: boolean;
}> {
  const max = Math.min(options.maxCount, options.items.length);
  const results: Array<{ username: string; ok: boolean; url?: string; error?: string }> = [];

  for (let i = 0; i < max; i++) {
    const item = options.items[i]!;
    const result = await postProspectComment({
      tweetId: item.tweetId,
      username: item.username,
      text: options.text,
      preferLatestTweet: options.preferLatestTweet,
    });
    if (result.ok) {
      results.push({ username: item.username, ok: true, url: result.url });
    } else {
      results.push({ username: item.username, ok: false, error: result.error });
      if (result.error?.includes("429") || result.error?.includes("Rate")) {
        return { results, stopped: true };
      }
    }
    if (i < max - 1) await sleep(Math.max(1500, options.delayMs));
  }

  return { results, stopped: false };
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function sendJson(res: ServerResponse, data: unknown, code = 200): void {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

export async function handleProspectApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
): Promise<boolean> {
  if (!pathname.startsWith("/api/prospect/")) return false;

  if (method === "GET" && pathname === "/api/prospect/config") {
    const cfg = loadProspectConfig();
    const state = loadProspectState();
    sendJson(res, {
      config: cfg,
      commentedCount: state.commentedTweetIds.length,
      lastSearch: state.lastSearch ?? null,
    });
    return true;
  }

  if (method === "POST" && pathname === "/api/prospect/search") {
    try {
      const body = (await readJsonBody(req)) as Partial<{
        query: string;
        followersMin: number;
        followersMax: number;
        femaleHeuristic: boolean;
        maxResults: number;
      }>;
      const cfg = loadProspectConfig();
      const result = await searchProspects({
        query: (body.query ?? cfg.defaultQuery).trim(),
        followersMin: body.followersMin ?? cfg.followersMin,
        followersMax: body.followersMax ?? cfg.followersMax,
        femaleHeuristic: body.femaleHeuristic ?? cfg.femaleHeuristic,
        maxResults: body.maxResults ?? cfg.searchMaxResults,
      });
      sendJson(res, { ok: true, ...result });
    } catch (e) {
      sendJson(res, { ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
    }
    return true;
  }

  if (method === "POST" && pathname === "/api/prospect/comment") {
    try {
      const body = (await readJsonBody(req)) as {
        tweetId?: string;
        username?: string;
        text?: string;
        preferLatestTweet?: boolean;
      };
      const cfg = loadProspectConfig();
      const result = await postProspectComment({
        tweetId: body.tweetId,
        username: body.username,
        text: body.text ?? cfg.defaultComment,
        preferLatestTweet: body.preferLatestTweet ?? cfg.preferLatestTweet,
      });
      sendJson(res, result, result.ok ? 200 : 400);
    } catch (e) {
      sendJson(res, { ok: false, error: String(e) }, 500);
    }
    return true;
  }

  if (method === "POST" && pathname === "/api/prospect/auto-comment") {
    try {
      const body = (await readJsonBody(req)) as {
        items?: Array<{ tweetId?: string; username: string }>;
        text?: string;
        preferLatestTweet?: boolean;
        delayMs?: number;
        maxCount?: number;
      };
      const cfg = loadProspectConfig();
      const items = (body.items ?? []).filter((i) => i.username);
      if (!items.length) {
        sendJson(res, { ok: false, error: "Keine Profile ausgewählt" }, 400);
        return true;
      }
      const result = await autoCommentProspects({
        items,
        text: body.text ?? cfg.defaultComment,
        preferLatestTweet: body.preferLatestTweet ?? cfg.preferLatestTweet,
        delayMs: body.delayMs ?? cfg.autoCommentDelayMs,
        maxCount: body.maxCount ?? cfg.autoCommentMaxPerRun,
      });
      sendJson(res, { ok: true, ...result });
    } catch (e) {
      sendJson(res, { ok: false, error: String(e) }, 500);
    }
    return true;
  }

  sendJson(res, { error: "Not found" }, 404);
  return true;
}
