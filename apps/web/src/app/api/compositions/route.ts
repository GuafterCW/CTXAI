import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handling, requireApiUser } from "@/lib/api";
import { demoRateLimit } from "@/lib/demo";
import {
  composeAndRender,
  listCompositions,
  MontageInputError,
} from "@/lib/montage";

const postSchema = z.object({
  compositionId: z.string().optional(),
  title: z.string().max(120).optional(),
  timeline: z.unknown(),
});

/** Create/update a composition and start rendering it. */
export async function POST(req: NextRequest) {
  return handling(async () => {
    const user = await requireApiUser();
    const limited = demoRateLimit(user.id, "compose");
    if (limited) {
      return NextResponse.json({ error: limited }, { status: 429 });
    }
    const body = postSchema.parse(await req.json());
    try {
      const result = await composeAndRender(user.id, {
        ...body,
        timeline: body.timeline ?? null,
      });
      return NextResponse.json(result, { status: 201 });
    } catch (err) {
      if (err instanceof MontageInputError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
  });
}

export async function GET() {
  return handling(async () => {
    const user = await requireApiUser();
    return NextResponse.json({
      compositions: await listCompositions(user.id),
    });
  });
}
