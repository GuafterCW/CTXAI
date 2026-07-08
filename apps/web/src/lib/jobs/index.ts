import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { assets, jobs, type JobStatus } from "@/lib/db/schema";
import { saveAsset } from "@/lib/assets";
import { getProviderContext } from "@/lib/credentials";
import { findModel } from "@/lib/providers/registry";
import { ProviderError, type PollResult } from "@/lib/providers/types";
import { emitJobEvent } from "./events";
import { ensurePollerRunning } from "./poller";

export class JobInputError extends Error {}

type JobRow = typeof jobs.$inferSelect;

async function updateJob(
  job: Pick<JobRow, "id" | "userId" | "kind">,
  patch: Partial<typeof jobs.$inferInsert>,
) {
  await db.update(jobs).set(patch).where(eq(jobs.id, job.id));
  emitJobEvent(job.userId, {
    jobId: job.id,
    status: (patch.status as string) ?? "running",
    progress: patch.progress ?? null,
    error: patch.error ?? null,
    kind: job.kind,
  });
}

/** Persist a successful result: download assets, then flip status. */
export async function finalizeSuccess(
  job: Pick<JobRow, "id" | "userId" | "kind">,
  result: PollResult,
) {
  try {
    for (const asset of result.assets ?? []) {
      await saveAsset(job.userId, job.id, asset);
    }
    await updateJob(job, {
      status: "succeeded",
      progress: 1,
      finishedAt: new Date(),
    });
  } catch (err) {
    await updateJob(job, {
      status: "failed",
      error: err instanceof Error ? err.message : "Failed to store result",
      finishedAt: new Date(),
    });
  }
}

export async function failJob(
  job: Pick<JobRow, "id" | "userId" | "kind">,
  error: string,
) {
  await updateJob(job, { status: "failed", error, finishedAt: new Date() });
}

/**
 * Create a generation job: validate input, call the provider, persist.
 * Returns the job row (synchronous providers may already be succeeded).
 */
export async function createGenerationJob(
  userId: string,
  params: { provider: string; modelId: string; input: Record<string, unknown> },
) {
  const { provider, model } = findModel(params.provider, params.modelId);

  const parsed = model.inputSchema.safeParse(params.input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new JobInputError(
      `Invalid input${issue ? `: ${issue.path.join(".")} — ${issue.message}` : ""}`,
    );
  }

  const ctx = await getProviderContext(userId, provider.id);
  if (!ctx) {
    throw new JobInputError(
      `No API key configured for ${provider.name}. Add one in Settings.`,
    );
  }

  const [job] = await db
    .insert(jobs)
    .values({
      id: nanoid(),
      userId,
      provider: provider.id,
      modelId: model.id,
      kind: model.kind,
      status: "queued",
      input: parsed.data,
    })
    .returning();

  emitJobEvent(userId, {
    jobId: job.id,
    status: "queued",
    progress: null,
    error: null,
    kind: job.kind,
  });

  try {
    const created = await provider.createJob(ctx, model.id, parsed.data);
    if (created.immediate) {
      if (created.immediate.status === "succeeded") {
        await finalizeSuccess(job, created.immediate);
      } else {
        await failJob(job, created.immediate.error ?? "Generation failed");
      }
    } else {
      await updateJob(job, {
        status: "running",
        providerJobId: created.providerJobId,
        startedAt: new Date(),
      });
      ensurePollerRunning();
    }
  } catch (err) {
    const message =
      err instanceof ProviderError || err instanceof Error
        ? err.message
        : "Generation failed";
    await failJob(job, message);
  }

  return getJob(userId, job.id);
}

export async function getJob(userId: string, jobId: string) {
  const job = await db.query.jobs.findFirst({
    where: and(eq(jobs.id, jobId), eq(jobs.userId, userId)),
  });
  if (!job) return null;
  const jobAssets = await db.query.assets.findMany({
    where: eq(assets.jobId, jobId),
  });
  return { ...job, assets: jobAssets };
}

export async function listJobs(
  userId: string,
  opts: { limit?: number; status?: JobStatus; kind?: string } = {},
) {
  const rows = await db.query.jobs.findMany({
    where: and(
      eq(jobs.userId, userId),
      opts.status ? eq(jobs.status, opts.status) : undefined,
    ),
    orderBy: [desc(jobs.createdAt)],
    limit: opts.limit ?? 60,
  });

  const withAssets = await Promise.all(
    rows.map(async (job) => ({
      ...job,
      assets: await db.query.assets.findMany({
        where: eq(assets.jobId, job.id),
      }),
    })),
  );
  return opts.kind
    ? withAssets.filter((j) => j.kind === opts.kind)
    : withAssets;
}
