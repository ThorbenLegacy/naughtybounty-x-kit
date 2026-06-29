import { schedulerSecret } from "./auth";
import type { RunPostResult } from "./post-runner";

const DEFAULT_LOCAL = "http://127.0.0.1:8765";

export function dashboardInternalBaseUrl(): string {
  const raw =
    process.env.DASHBOARD_INTERNAL_URL?.trim() ||
    process.env.DASHBOARD_URL?.trim() ||
    DEFAULT_LOCAL;
  const url = raw.replace(/\/$/, "");
  if (url.includes("${")) {
    console.warn(
      "WARN: DASHBOARD_INTERNAL_URL enthält unaufgelöste ${{…}} — in Railway als Reference Variable setzen, nicht literal einfügen.",
    );
  }
  return url;
}

function describeFetchError(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const cause = e.cause instanceof Error ? e.cause.message : undefined;
  return cause ? `${e.message} (${cause})` : e.message;
}

export async function pingDashboard(): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${dashboardInternalBaseUrl()}/health`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = (await res.json()) as { ok?: boolean };
    return data.ok ? { ok: true } : { ok: false, error: "health not ok" };
  } catch (e) {
    return { ok: false, error: describeFetchError(e) };
  }
}

/** Blockiert bis GET /health ok — für Scheduler-Start nach Dashboard-Deploy. */
export async function waitForDashboard(options?: {
  maxWaitMs?: number;
  intervalMs?: number;
}): Promise<{ ok: boolean; error?: string }> {
  const maxWaitMs = options?.maxWaitMs ?? Number(process.env.DASHBOARD_WAIT_MS ?? 600_000);
  const intervalMs = options?.intervalMs ?? 5_000;
  const started = Date.now();
  let attempt = 0;

  while (Date.now() - started < maxWaitMs) {
    attempt += 1;
    const health = await pingDashboard();
    if (health.ok) return { ok: true };
    console.log(
      `Dashboard noch nicht bereit (${health.error ?? "?"}), Versuch ${attempt} — warte ${intervalMs / 1000}s …`,
    );
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  const last = await pingDashboard();
  return { ok: false, error: last.error ?? "Timeout" };
}

export async function requestScheduledPost(options: {
  week?: boolean;
  slot?: string;
  force?: boolean;
}): Promise<RunPostResult & { skipped?: boolean }> {
  const secret = schedulerSecret();
  if (!secret) {
    return {
      ok: false,
      error: "SCHEDULER_SECRET oder DASHBOARD_PASSWORD fehlt (Scheduler + Dashboard identisch setzen).",
    };
  }

  const url = `${dashboardInternalBaseUrl()}/api/internal/schedule-post`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        week: options.week ?? false,
        slot: options.slot,
        force: options.force ?? false,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    let data: RunPostResult & { skipped?: boolean; error?: string };
    try {
      data = (await res.json()) as RunPostResult & { skipped?: boolean; error?: string };
    } catch {
      return { ok: false, error: `Dashboard-Antwort ungültig (HTTP ${res.status})` };
    }
    if (!res.ok && !data.ok) {
      return { ok: false, error: data.error ?? `HTTP ${res.status}` };
    }
    return data;
  } catch (e) {
    return { ok: false, error: describeFetchError(e) };
  }
}
