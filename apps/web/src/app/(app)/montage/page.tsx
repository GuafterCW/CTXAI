import { MontageEditor, type PickableAsset } from "@/components/montage/montage-editor";
import { toJobDto } from "@/lib/client-types";
import { listJobs } from "@/lib/jobs";
import { ensurePollerRunning } from "@/lib/jobs/poller";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function MontagePage() {
  const session = await requireSession();
  ensurePollerRunning();

  const jobs = await listJobs(session.user.id, { limit: 200, status: "succeeded" });

  const toPickable = (kinds: string[], mimePrefixes: string[]): PickableAsset[] =>
    jobs
      .filter((j) => kinds.includes(j.kind))
      .flatMap((j) =>
        j.assets
          .filter((a) => mimePrefixes.some((p) => a.mime.startsWith(p)))
          .map((a) => ({
            assetId: a.id,
            jobId: j.id,
            mime: a.mime,
            prompt: String(j.input.prompt ?? j.input.text ?? ""),
            duration: a.duration,
          })),
      );

  const composeJobs = await listJobs(session.user.id, { limit: 20, kind: "compose" });

  return (
    <MontageEditor
      mediaAssets={toPickable(["video", "image"], ["video/", "image/"])}
      audioAssets={toPickable(["audio"], ["audio/"])}
      initialComposeJobs={composeJobs.map(toJobDto)}
    />
  );
}
