import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { compositions, jobs } from "@/lib/db/schema";
import { emitJobEvent } from "@/lib/jobs/events";
import { renderComposition } from "./renderer";
import { timelineSchema, type Timeline } from "./schema";

export class MontageInputError extends Error {}

/** Create (or update) a composition and kick off a render job. */
export async function composeAndRender(
  userId: string,
  params: {
    compositionId?: string;
    title?: string;
    timeline: unknown;
  },
) {
  const parsed = timelineSchema.safeParse(params.timeline);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new MontageInputError(
      `Invalid timeline${issue ? `: ${issue.path.join(".")} — ${issue.message}` : ""}`,
    );
  }
  const timeline: Timeline = parsed.data;

  let compositionId = params.compositionId;
  if (compositionId) {
    const existing = await db.query.compositions.findFirst({
      where: eq(compositions.id, compositionId),
    });
    if (!existing || existing.userId !== userId) {
      throw new MontageInputError("Composition not found");
    }
    await db
      .update(compositions)
      .set({
        timeline,
        title: params.title ?? existing.title,
        formatPreset: timeline.format,
        updatedAt: new Date(),
      })
      .where(eq(compositions.id, compositionId));
  } else {
    compositionId = nanoid();
    await db.insert(compositions).values({
      id: compositionId,
      userId,
      title: params.title ?? "Untitled montage",
      formatPreset: timeline.format,
      timeline,
    });
  }

  const [job] = await db
    .insert(jobs)
    .values({
      id: nanoid(),
      userId,
      provider: "montage",
      modelId: `montage-${timeline.format}`,
      kind: "compose",
      status: "running",
      input: { compositionId, scenes: timeline.scenes.length, format: timeline.format },
      startedAt: new Date(),
    })
    .returning();

  await db
    .update(compositions)
    .set({ renderJobId: job.id })
    .where(eq(compositions.id, compositionId));

  emitJobEvent(userId, {
    jobId: job.id,
    status: "running",
    progress: 0,
    error: null,
    kind: "compose",
  });

  // Fire and forget: progress and completion flow through job events.
  void renderComposition(job, timeline);

  return { compositionId, job };
}

export async function listCompositions(userId: string) {
  return db.query.compositions.findMany({
    where: eq(compositions.userId, userId),
    orderBy: [desc(compositions.updatedAt)],
  });
}
