import { getJob } from "@/lib/jobs";
import { requireSession } from "@/lib/session";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function GenerationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const job = await getJob(session.user.id, id);
  if (!job) notFound();

  const media = job.assets.find((a) => !a.mime.includes("json"));
  const prompt = String(job.input.prompt ?? job.input.text ?? "");

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link
        href="/generations"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-dim transition-colors hover:text-ink"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
          <path d="M19 12H5m0 0 6 6m-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        All generations
      </Link>

      <div className="overflow-hidden rounded-card border border-line bg-surface">
        {media && (
          <div className="bg-void">
            {media.mime.startsWith("video/") ? (
               
              <video
                src={`/api/assets/${media.id}`}
                controls
                loop
                className="mx-auto max-h-[70vh] w-auto"
              />
            ) : media.mime.startsWith("audio/") ? (
              <div className="p-10">
                { }
                <audio src={`/api/assets/${media.id}`} controls className="w-full" />
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/assets/${media.id}`}
                alt={prompt}
                className="mx-auto max-h-[70vh] w-auto"
              />
            )}
          </div>
        )}

        <div className="space-y-4 p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-overlay px-2.5 py-1 text-[11px] uppercase tracking-wide text-ink-dim">
              {job.kind}
            </span>
            <span className="rounded-full bg-overlay px-2.5 py-1 text-[11px] text-ink-dim">
              {job.provider} · {job.modelId}
            </span>
            <span
              className={
                job.status === "succeeded"
                  ? "rounded-full bg-success/10 px-2.5 py-1 text-[11px] text-success"
                  : job.status === "failed"
                    ? "rounded-full bg-danger/10 px-2.5 py-1 text-[11px] text-danger"
                    : "rounded-full bg-accent/10 px-2.5 py-1 text-[11px] text-accent-bright"
              }
            >
              {job.status}
            </span>
          </div>

          {prompt && <p className="text-sm leading-relaxed text-ink">{prompt}</p>}
          {job.error && <p className="text-sm text-danger">{job.error}</p>}

          <details className="text-xs text-ink-dim">
            <summary className="cursor-pointer select-none text-ink-faint hover:text-ink-dim">
              Parameters
            </summary>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-void p-3">
              {JSON.stringify(job.input, null, 2)}
            </pre>
          </details>

          {media && (
            <div className="flex gap-2 pt-1">
              <a
                href={`/api/assets/${media.id}?download`}
                className="rounded-lg bg-gradient-to-r from-accent to-accent-blue px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110"
              >
                Download
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
