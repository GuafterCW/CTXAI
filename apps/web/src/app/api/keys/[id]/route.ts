import { NextResponse, type NextRequest } from "next/server";
import { handling, requireApiUser } from "@/lib/api";
import { deleteApiKey } from "@/lib/api-keys";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handling(async () => {
    const user = await requireApiUser();
    const { id } = await params;
    await deleteApiKey(user.id, id);
    return NextResponse.json({ ok: true });
  });
}
