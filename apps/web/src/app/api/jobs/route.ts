import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handling, requireApiUser } from "@/lib/api";
import { createGenerationJob, JobInputError, listJobs } from "@/lib/jobs";
import { ensurePollerRunning } from "@/lib/jobs/poller";
import type { JobStatus } from "@/lib/db/schema";

const createSchema = z.object({
  provider: z.string(),
  modelId: z.string(),
  input: z.record(z.string(), z.unknown()),
});

export async function POST(req: NextRequest) {
  return handling(async () => {
    const user = await requireApiUser();
    const body = createSchema.parse(await req.json());

    try {
      const job = await createGenerationJob(user.id, body);
      return NextResponse.json({ job }, { status: 201 });
    } catch (err) {
      if (err instanceof JobInputError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
  });
}

export async function GET(req: NextRequest) {
  return handling(async () => {
    const user = await requireApiUser();
    ensurePollerRunning();
    const { searchParams } = new URL(req.url);
    const jobs = await listJobs(user.id, {
      limit: Number(searchParams.get("limit")) || undefined,
      status: (searchParams.get("status") as JobStatus) || undefined,
      kind: searchParams.get("kind") || undefined,
    });
    return NextResponse.json({ jobs });
  });
}
