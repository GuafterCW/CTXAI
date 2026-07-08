import { NextResponse, type NextRequest } from "next/server";
import { handling, requireApiUser } from "@/lib/api";
import { getJob } from "@/lib/jobs";
import { ensurePollerRunning } from "@/lib/jobs/poller";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handling(async () => {
    const user = await requireApiUser();
    ensurePollerRunning();
    const { id } = await params;
    const job = await getJob(user.id, id);
    if (!job) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ job });
  });
}
