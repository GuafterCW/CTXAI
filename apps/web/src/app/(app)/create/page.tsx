import { Studio } from "@/components/studio/studio";
import { toJobDto } from "@/lib/client-types";
import { listJobs } from "@/lib/jobs";
import { ensurePollerRunning } from "@/lib/jobs/poller";
import { listModelsForUser } from "@/lib/models";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function CreatePage() {
  const session = await requireSession();
  ensurePollerRunning();

  const [models, jobs] = await Promise.all([
    listModelsForUser(session.user.id),
    listJobs(session.user.id, { limit: 30 }),
  ]);

  return <Studio models={models} initialJobs={jobs.map(toJobDto)} />;
}
