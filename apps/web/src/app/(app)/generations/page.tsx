import { Gallery } from "@/components/gallery";
import { toJobDto } from "@/lib/client-types";
import { listJobs } from "@/lib/jobs";
import { ensurePollerRunning } from "@/lib/jobs/poller";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function GenerationsPage() {
  const session = await requireSession();
  ensurePollerRunning();
  const jobs = await listJobs(session.user.id, { limit: 200 });
  return <Gallery initialJobs={jobs.map(toJobDto)} />;
}
