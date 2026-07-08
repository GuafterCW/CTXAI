"use client";

import { cn } from "@/lib/utils";
import type { JobDto } from "@/lib/client-types";
import { motion } from "motion/react";
import Link from "next/link";
import { useRef } from "react";

const spring = { type: "spring" as const, bounce: 0.22, duration: 0.7 };

function ProgressRing({ progress }: { progress: number | null }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  const indeterminate = progress == null;
  return (
    <svg
      viewBox="0 0 48 48"
      className={cn("size-12", indeterminate && "animate-spin [animation-duration:1.6s]")}
      role="progressbar"
      aria-valuenow={progress != null ? Math.round(progress * 100) : undefined}
    >
      <circle cx="24" cy="24" r={r} fill="none" strokeWidth="3" className="stroke-line" />
      <circle
        cx="24"
        cy="24"
        r={r}
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        stroke="url(#ring-gradient)"
        strokeDasharray={c}
        strokeDashoffset={indeterminate ? c * 0.72 : c * (1 - progress)}
        transform="rotate(-90 24 24)"
        className="transition-[stroke-dashoffset] duration-700 ease-out"
      />
      <defs>
        <linearGradient id="ring-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-accent)" />
          <stop offset="100%" stopColor="var(--color-accent-cyan)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function Media({ job, interactive }: { job: JobDto; interactive: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const asset = job.assets.find((a) => !a.mime.includes("json"));
  if (!asset) return null;
  const src = `/api/assets/${asset.id}`;

  if (asset.mime.startsWith("video/")) {
    return (
       
      <video
        ref={videoRef}
        src={src}
        loop
        muted
        playsInline
        preload="metadata"
        className="size-full object-cover"
        onMouseEnter={() => interactive && videoRef.current?.play()}
        onMouseLeave={() => {
          if (!interactive || !videoRef.current) return;
          videoRef.current.pause();
          videoRef.current.currentTime = 0;
        }}
      />
    );
  }
  if (asset.mime.startsWith("audio/")) {
    return (
      <div className="flex size-full items-center justify-center p-4">
        { }
        <audio src={src} controls className="w-full" />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={String(job.input.prompt ?? "generation")} className="size-full object-cover" />;
}

export function GenerationCard({
  job,
  onRetry,
}: {
  job: JobDto;
  onRetry?: (job: JobDto) => void;
}) {
  const busy = job.status === "queued" || job.status === "running";
  const failed = job.status === "failed";
  const prompt = String(job.input.prompt ?? job.input.text ?? "");
  const ratio =
    job.kind === "video" ? "aspect-video" : job.kind === "audio" ? "aspect-[3/1]" : "aspect-square";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.92, y: 24 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={spring}
      className={cn(
        "group relative overflow-hidden rounded-card",
        busy && "gradient-border-spin",
        !busy && "border border-line",
        failed && "border-danger/50",
      )}
    >
      <motion.div
        animate={failed ? { x: [0, -7, 7, -5, 5, -2, 0] } : { x: 0 }}
        transition={failed ? { duration: 0.45 } : undefined}
        className="relative bg-surface"
      >
        <div className={cn("relative w-full overflow-hidden", ratio)}>
          {busy && (
            <div className="absolute inset-0 shimmer-surface">
              <div className="absolute inset-0 flex animate-breathe flex-col items-center justify-center gap-3">
                <ProgressRing progress={job.progress} />
                <p className="text-xs font-medium text-ink-dim">
                  {job.status === "queued"
                    ? "Queued…"
                    : job.progress != null
                      ? `${Math.round(job.progress * 100)}%`
                      : "Generating…"}
                </p>
              </div>
            </div>
          )}

          {job.status === "succeeded" && (
            <motion.div
              initial={{ filter: "blur(24px)", scale: 1.06, opacity: 0.4 }}
              animate={{ filter: "blur(0px)", scale: 1, opacity: 1 }}
              transition={{ duration: 0.9, ease: [0.21, 0.7, 0.25, 1] }}
              className="size-full"
            >
              <Media job={job} interactive />
              {/* one-shot glow on reveal */}
              <motion.div
                aria-hidden
                initial={{ opacity: 0.7 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 1.4, ease: "easeOut" }}
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(60% 60% at 50% 50%, color-mix(in srgb, var(--color-accent) 35%, transparent), transparent)",
                }}
              />
            </motion.div>
          )}

          {failed && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-danger/5 p-4 text-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-6 text-danger">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
              </svg>
              <p className="line-clamp-3 text-xs text-danger/90">{job.error ?? "Generation failed"}</p>
              {onRetry && (
                <button
                  onClick={() => onRetry(job)}
                  className="mt-1 cursor-pointer rounded-md border border-danger/40 px-3 py-1 text-xs text-danger transition-colors hover:bg-danger/10"
                >
                  Retry
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
          <p className="min-w-0 flex-1 truncate text-xs text-ink-dim" title={prompt}>
            {prompt || "—"}
          </p>
          <span className="shrink-0 rounded-full bg-overlay px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-faint">
            {job.kind}
          </span>
        </div>

        {/* Hover actions for finished jobs */}
        {job.status === "succeeded" && job.assets[0] && (
          <div className="absolute right-2.5 top-2.5 flex gap-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <Link
              href={`/generations/${job.id}`}
              aria-label="Open details"
              className="glass flex size-8 cursor-pointer items-center justify-center rounded-lg text-ink-dim transition-colors hover:text-ink"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4">
                <path d="M15 3h6v6M14 10l7-7M9 21H3v-6M10 14l-7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <a
              href={`/api/assets/${job.assets.find((a) => !a.mime.includes("json"))?.id}?download`}
              aria-label="Download"
              className="glass flex size-8 cursor-pointer items-center justify-center rounded-lg text-ink-dim transition-colors hover:text-ink"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4">
                <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
