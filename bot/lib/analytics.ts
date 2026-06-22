import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TwitterApi, ApiResponseError } from "twitter-api-v2";
import { createXClientFresh, loadState } from "./content";

const BOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KIT_ROOT = resolve(BOT_DIR, "..");
const ANALYTICS_PATH = resolve(KIT_ROOT, "data", "analytics.json");
const CATALOG_PATH = resolve(KIT_ROOT, "data", "content-catalog.json");

export interface TweetMetrics {
  tweetId: string;
  url: string;
  createdAt: string;
  text: string;
  lang?: string;
  hasMedia: boolean;
  publicMetrics: {
    retweetCount: number;
    replyCount: number;
    likeCount: number;
    quoteCount: number;
    bookmarkCount: number;
    impressionCount?: number;
  };
  organicMetrics?: {
    impressionCount?: number;
    urlLinkClicks?: number;
    userProfileClicks?: number;
    retweetCount?: number;
    replyCount?: number;
    likeCount?: number;
  };
  nonPublicMetrics?: {
    impressionCount?: number;
    urlLinkClicks?: number;
    userProfileClicks?: number;
  };
  linkedPostId: string | null;
  matchSource: "history" | "text" | null;
  engagementRate: number | null;
  creativePath: string | null;
}

export interface AnalyticsData {
  fetchedAt: string;
  account: {
    id: string;
    username: string;
    name: string;
    followersCount: number;
    followingCount: number;
    tweetCount: number;
    listedCount: number;
  } | null;
  totals: {
    tweetsFetched: number;
    linkedPosts: number;
    totalImpressions: number;
    totalLikes: number;
    totalRetweets: number;
    totalReplies: number;
    totalQuotes: number;
    totalBookmarks: number;
    avgEngagementRate: number | null;
  };
  tweets: TweetMetrics[];
  errors: string[];
  notes: string[];
}

function loadCatalogPosts(): Array<{ id: string; description: string; creativePath?: string }> {
  if (!existsSync(CATALOG_PATH)) return [];
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf-8")) as {
    posts: Array<{ id: string; description: string; creativePath?: string }>;
  };
  return catalog.posts ?? [];
}

function historyMap(): Map<string, { postId: string; date?: string }> {
  const map = new Map<string, { postId: string; date?: string }>();
  for (const h of loadState().history) {
    if (h.tweetId) map.set(h.tweetId, { postId: h.postId, date: h.date });
  }
  return map;
}

function matchPostByText(
  tweetText: string,
  posts: Array<{ id: string; description: string; creativePath?: string }>,
): { postId: string; creativePath: string | null } | null {
  const normalized = tweetText.replace(/\s+/g, " ").trim().toLowerCase();
  for (const p of posts) {
    const snippet = p.description.split("\n")[0]?.trim().toLowerCase();
    if (snippet && snippet.length >= 12 && normalized.includes(snippet.slice(0, 40))) {
      return { postId: p.id, creativePath: p.creativePath ?? null };
    }
  }
  return null;
}

function impressionsOf(t: TweetMetrics): number {
  return (
    t.organicMetrics?.impressionCount ??
    t.nonPublicMetrics?.impressionCount ??
    t.publicMetrics.impressionCount ??
    0
  );
}

function engagementRate(t: TweetMetrics): number | null {
  const impressions = impressionsOf(t);
  if (!impressions) return null;
  const engagement =
    t.publicMetrics.likeCount +
    t.publicMetrics.retweetCount +
    t.publicMetrics.replyCount +
    t.publicMetrics.quoteCount;
  return Math.round((engagement / impressions) * 10000) / 100;
}

function mapTweet(
  raw: {
    id: string;
    text?: string;
    created_at?: string;
    lang?: string;
    attachments?: { media_keys?: string[] };
    public_metrics?: {
      retweet_count?: number;
      reply_count?: number;
      like_count?: number;
      quote_count?: number;
      bookmark_count?: number;
      impression_count?: number;
    };
    organic_metrics?: {
      impression_count?: number;
      url_link_clicks?: number;
      user_profile_clicks?: number;
      retweet_count?: number;
      reply_count?: number;
      like_count?: number;
    };
    non_public_metrics?: {
      impression_count?: number;
      url_link_clicks?: number;
      user_profile_clicks?: number;
    };
  },
  hist: Map<string, { postId: string }>,
  posts: Array<{ id: string; description: string; creativePath?: string }>,
): TweetMetrics {
  const pm = raw.public_metrics ?? {};
  const om = raw.organic_metrics;
  const npm = raw.non_public_metrics;
  let linkedPostId: string | null = hist.get(raw.id)?.postId ?? null;
  let matchSource: TweetMetrics["matchSource"] = linkedPostId ? "history" : null;
  let creativePath: string | null = null;

  if (!linkedPostId && raw.text) {
    const matched = matchPostByText(raw.text, posts);
    if (matched) {
      linkedPostId = matched.postId;
      creativePath = matched.creativePath;
      matchSource = "text";
    }
  } else if (linkedPostId) {
    const post = posts.find((p) => p.id === linkedPostId);
    creativePath = post?.creativePath ?? null;
  }

  const entry: TweetMetrics = {
    tweetId: raw.id,
    url: `https://x.com/i/web/status/${raw.id}`,
    createdAt: raw.created_at ?? "",
    text: raw.text ?? "",
    lang: raw.lang,
    hasMedia: Boolean(raw.attachments?.media_keys?.length),
    publicMetrics: {
      retweetCount: pm.retweet_count ?? 0,
      replyCount: pm.reply_count ?? 0,
      likeCount: pm.like_count ?? 0,
      quoteCount: pm.quote_count ?? 0,
      bookmarkCount: pm.bookmark_count ?? 0,
      impressionCount: pm.impression_count,
    },
    organicMetrics: om
      ? {
          impressionCount: om.impression_count,
          urlLinkClicks: om.url_link_clicks,
          userProfileClicks: om.user_profile_clicks,
          retweetCount: om.retweet_count,
          replyCount: om.reply_count,
          likeCount: om.like_count,
        }
      : undefined,
    nonPublicMetrics: npm
      ? {
          impressionCount: npm.impression_count,
          urlLinkClicks: npm.url_link_clicks,
          userProfileClicks: npm.user_profile_clicks,
        }
      : undefined,
    linkedPostId,
    matchSource,
    engagementRate: null,
    creativePath,
  };
  entry.engagementRate = engagementRate(entry);
  return entry;
}

export function loadAnalytics(): AnalyticsData | null {
  if (!existsSync(ANALYTICS_PATH)) return null;
  return JSON.parse(readFileSync(ANALYTICS_PATH, "utf-8")) as AnalyticsData;
}

export function saveAnalytics(data: AnalyticsData): void {
  writeFileSync(ANALYTICS_PATH, JSON.stringify(data, null, 2), "utf-8");
}

export async function fetchAnalytics(): Promise<AnalyticsData> {
  const errors: string[] = [];
  const notes: string[] = [
    "Impressionen & Klicks erfordern OAuth2 mit tweet.read + ggf. Elevated Access.",
    "Posts werden per bot/state.json (tweetId) oder Text-Match verknüpft.",
  ];

  let client: Awaited<ReturnType<typeof createXClientFresh>> = null;
  try {
    client = await createXClientFresh();
  } catch (e) {
    errors.push(`X-Auth: ${formatApiError(e)}`);
  }

  if (!client) {
    return {
      fetchedAt: new Date().toISOString(),
      account: null,
      totals: {
        tweetsFetched: 0,
        linkedPosts: 0,
        totalImpressions: 0,
        totalLikes: 0,
        totalRetweets: 0,
        totalReplies: 0,
        totalQuotes: 0,
        totalBookmarks: 0,
        avgEngagementRate: null,
      },
      tweets: [],
      errors: [
        ...errors,
        "Kein X-Client — X_OAUTH2_ACCESS_TOKEN, X_OAUTH2_REFRESH_TOKEN, X_CLIENT_ID, X_CLIENT_SECRET in Railway Variables setzen.",
      ],
      notes,
    };
  }

  const hist = historyMap();
  const posts = loadCatalogPosts();
  const tweetFields = [
    "created_at",
    "public_metrics",
    "organic_metrics",
    "non_public_metrics",
    "entities",
    "attachments",
    "text",
    "author_id",
    "lang",
  ] as const;

  let account: AnalyticsData["account"] = null;
  try {
    const me = await client.v2.me({
      "user.fields": ["public_metrics", "username", "name"],
    });
    const u = me.data;
    if (u) {
      account = {
        id: u.id,
        username: u.username ?? "unknown",
        name: u.name ?? "",
        followersCount: u.public_metrics?.followers_count ?? 0,
        followingCount: u.public_metrics?.following_count ?? 0,
        tweetCount: u.public_metrics?.tweet_count ?? 0,
        listedCount: u.public_metrics?.listed_count ?? 0,
      };
    }
  } catch (e) {
    errors.push(`Account: ${formatApiError(e)}`);
  }

  const seen = new Map<string, TweetMetrics>();
  const historyIds = [...hist.keys()];

  if (account?.id) {
    try {
      const timeline = await client.v2.userTimeline(account.id, {
        max_results: 100,
        exclude: ["retweets"],
        "tweet.fields": [...tweetFields],
      });
      for await (const tweet of timeline) {
        if (tweet.id) seen.set(tweet.id, mapTweet(tweet, hist, posts));
      }
    } catch (e) {
      errors.push(`Timeline: ${formatApiError(e)}`);
    }
  }

  const missingIds = historyIds.filter((id) => !seen.has(id));
  if (missingIds.length) {
    for (let i = 0; i < missingIds.length; i += 100) {
      const batch = missingIds.slice(i, i + 100);
      try {
        const lookup = await client.v2.tweets(batch, { "tweet.fields": [...tweetFields] });
        for (const tweet of lookup.data ?? []) {
          seen.set(tweet.id, mapTweet(tweet, hist, posts));
        }
      } catch (e) {
        errors.push(`Lookup ${batch.join(",")}: ${formatApiError(e)}`);
      }
    }
  }

  const tweets = [...seen.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  let totalImpressions = 0;
  let totalLikes = 0;
  let totalRetweets = 0;
  let totalReplies = 0;
  let totalQuotes = 0;
  let totalBookmarks = 0;
  let engagementSum = 0;
  let engagementCount = 0;

  for (const t of tweets) {
    totalImpressions += impressionsOf(t);
    totalLikes += t.publicMetrics.likeCount;
    totalRetweets += t.publicMetrics.retweetCount;
    totalReplies += t.publicMetrics.replyCount;
    totalQuotes += t.publicMetrics.quoteCount;
    totalBookmarks += t.publicMetrics.bookmarkCount;
    if (t.engagementRate != null) {
      engagementSum += t.engagementRate;
      engagementCount++;
    }
  }

  const data: AnalyticsData = {
    fetchedAt: new Date().toISOString(),
    account,
    totals: {
      tweetsFetched: tweets.length,
      linkedPosts: tweets.filter((t) => t.linkedPostId).length,
      totalImpressions,
      totalLikes,
      totalRetweets,
      totalReplies,
      totalQuotes,
      totalBookmarks,
      avgEngagementRate: engagementCount ? Math.round((engagementSum / engagementCount) * 100) / 100 : null,
    },
    tweets,
    errors,
    notes,
  };

  saveAnalytics(data);
  return data;
}

function formatApiError(error: unknown): string {
  if (error instanceof ApiResponseError) {
    return `${error.code} ${JSON.stringify(error.errors ?? error.data ?? "")}`;
  }
  return String(error);
}
