import { rm } from "node:fs/promises";
import path from "node:path";

/**
 * Demo mode (DEMO_MODE=1): hardens a public showcase instance.
 * - Only the keyless demo provider is registered (see providers/registry.ts),
 *   so nobody can store real provider keys on a stranger's server.
 * - Generation endpoints are rate-limited per user (below).
 * - A janitor wipes accounts older than DEMO_RETENTION_HOURS.
 */
export const isDemoMode = () =>
  process.env.DEMO_MODE === "1" || process.env.DEMO_MODE === "true";

/* ------------------------------ rate limits ------------------------------ */

const LIMITS = {
  job: { max: 30, windowMs: 60 * 60 * 1000 },
  compose: { max: 6, windowMs: 60 * 60 * 1000 },
} as const;

// globalThis: Next.js dev compiles separate module instances per route bundle.
const HITS_KEY = Symbol.for("ctxai.demoRateHits");
const hits = ((globalThis as Record<symbol, unknown>)[HITS_KEY] ??= new Map<
  string,
  number[]
>()) as Map<string, number[]>;

/**
 * Sliding-window limiter. Returns null when allowed, or a human-readable
 * error when the demo budget is used up. No-op outside demo mode.
 */
export function demoRateLimit(
  userId: string,
  kind: keyof typeof LIMITS,
  now = Date.now(),
): string | null {
  if (!isDemoMode()) return null;

  const { max, windowMs } = LIMITS[kind];
  const key = `${kind}:${userId}`;
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    return `Demo limit reached (${max} ${kind === "compose" ? "renders" : "generations"} per hour). Self-host CTXAI to go unlimited.`;
  }
  recent.push(now);
  hits.set(key, recent);
  return null;
}

/* -------------------------------- janitor -------------------------------- */

const RETENTION_MS =
  (Number(process.env.DEMO_RETENTION_HOURS) || 24) * 60 * 60 * 1000;
const SWEEP_MS = 60 * 60 * 1000;

const JANITOR_KEY = Symbol.for("ctxai.demoJanitor");

/** Delete demo accounts (and everything cascading from them) past retention. */
async function sweep() {
  // Imported lazily so this module stays free of DB side effects for the
  // banner component and unit tests.
  const [{ db }, { user }, { assetsDir }, { lt }] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/db/schema"),
    import("@/lib/assets"),
    import("drizzle-orm"),
  ]);

  const cutoff = new Date(Date.now() - RETENTION_MS);
  const stale = await db.query.user.findMany({
    where: lt(user.createdAt, cutoff),
    columns: { id: true },
  });
  if (stale.length === 0) return;
  // Asset files live per-user on disk; DB rows cascade from the user.
  for (const u of stale) {
    await rm(path.join(assetsDir(), u.id), { recursive: true, force: true });
  }
  await db.delete(user).where(lt(user.createdAt, cutoff));
  console.log(`[demo] janitor removed ${stale.length} stale account(s)`);
}

/** Start the hourly cleanup once per process. No-op outside demo mode. */
export function ensureDemoJanitor() {
  if (!isDemoMode()) return;
  const g = globalThis as Record<symbol, unknown>;
  if (g[JANITOR_KEY]) return;
  g[JANITOR_KEY] = setInterval(() => void sweep().catch(console.error), SWEEP_MS);
  void sweep().catch(console.error);
}
