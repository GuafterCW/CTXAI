import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handling, requireApiUser } from "@/lib/api";
import { createApiKey, listApiKeys } from "@/lib/api-keys";

export async function GET() {
  return handling(async () => {
    const user = await requireApiUser();
    return NextResponse.json({ keys: await listApiKeys(user.id) });
  });
}

export async function POST(req: NextRequest) {
  return handling(async () => {
    const user = await requireApiUser();
    const { name } = z
      .object({ name: z.string().min(1).max(60) })
      .parse(await req.json());
    const { key, row } = await createApiKey(user.id, name);
    return NextResponse.json(
      {
        key, // shown exactly once
        id: row.id,
        name: row.name,
        keyPrefix: row.keyPrefix,
      },
      { status: 201 },
    );
  });
}
