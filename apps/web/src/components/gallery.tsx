"use client";

import { GenerationCard } from "@/components/studio/generation-card";
import { useJobStream } from "@/hooks/use-job-stream";
import type { JobDto } from "@/lib/client-types";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";

type Filter = "all" | "video" | "image" | "audio" | "compose";

export function Gallery({ initialJobs }: { initialJobs: JobDto[] }) {
  const { jobs } = useJobStream(initialJobs);
  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(
    () => (filter === "all" ? jobs : jobs.filter((j) => j.kind === filter)),
    [jobs, filter],
  );

  return (
    <div className="px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Generations</h1>
          <p className="mt-1 text-sm text-ink-dim">
            Everything you have created — stored locally on your instance.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-surface p-1">
          {(["all", "video", "image", "audio", "compose"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                filter === f ? "bg-overlay text-ink" : "text-ink-faint hover:text-ink-dim",
              )}
            >
              {f === "compose" ? "montage" : f}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="py-24 text-center text-sm text-ink-faint">
          No generations yet.
        </p>
      ) : (
        <motion.div
          layout
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
        >
          <AnimatePresence mode="popLayout">
            {visible.map((job) => (
              <GenerationCard key={job.id} job={job} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
