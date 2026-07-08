"use client";

import { GenerationCard } from "@/components/studio/generation-card";
import { defaultParams, ParamsPanel } from "@/components/studio/params-panel";
import { Textarea } from "@/components/ui/input";
import { useJobStream } from "@/hooks/use-job-stream";
import { toJobDto, type JobDto, type ModelDto } from "@/lib/client-types";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";

type Filter = "all" | "video" | "image" | "audio";

export function Studio({
  models,
  initialJobs,
}: {
  models: ModelDto[];
  initialJobs: JobDto[];
}) {
  const usable = models.filter((m) => m.configured);
  const { jobs, addJob } = useJobStream(initialJobs);

  const [modelId, setModelId] = useState(usable[0]?.id ?? "");
  const model = usable.find((m) => m.id === modelId) ?? usable[0];

  const [prompt, setPrompt] = useState("");
  const [params, setParams] = useState<Record<string, unknown>>(() =>
    model ? defaultParams(model) : {},
  );
  const [image, setImage] = useState<string | null>(null);
  const [showParams, setShowParams] = useState(false);
  const [showModels, setShowModels] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const needsImage = Boolean(model?.paramsSchema.properties?.image);
  const promptKey = model?.paramsSchema.properties?.text ? "text" : "prompt";

  const visibleJobs = useMemo(
    () => (filter === "all" ? jobs : jobs.filter((j) => j.kind === filter)),
    [jobs, filter],
  );

  function selectModel(next: ModelDto) {
    setModelId(next.id);
    setParams(defaultParams(next));
    setImage(null);
    setShowModels(false);
  }

  async function generate(
    input?: Record<string, unknown>,
    overrideModel?: ModelDto,
  ) {
    const target = overrideModel ?? model;
    if (!target || submitting) return;
    setFormError(null);

    const payload = input ?? {
      ...params,
      [promptKey]: prompt,
      ...(needsImage && image ? { image } : {}),
    };
    if (!input && !payload[promptKey] && !(needsImage && payload.image)) {
      setFormError("Describe what you want to create first.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: target.providerId,
          modelId: target.id,
          input: payload,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setFormError(body.error ?? "Generation failed to start");
        return;
      }
      addJob(toJobDto(body.job));
      setPrompt("");
    } finally {
      setSubmitting(false);
    }
  }

  function retry(job: JobDto) {
    const failedModel = usable.find((m) => m.id === job.modelId);
    if (!failedModel) return;
    void generate(job.input, failedModel);
  }

  if (usable.length === 0) {
    return (
      <div className="flex h-dvh items-center justify-center p-8">
        <div className="glass max-w-md rounded-card p-8 text-center">
          <h2 className="font-display text-lg font-semibold">No providers configured</h2>
          <p className="mt-2 text-sm text-ink-dim">
            Add your Kling or Seedream API key to start generating — or enable
            the built-in demo provider.
          </p>
          <Link
            href="/settings"
            className="mt-5 inline-block rounded-lg bg-gradient-to-r from-accent to-accent-blue px-5 py-2.5 text-sm font-medium text-white"
          >
            Open settings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-dvh flex-col">
      {/* Header: filters */}
      <header className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
        <h1 className="font-display text-lg font-semibold">Create</h1>
        <div className="flex gap-1 rounded-lg bg-surface p-1">
          {(["all", "video", "image", "audio"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                filter === f ? "bg-overlay text-ink" : "text-ink-faint hover:text-ink-dim",
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </header>

      {/* Generation grid */}
      <div className="flex-1 overflow-y-auto px-6 py-6 pb-44">
        {visibleJobs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div
              className="size-16 rounded-2xl opacity-60"
              style={{
                background:
                  "conic-gradient(from 0deg, var(--color-accent), var(--color-accent-blue), var(--color-accent-cyan), var(--color-accent))",
                filter: "blur(18px)",
              }}
            />
            <p className="font-display text-lg">Nothing here yet</p>
            <p className="max-w-sm text-sm text-ink-dim">
              Describe your idea below and watch it come to life. Generations
              appear here in real time.
            </p>
          </div>
        ) : (
          <motion.div
            layout
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
          >
            <AnimatePresence mode="popLayout">
              {visibleJobs.map((job) => (
                <GenerationCard key={job.id} job={job} onRetry={retry} />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* Prompt dock */}
      <div className="absolute inset-x-0 bottom-0 z-20 px-6 pb-6">
        <div className="mx-auto max-w-3xl">
          <AnimatePresence>
            {showParams && model && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ duration: 0.22 }}
                className="glass mb-3 max-h-72 overflow-y-auto rounded-card p-5"
              >
                <ParamsPanel model={model} params={params} onChange={setParams} />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showModels && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ duration: 0.22 }}
                className="glass mb-3 max-h-72 overflow-y-auto rounded-card p-2"
              >
                {usable.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => selectModel(m)}
                    className={cn(
                      "flex w-full cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-overlay/70",
                      m.id === model?.id && "bg-overlay",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                        m.kind === "video"
                          ? "bg-accent/15 text-accent-bright"
                          : m.kind === "image"
                            ? "bg-accent-cyan/15 text-accent-cyan"
                            : "bg-success/15 text-success",
                      )}
                    >
                      {m.kind}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-ink">{m.name}</span>
                      <span className="block truncate text-xs text-ink-faint">
                        {m.description}
                      </span>
                    </span>
                    {m.costHint && (
                      <span className="mt-1 shrink-0 text-[10px] text-ink-faint">
                        {m.costHint}
                      </span>
                    )}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {formError && (
            <motion.p
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-2 px-2 text-sm text-danger"
            >
              {formError}
            </motion.p>
          )}

          <div className="glass rounded-card p-3 shadow-2xl shadow-black/40">
            {needsImage && (
              <div className="mb-2 flex items-center gap-2 px-1">
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      const result = String(reader.result);
                      setImage(result.slice(result.indexOf(",") + 1));
                    };
                    reader.readAsDataURL(file);
                  }}
                />
                <button
                  onClick={() => fileInput.current?.click()}
                  className={cn(
                    "cursor-pointer rounded-lg border border-dashed px-3 py-1.5 text-xs transition-colors",
                    image
                      ? "border-success/50 text-success"
                      : "border-line-bright text-ink-dim hover:border-accent/50 hover:text-ink",
                  )}
                >
                  {image ? "✓ Source image attached" : "Attach source image"}
                </button>
                {image && (
                  <button
                    onClick={() => setImage(null)}
                    className="cursor-pointer text-xs text-ink-faint hover:text-danger"
                  >
                    Remove
                  </button>
                )}
              </div>
            )}

            <Textarea
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void generate();
                }
              }}
              placeholder={
                model?.kind === "video"
                  ? "Describe your video… (⌘⏎ to generate)"
                  : "Describe your image… (⌘⏎ to generate)"
              }
              className="resize-none border-0 bg-transparent focus:ring-0"
            />

            <div className="mt-2 flex items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setShowModels((v) => !v);
                    setShowParams(false);
                  }}
                  className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-overlay px-3 py-1.5 text-xs text-ink transition-colors hover:bg-line"
                >
                  <span
                    className="size-1.5 rounded-full"
                    style={{
                      background:
                        "linear-gradient(90deg, var(--color-accent), var(--color-accent-cyan))",
                    }}
                  />
                  {model?.name ?? "Select model"}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3 text-ink-faint">
                    <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    setShowParams((v) => !v);
                    setShowModels(false);
                  }}
                  aria-label="Generation parameters"
                  className={cn(
                    "flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors",
                    showParams
                      ? "bg-accent/15 text-accent-bright"
                      : "bg-overlay text-ink-dim hover:text-ink",
                  )}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-3.5">
                    <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" strokeLinecap="round" />
                  </svg>
                  Params
                </button>
              </div>

              <button
                onClick={() => void generate()}
                disabled={submitting}
                className="flex cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-accent-blue px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-accent/30 transition-all hover:shadow-accent/50 hover:brightness-110 disabled:pointer-events-none disabled:opacity-60"
              >
                {submitting ? (
                  <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <svg viewBox="0 0 24 24" fill="currentColor" className="size-4">
                    <path d="M12 2 9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5L12 2Z" />
                  </svg>
                )}
                Generate
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
