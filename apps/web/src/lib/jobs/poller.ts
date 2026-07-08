import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { getProviderContext } from "@/lib/credentials";
import { getProvider } from "@/lib/providers/registry";
import { ProviderError } from "@/lib/providers/types";
import { emitJobEvent } from "./events";

const POLL_INTERVAL_MS = 3_000;
/** Providers occasionally lose jobs; give up after 30 minutes. */
const MAX_JOB_AGE_MS = 30 * 60 * 1000;

const KEY = Symbol.for("ctxai.jobPoller");

/**
 * In-process poller for provider-side jobs. Started lazily on first job
 * creation (and on boot via any jobs API import). globalThis guard keeps
 * dev-mode HMR from stacking intervals.
 */
export function ensurePollerRunning() {
  const g = globalThis as Record<symbol, unknown>;
  if (g[KEY]) return;
  g[KEY] = setInterval(() => {
    tick().catch((err) => console.error("[poller] tick failed:", err));
  }, POLL_INTERVAL_MS);
}

let ticking = false;

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const open = await db.query.jobs.findMany({
      where: inArray(jobs.status, ["running"]),
    });
    for (const job of open) {
      await pollOne(job).catch((err) =>
        console.error(`[poller] job ${job.id}:`, err),
      );
    }
  } finally {
    ticking = false;
  }
}

type JobRow = typeof jobs.$inferSelect;

async function pollOne(job: JobRow) {
  // Compose jobs are rendered locally; the montage renderer updates them.
  if (job.kind === "compose" || !job.providerJobId) return;

  const { finalizeSuccess, failJob } = await import("./index");

  if (Date.now() - job.createdAt.getTime() > MAX_JOB_AGE_MS) {
    await failJob(job, "Timed out waiting for the provider");
    return;
  }

  const ctx = await getProviderContext(job.userId, job.provider);
  if (!ctx) {
    await failJob(job, "Provider credentials were removed");
    return;
  }

  try {
    const result = await getProvider(job.provider).pollJob(
      ctx,
      job.providerJobId,
    );

    if (result.status === "succeeded") {
      await finalizeSuccess(job, result);
    } else if (result.status === "failed") {
      await failJob(job, result.error ?? "Provider reported a failure");
    } else if (
      result.progress != null &&
      result.progress !== job.progress
    ) {
      await db
        .update(jobs)
        .set({ progress: result.progress })
        .where(eq(jobs.id, job.id));
      emitJobEvent(job.userId, {
        jobId: job.id,
        status: "running",
        progress: result.progress,
        error: null,
        kind: job.kind,
      });
    }
  } catch (err) {
    // Transient errors (network, 5xx, rate limits) resolve on a later tick.
    if (err instanceof ProviderError && !err.retryable) {
      await failJob(job, err.message);
    }
  }
}
