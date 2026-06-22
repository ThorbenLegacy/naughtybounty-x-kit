import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { buildTweetText, KIT_ROOT } from "./content";

const UPLOADS_DIR = resolve(KIT_ROOT, "uploads");
const WEEKS_DIR = resolve(KIT_ROOT, "config", "weeks");
const CREATIVES_HTML = resolve(KIT_ROOT, "creatives", "html");
const CUSTOM_HTML_DIR = resolve(CREATIVES_HTML, "custom");
const POSTS_WEEK_PATH = resolve(KIT_ROOT, "posts-week.json");

export const CUSTOM_HTML_TEMPLATE = {
  dark: `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=1200, height=675" />
  <title>NaughtyBounty — Custom Creative</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Figtree:wght@600;700;900&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 1200px; height: 675px; overflow: hidden; }
    body { font-family: Figtree, ui-sans-serif, system-ui, sans-serif; background: #1e1e2c; color: #f4f4fc; }
    .ad-canvas { width: 1200px; height: 675px; overflow: hidden; position: relative; display: flex; align-items: center; justify-content: center; padding: 48px; }
  </style>
</head>
<body>
  <div class="ad-canvas">
    <h1 style="font-size: 48px; font-weight: 900;">Dein Custom Creative</h1>
  </div>
</body>
</html>`,
  light: `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=1200, height=675" />
  <title>NaughtyBounty — Custom Creative</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Figtree:wght@600;700;900&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 1200px; height: 675px; overflow: hidden; }
    body { font-family: Figtree, ui-sans-serif, system-ui, sans-serif; background: #ffffff; color: #18181b; }
    .ad-canvas { width: 1200px; height: 675px; overflow: hidden; position: relative; display: flex; align-items: center; justify-content: center; padding: 48px; }
  </style>
</head>
<body>
  <div class="ad-canvas">
    <h1 style="font-size: 48px; font-weight: 900; color: #7511bd;">Dein Custom Creative</h1>
  </div>
</body>
</html>`,
} as const;

export function sanitizeCustomSlug(raw: string): string | null {
  const slug = raw.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) return null;
  return slug;
}

function customHtmlAbs(slug: string, theme: "dark" | "light"): string {
  return resolve(CUSTOM_HTML_DIR, theme, `${slug}.html`);
}

function ensureCustomDirs(): void {
  mkdirSync(resolve(CUSTOM_HTML_DIR, "dark"), { recursive: true });
  mkdirSync(resolve(CUSTOM_HTML_DIR, "light"), { recursive: true });
}

export type CustomTemplateMeta = {
  slug: string;
  label: string;
  hasDark: boolean;
  hasLight: boolean;
};

export function listCustomTemplates(): CustomTemplateMeta[] {
  ensureCustomDirs();
  const slugs = new Map<string, CustomTemplateMeta>();
  for (const theme of ["dark", "light"] as const) {
    const dir = resolve(CUSTOM_HTML_DIR, theme);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".html")) continue;
      const slug = file.slice(0, -5);
      const cur = slugs.get(slug) ?? { slug, label: slug, hasDark: false, hasLight: false };
      if (theme === "dark") cur.hasDark = true;
      else cur.hasLight = true;
      slugs.set(slug, cur);
    }
  }
  return [...slugs.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

function listAllCreatives(): Array<{ id: string; label: string; configKey?: StudioConfigKey; custom?: boolean }> {
  const built = listCreativesFromConfigs();
  const custom = listCustomTemplates().map((t) => ({
    id: `custom/${t.slug}`,
    label: `Custom · ${t.label}`,
    custom: true as const,
  }));
  return [...built, ...custom];
}

export const STUDIO_CONFIGS = {
  "brand-creators": {
    path: "config/brand-variants.json",
    kind: "array" as const,
    label: "Brand · Creators",
    creativePrefix: "brand",
  },
  "brand-users": {
    path: "config/brand-variants-users.json",
    kind: "array" as const,
    label: "Brand · Users",
    creativePrefix: "brand-users",
  },
  "bullets-creators": {
    path: "config/bullets-default.json",
    kind: "object" as const,
    label: "Bullets · Creators",
    creativePrefix: "bullets",
    creativeSlug: "bullets/default",
  },
  "bullets-users": {
    path: "config/bullets-users.json",
    kind: "object" as const,
    label: "Bullets · Users",
    creativePrefix: "bullets-users",
    creativeSlug: "bullets-users/default",
  },
  "cards-creators": {
    path: "config/content/cards-creators.json",
    kind: "array" as const,
    label: "Cards · Creators",
    creativePrefix: "cards",
  },
  "cards-users": {
    path: "config/content/cards-users.json",
    kind: "array" as const,
    label: "Cards · Users",
    creativePrefix: "cards",
  },
};

export type StudioConfigKey = keyof typeof STUDIO_CONFIGS;

function pyCmd(): string {
  return process.platform === "win32" ? "python" : "python3";
}

function runPython(script: string, args: string[] = []): string {
  const quoted = args.map((a) => (/\s/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a));
  return execSync(`${pyCmd()} ${script} ${quoted.join(" ")}`, {
    cwd: KIT_ROOT,
    encoding: "utf-8",
  });
}

function sendJson(res: ServerResponse, data: unknown, code = 200): void {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf-8");
}

function configAbs(key: StudioConfigKey): string {
  return resolve(KIT_ROOT, STUDIO_CONFIGS[key].path);
}

export function builtTemplateHtmlRel(creative: string, theme: "dark" | "light"): string | null {
  const suffix = theme === "light" ? "-light" : "";
  const [kind, name] = creative.split("/", 2);
  if (!kind || !name) return null;
  if (kind === "custom") {
    const abs = customHtmlAbs(name, theme);
    return existsSync(abs) ? `custom/${theme}/${name}.html` : null;
  }
  const map: Record<string, string> = {
    brand: `brand${suffix}/x-brand-${name}.html`,
    "brand-users": `brand-users${suffix}/x-brand-u-${name}.html`,
    bullets: `bullets${suffix}/x-bullets-${name === "default" ? "default" : name}.html`,
    "bullets-users": `bullets-users${suffix}/x-bullets-u-default.html`,
    cards: `cards${suffix}/x-card-${name}.html`,
  };
  const rel = map[kind];
  if (!rel) return null;
  const abs = resolve(CREATIVES_HTML, rel);
  if (existsSync(abs)) return rel.replace(/\\/g, "/");
  return creativeHtmlRel(creative, theme);
}

export function readTemplateHtml(creative: string, theme: "dark" | "light"): { html: string; path: string } | null {
  const rel = builtTemplateHtmlRel(creative, theme);
  if (!rel) return null;
  const abs = resolve(CREATIVES_HTML, rel);
  if (!existsSync(abs)) return null;
  return { html: readFileSync(abs, "utf-8"), path: rel };
}

export function creativeHtmlRel(creative: string, theme: "dark" | "light"): string | null {
  const suffix = theme === "light" ? "-light" : "";
  const [kind, name] = creative.split("/", 2);
  if (!kind || !name) return null;
  if (kind === "custom") {
    const abs = customHtmlAbs(name, theme);
    if (!existsSync(abs)) return null;
    return `custom/${theme}/${name}.html`;
  }
  const map: Record<string, string> = {
    brand: `brand${suffix}/x-brand-${name}-standalone.html`,
    "brand-users": `brand-users${suffix}/x-brand-u-${name}-standalone.html`,
    bullets: `bullets${suffix}/x-bullets-${name === "default" ? "default" : name}-standalone.html`,
    "bullets-users": `bullets-users${suffix}/x-bullets-u-default-standalone.html`,
    cards: `cards${suffix}/x-card-${name}-standalone.html`,
  };
  const rel = map[kind];
  if (!rel) return null;
  const abs = resolve(CREATIVES_HTML, rel);
  return existsSync(abs) ? rel.replace(/\\/g, "/") : null;
}

export function creativePngRel(creative: string, theme: "dark" | "light"): string {
  const exportRoot = theme === "light" ? "exports-light" : "exports";
  const [kind, name] = creative.split("/", 2);
  if (kind === "custom") return `${exportRoot}/custom/${name}.png`;
  if (kind === "brand") return `${exportRoot}/brand/${name}.png`;
  if (kind === "brand-users") return `${exportRoot}/brand-users/${name}.png`;
  if (kind === "bullets") return `${exportRoot}/bullets/default.png`;
  if (kind === "bullets-users") return `${exportRoot}/bullets-users/default.png`;
  if (kind === "cards") return `${exportRoot}/cards/${name}.png`;
  return `${exportRoot}/${name}.png`;
}

function listCreativesFromConfigs(): Array<{ id: string; label: string; configKey: StudioConfigKey }> {
  const out: Array<{ id: string; label: string; configKey: StudioConfigKey }> = [];
  for (const [key, meta] of Object.entries(STUDIO_CONFIGS) as [StudioConfigKey, (typeof STUDIO_CONFIGS)[StudioConfigKey]][]) {
    const abs = resolve(KIT_ROOT, meta.path);
    if (!existsSync(abs)) continue;
    const data = JSON.parse(readFileSync(abs, "utf-8"));
    if (meta.kind === "object") {
      const slug = meta.creativeSlug ?? `${meta.creativePrefix}/default`;
      out.push({ id: slug, label: meta.label, configKey: key });
      continue;
    }
    for (const item of data as Array<{ id: string; title?: string }>) {
      out.push({
        id: `${meta.creativePrefix}/${item.id}`,
        label: item.title ?? item.id,
        configKey: key,
      });
    }
  }
  return out;
}

function listWeekFiles(): string[] {
  if (!existsSync(WEEKS_DIR)) return [];
  return readdirSync(WEEKS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
}

function activeWeekFile(): string | null {
  const env = process.env.STUDIO_WEEK?.trim();
  if (env && existsSync(resolve(WEEKS_DIR, env))) return env;
  const files = listWeekFiles();
  return files[files.length - 1] ?? null;
}

function flattenWeekPosts(week: WeekFile): WeekPost[] {
  return week.days.flatMap((d) => d.posts.map((p) => ({ ...p, dayDate: d.date, dayLabel: d.label })));
}

function redistributePosts(week: WeekFile, flat: WeekPost[]): WeekFile {
  const slots = week.slots ?? ["08:00", "14:00", "19:00"];
  const perDay = slots.length;
  let i = 0;
  const days = week.days.map((day) => {
    const posts: WeekPost[] = [];
    for (let s = 0; s < perDay && i < flat.length; s++, i++) {
      const src = flat[i]!;
      const { dayDate: _d, dayLabel: _l, ...rest } = src;
      posts.push({ ...rest, time: slots[s]! });
    }
    return { ...day, posts };
  });
  return { ...week, days };
}

export type WeekPost = {
  time: string;
  audience: string;
  theme: string;
  creative?: string;
  id: string;
  link?: string;
  text: string;
  image?: string | null;
  hashtags?: string[];
  colorScheme?: "dark" | "light";
  mediaType?: "image" | "video" | "creative";
  dayDate?: string;
  dayLabel?: string;
};

export type WeekFile = {
  weekStart: string;
  weekEnd?: string;
  title?: string;
  timezone?: string;
  slots?: string[];
  defaultLink?: string;
  days: Array<{ date: string; label: string; posts: WeekPost[] }>;
};

function ensureUploadsDir(): void {
  if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });
}

export function listUploadFiles(): string[] {
  ensureUploadsDir();
  return readdirSync(UPLOADS_DIR)
    .filter((f) => !f.startsWith("."))
    .sort();
}

export function handleStudioApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
): boolean {
  // GET /api/studio/meta
  if (method === "GET" && pathname === "/api/studio/meta") {
    sendJson(res, {
      configs: Object.entries(STUDIO_CONFIGS).map(([key, m]) => ({
        key,
        label: m.label,
        kind: m.kind,
        path: m.path,
        creativePrefix: m.creativePrefix,
        ...(m.creativeSlug ? { creativeSlug: m.creativeSlug } : {}),
      })),
      creatives: listAllCreatives(),
      customTemplates: listCustomTemplates(),
      weeks: listWeekFiles(),
      activeWeek: activeWeekFile(),
      uploads: listUploadFiles().map((f) => `uploads/${f}`),
      defaultCustomHtml: CUSTOM_HTML_TEMPLATE,
    });
    return true;
  }

  // GET /api/studio/config/:key
  const configGet = pathname.match(/^\/api\/studio\/config\/([a-z-]+)$/);
  if (method === "GET" && configGet) {
    const key = configGet[1] as StudioConfigKey;
    if (!(key in STUDIO_CONFIGS)) {
      sendJson(res, { error: "Unbekannter Config-Typ" }, 404);
      return true;
    }
    const abs = configAbs(key);
    if (!existsSync(abs)) {
      sendJson(res, { error: "Datei fehlt" }, 404);
      return true;
    }
    sendJson(res, JSON.parse(readFileSync(abs, "utf-8")));
    return true;
  }

  // PUT /api/studio/config/:key
  if (method === "PUT" && configGet) {
    void (async () => {
      const key = configGet[1] as StudioConfigKey;
      if (!(key in STUDIO_CONFIGS)) {
        sendJson(res, { error: "Unbekannter Config-Typ" }, 404);
        return;
      }
      try {
        const body = JSON.parse(await readBody(req));
        writeFileSync(configAbs(key), JSON.stringify(body, null, 2), "utf-8");
        sendJson(res, { ok: true });
      } catch (e) {
        sendJson(res, { error: String(e) }, 400);
      }
    })();
    return true;
  }

  // POST /api/studio/build
  if (method === "POST" && pathname === "/api/studio/build") {
    void (async () => {
      await readBody(req);
      try {
        const log = runPython("scripts/build-creatives.py");
        sendJson(res, { ok: true, log });
      } catch (e) {
        sendJson(res, { error: String(e) }, 500);
      }
    })();
    return true;
  }

  // POST /api/studio/export
  if (method === "POST" && pathname === "/api/studio/export") {
    void (async () => {
      try {
        const body = JSON.parse(await readBody(req)) as {
          creative?: string;
          theme?: "dark" | "light" | "both";
        };
        if (!body.creative) {
          sendJson(res, { error: "creative fehlt" }, 400);
          return;
        }
        const theme = body.theme ?? "both";
        const args = ["--creative", body.creative, "--theme", theme];
        const log = runPython("scripts/export-png.py", args);
        const paths = (
          theme === "both"
            ? (["dark", "light"] as const)
            : ([theme === "light" ? "light" : "dark"] as const)
        ).map((t) => creativePngRel(body.creative!, t));
        sendJson(res, { ok: true, log, paths });
      } catch (e) {
        sendJson(res, { error: String(e) }, 500);
      }
    })();
    return true;
  }

  // GET /api/studio/custom
  if (method === "GET" && pathname === "/api/studio/custom") {
    sendJson(res, { templates: listCustomTemplates(), defaultHtml: CUSTOM_HTML_TEMPLATE });
    return true;
  }

  // GET/PUT/DELETE /api/studio/custom/:slug
  const customMatch = pathname.match(/^\/api\/studio\/custom\/([a-z0-9-]+)$/);
  if (customMatch) {
    const slug = customMatch[1]!;
    if (!sanitizeCustomSlug(slug)) {
      sendJson(res, { error: "Ungültiger Slug" }, 400);
      return true;
    }
    const url = new URL(req.url ?? "/", "http://local");
    const themeParam = url.searchParams.get("theme");
    const theme = themeParam === "light" ? "light" : "dark";

    if (method === "GET") {
      const abs = customHtmlAbs(slug, theme);
      if (!existsSync(abs)) {
        sendJson(res, { error: "HTML fehlt", slug, theme }, 404);
        return true;
      }
      sendJson(res, {
        slug,
        theme,
        html: readFileSync(abs, "utf-8"),
        htmlUrl: `/creatives/html/custom/${theme}/${slug}.html`,
        png: `/${creativePngRel(`custom/${slug}`, theme)}`,
      });
      return true;
    }

    if (method === "PUT") {
      void (async () => {
        try {
          const body = JSON.parse(await readBody(req)) as {
            html: string;
            theme?: "dark" | "light";
          };
          const t = body.theme === "light" ? "light" : "dark";
          if (!body.html?.trim()) {
            sendJson(res, { error: "HTML fehlt" }, 400);
            return;
          }
          ensureCustomDirs();
          writeFileSync(customHtmlAbs(slug, t), body.html, "utf-8");
          sendJson(res, {
            ok: true,
            slug,
            theme: t,
            htmlUrl: `/creatives/html/custom/${t}/${slug}.html`,
          });
        } catch (e) {
          sendJson(res, { error: String(e) }, 400);
        }
      })();
      return true;
    }

    if (method === "DELETE") {
      const both = themeParam === "both";
      const removed: string[] = [];
      for (const t of both ? (["dark", "light"] as const) : [theme]) {
        const abs = customHtmlAbs(slug, t);
        if (existsSync(abs)) {
          unlinkSync(abs);
          removed.push(t);
        }
      }
      sendJson(res, { ok: true, removed });
      return true;
    }
  }

  // POST /api/studio/custom — neues Template
  if (method === "POST" && pathname === "/api/studio/custom") {
    void (async () => {
      try {
        const body = JSON.parse(await readBody(req)) as {
          slug: string;
          theme?: "dark" | "light" | "both";
          html?: string;
        };
        const slug = sanitizeCustomSlug(body.slug);
        if (!slug) {
          sendJson(res, { error: "Ungültiger Slug (a-z, 0-9, Bindestrich)" }, 400);
          return;
        }
        const themes =
          body.theme === "both"
            ? (["dark", "light"] as const)
            : body.theme === "light"
              ? (["light"] as const)
              : (["dark"] as const);
        ensureCustomDirs();
        const written: string[] = [];
        for (const t of themes) {
          const abs = customHtmlAbs(slug, t);
          const html = body.html?.trim() || CUSTOM_HTML_TEMPLATE[t];
          writeFileSync(abs, html, "utf-8");
          written.push(t);
        }
        sendJson(res, { ok: true, slug, written, id: `custom/${slug}` });
      } catch (e) {
        sendJson(res, { error: String(e) }, 400);
      }
    })();
    return true;
  }

  // GET /api/studio/weeks
  if (method === "GET" && pathname === "/api/studio/weeks") {
    sendJson(res, { files: listWeekFiles(), active: activeWeekFile() });
    return true;
  }

  // GET/PUT /api/studio/week/:file
  const weekMatch = pathname.match(/^\/api\/studio\/week\/([^/]+)$/);
  if (weekMatch) {
    const file = decodeURIComponent(weekMatch[1]!);
    const abs = resolve(WEEKS_DIR, file);
    if (!file.endsWith(".json") || !abs.startsWith(WEEKS_DIR)) {
      sendJson(res, { error: "Forbidden" }, 403);
      return true;
    }
    if (method === "GET") {
      if (!existsSync(abs)) {
        sendJson(res, { error: "Nicht gefunden" }, 404);
        return true;
      }
      sendJson(res, JSON.parse(readFileSync(abs, "utf-8")));
      return true;
    }
    if (method === "PUT") {
      void (async () => {
        try {
          const body = JSON.parse(await readBody(req)) as WeekFile;
          writeFileSync(abs, JSON.stringify(body, null, 2), "utf-8");
          sendJson(res, { ok: true });
        } catch (e) {
          sendJson(res, { error: String(e) }, 400);
        }
      })();
      return true;
    }
  }

  // POST /api/studio/week/:file/rebuild
  const rebuildMatch = pathname.match(/^\/api\/studio\/week\/([^/]+)\/rebuild$/);
  if (method === "POST" && rebuildMatch) {
    void (async () => {
      await readBody(req);
      const file = decodeURIComponent(rebuildMatch[1]!);
      try {
        const log = runPython("scripts/build-week-schedule.py", [file]);
        try {
          runPython("scripts/build-metadata.py");
        } catch {
          /* optional */
        }
        sendJson(res, { ok: true, log });
      } catch (e) {
        sendJson(res, { error: String(e) }, 500);
      }
    })();
    return true;
  }

  // GET /api/studio/posts-week
  if (method === "GET" && pathname === "/api/studio/posts-week") {
    if (!existsSync(POSTS_WEEK_PATH)) {
      sendJson(res, { error: "posts-week.json fehlt" }, 404);
      return true;
    }
    const data = JSON.parse(readFileSync(POSTS_WEEK_PATH, "utf-8"));
    const { link, posts } = data;
    sendJson(res, {
      ...data,
      previews: (posts as Array<{ id: string; text: string; image?: string; link?: string; hashtags?: string[] }>).map(
        (p, i) => ({
          index: i + 1,
          id: p.id,
          text: buildTweetText(p, link),
          image: p.image ?? null,
        }),
      ),
    });
    return true;
  }

  // PUT /api/studio/posts-week — flache Reihenfolge speichern
  if (method === "PUT" && pathname === "/api/studio/posts-week") {
    void (async () => {
      try {
        const body = JSON.parse(await readBody(req)) as {
          posts: Array<Record<string, unknown>>;
          syncWeek?: string;
        };
        const existing = existsSync(POSTS_WEEK_PATH)
          ? JSON.parse(readFileSync(POSTS_WEEK_PATH, "utf-8"))
          : { account: "LucaBrandblue", link: "https://naughtybounty.com/for-creators" };
        const next = { ...existing, posts: body.posts };
        writeFileSync(POSTS_WEEK_PATH, JSON.stringify(next, null, 2), "utf-8");

        if (body.syncWeek) {
          const weekAbs = resolve(WEEKS_DIR, body.syncWeek);
          if (existsSync(weekAbs)) {
            const week = JSON.parse(readFileSync(weekAbs, "utf-8")) as WeekFile;
            const flat = body.posts as WeekPost[];
            const redistributed = redistributePosts(week, flat);
            writeFileSync(weekAbs, JSON.stringify(redistributed, null, 2), "utf-8");
          }
        }
        sendJson(res, { ok: true });
      } catch (e) {
        sendJson(res, { error: String(e) }, 400);
      }
    })();
    return true;
  }

  // POST /api/studio/upload
  if (method === "POST" && pathname === "/api/studio/upload") {
    void (async () => {
      try {
        const body = JSON.parse(await readBody(req)) as {
          filename: string;
          data: string;
        };
        const safe = body.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
        if (!safe) {
          sendJson(res, { error: "Ungültiger Dateiname" }, 400);
          return;
        }
        ensureUploadsDir();
        const buf = Buffer.from(body.data, "base64");
        const maxMb = 512;
        if (buf.length > maxMb * 1024 * 1024) {
          sendJson(res, { error: `Max ${maxMb} MB` }, 400);
          return;
        }
        const dest = resolve(UPLOADS_DIR, safe);
        writeFileSync(dest, buf);
        sendJson(res, { ok: true, path: `uploads/${safe}`, size: buf.length });
      } catch (e) {
        sendJson(res, { error: String(e) }, 400);
      }
    })();
    return true;
  }

  // GET /api/studio/template-html?creative=&theme=
  if (method === "GET" && pathname === "/api/studio/template-html") {
    const url = new URL(req.url ?? "/", "http://local");
    const creative = url.searchParams.get("creative") ?? "";
    const theme = (url.searchParams.get("theme") === "light" ? "light" : "dark") as "dark" | "light";
    const data = readTemplateHtml(creative, theme);
    if (!data) {
      sendJson(res, { error: "HTML fehlt — zuerst npm run build", creative, theme }, 404);
      return true;
    }
    sendJson(res, {
      creative,
      theme,
      path: data.path,
      html: data.html,
      htmlUrl: `/creatives/html/${data.path}`,
    });
    return true;
  }

  // GET /api/studio/preview-path?creative=&theme=
  if (method === "GET" && pathname === "/api/studio/preview-path") {
    const url = new URL(req.url ?? "/", "http://local");
    const creative = url.searchParams.get("creative") ?? "";
    const theme = (url.searchParams.get("theme") === "light" ? "light" : "dark") as "dark" | "light";
    const htmlRel = creativeHtmlRel(creative, theme);
    if (!htmlRel) {
      sendJson(res, { error: "HTML fehlt — zuerst HTML bauen" }, 404);
      return true;
    }
    sendJson(res, {
      html: `/creatives/html/${htmlRel}`,
      png: `/${creativePngRel(creative, theme)}`,
      creative,
      theme,
    });
    return true;
  }

  return false;
}

export function serveCreativeHtml(
  req: IncomingMessage,
  res: ServerResponse,
  rel: string,
): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  let decoded = rel;
  try {
    decoded = decodeURIComponent(rel);
  } catch {
    sendJson(res, { error: "Bad request" }, 400);
    return true;
  }
  if (decoded.includes("..")) {
    sendJson(res, { error: "Forbidden" }, 403);
    return true;
  }
  const filePath = resolve(CREATIVES_HTML, decoded.replace(/^\/+/, ""));
  if (!existsSync(filePath) || !filePath.startsWith(CREATIVES_HTML)) {
    sendJson(res, { error: "Not found" }, 404);
    return true;
  }
  const body = readFileSync(filePath);
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "public, max-age=30",
  });
  if (req.method === "HEAD") res.end();
  else res.end(body);
  return true;
}

export function serveUpload(
  req: IncomingMessage,
  res: ServerResponse,
  rel: string,
): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  if (rel.includes("..")) {
    sendJson(res, { error: "Forbidden" }, 403);
    return true;
  }
  const filePath = resolve(UPLOADS_DIR, rel.replace(/^\/+/, ""));
  if (!existsSync(filePath) || !filePath.startsWith(UPLOADS_DIR)) {
    sendJson(res, { error: "Not found" }, 404);
    return true;
  }
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const types: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
  };
  const body = readFileSync(filePath);
  res.writeHead(200, {
    "Content-Type": types[ext] ?? "application/octet-stream",
    "Content-Length": body.length,
    "Cache-Control": "public, max-age=60",
  });
  if (req.method === "HEAD") res.end();
  else res.end(body);
  return true;
}
