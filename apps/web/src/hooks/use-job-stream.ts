"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toJobDto, type JobDto } from "@/lib/client-types";

/**
 * Live job list: seeded from the server, kept fresh via the SSE stream.
 * Jobs created elsewhere (e.g. through MCP from Claude Code) appear too.
 */
export function useJobStream(initial: JobDto[]) {
  const [jobs, setJobs] = useState<JobDto[]>(initial);
  const known = useRef(new Set(initial.map((j) => j.id)));

  const refetchJob = useCallback(async (jobId: string) => {
    const res = await fetch(`/api/jobs/${jobId}`);
    if (!res.ok) return;
    const { job } = await res.json();
    const dto = toJobDto(job);
    setJobs((prev) => {
      if (prev.some((j) => j.id === dto.id)) {
        return prev.map((j) => (j.id === dto.id ? dto : j));
      }
      known.current.add(dto.id);
      return [dto, ...prev];
    });
  }, []);

  useEffect(() => {
    const source = new EventSource("/api/jobs/events");
    source.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (!data.jobId) return;

      if (!known.current.has(data.jobId)) {
        // A job we haven't seen (created in another tab or via MCP).
        known.current.add(data.jobId);
        void refetchJob(data.jobId);
        return;
      }

      setJobs((prev) =>
        prev.map((j) =>
          j.id === data.jobId
            ? {
                ...j,
                status: data.status,
                progress: data.progress ?? j.progress,
                error: data.error ?? null,
              }
            : j,
        ),
      );
      // Fetch assets once the job settles.
      if (data.status === "succeeded") void refetchJob(data.jobId);
    };
    return () => source.close();
  }, [refetchJob]);

  const addJob = useCallback((job: JobDto) => {
    known.current.add(job.id);
    setJobs((prev) => [job, ...prev]);
  }, []);

  return { jobs, addJob, refetchJob };
}
