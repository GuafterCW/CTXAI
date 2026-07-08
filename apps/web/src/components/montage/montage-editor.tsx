"use client";

import { GenerationCard } from "@/components/studio/generation-card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { useJobStream } from "@/hooks/use-job-stream";
import type { JobDto } from "@/lib/client-types";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion, Reorder } from "motion/react";
import { useState } from "react";

export interface PickableAsset {
  assetId: string;
  jobId: string;
  mime: string;
  prompt: string;
  duration: number | null;
}

interface EditorScene {
  key: string;
  assetId: string;
  mime: string;
  prompt: string;
  voiceover: string;
  duration: string; // keep as text input state
}

const FORMATS = [
  { id: "9:16", label: "Shorts", frame: "h-14 w-8" },
  { id: "16:9", label: "YouTube", frame: "h-8 w-14" },
  { id: "1:1", label: "Square", frame: "h-11 w-11" },
] as const;

const CAPTIONS = ["bold", "minimal", "none"] as const;

let sceneKey = 0;

export function MontageEditor({
  mediaAssets,
  audioAssets,
  initialComposeJobs,
}: {
  mediaAssets: PickableAsset[];
  audioAssets: PickableAsset[];
  initialComposeJobs: JobDto[];
}) {
  const { jobs, addJob } = useJobStream(initialComposeJobs);
  const composeJobs = jobs.filter((j) => j.kind === "compose");

  const [title, setTitle] = useState("");
  const [format, setFormat] = useState<"9:16" | "16:9" | "1:1">("9:16");
  const [captionStyle, setCaptionStyle] = useState<(typeof CAPTIONS)[number]>("bold");
  const [voiceId, setVoiceId] = useState("");
  const [musicAssetId, setMusicAssetId] = useState("");
  const [scenes, setScenes] = useState<EditorScene[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addScene(asset: PickableAsset) {
    setScenes((prev) => [
      ...prev,
      {
        key: `scene-${sceneKey++}`,
        assetId: asset.assetId,
        mime: asset.mime,
        prompt: asset.prompt,
        voiceover: "",
        duration: "",
      },
    ]);
    setPickerOpen(false);
  }

  async function render() {
    if (scenes.length === 0 || busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/compositions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title || undefined,
          timeline: {
            format,
            captionStyle,
            musicAssetId: musicAssetId || undefined,
            voice: voiceId ? { voice_id: voiceId } : {},
            scenes: scenes.map((s) => ({
              assetId: s.assetId,
              voiceover: s.voiceover || undefined,
              duration: s.duration ? Number(s.duration) : undefined,
            })),
          },
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Render failed to start");
        return;
      }
      addJob({
        id: body.job.id,
        provider: "montage",
        modelId: body.job.modelId,
        kind: "compose",
        status: "running",
        input: { prompt: title || "Montage" },
        progress: 0,
        error: null,
        createdAt: new Date().toISOString(),
        assets: [],
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-8 px-6 py-8 xl:grid-cols-[1fr_360px]">
      {/* Left: timeline editor */}
      <div>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold">Montage</h1>
            <p className="mt-1 text-sm text-ink-dim">
              Turn your generations into a publish-ready video — narration,
              captions and music included.
            </p>
          </div>
          <Button onClick={render} disabled={busy || scenes.length === 0}>
            {busy ? "Starting…" : "Render video"}
          </Button>
        </div>

        {error && <p className="mb-4 text-sm text-danger">{error}</p>}

        <div className="glass mb-5 grid gap-5 rounded-card p-5 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-dim">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My first Short"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-dim">
              Format
            </label>
            <div className="flex gap-2">
              {FORMATS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFormat(f.id)}
                  className={cn(
                    "flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border px-3 py-2 transition-colors",
                    format === f.id
                      ? "border-accent/70 bg-accent/10"
                      : "border-line hover:border-line-bright",
                  )}
                >
                  <span
                    className={cn(
                      "rounded-[3px] border",
                      f.frame,
                      format === f.id ? "border-accent-bright" : "border-ink-faint",
                    )}
                  />
                  <span className="text-[11px] text-ink-dim">{f.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-dim">
              Captions
            </label>
            <div className="flex gap-1.5">
              {CAPTIONS.map((c) => (
                <button
                  key={c}
                  onClick={() => setCaptionStyle(c)}
                  className={cn(
                    "cursor-pointer rounded-lg border px-3 py-1.5 text-xs capitalize transition-colors",
                    captionStyle === c
                      ? "border-accent/70 bg-accent/15 text-accent-bright"
                      : "border-line text-ink-dim hover:text-ink",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-dim">
              Voice ID <span className="text-ink-faint">(ElevenLabs, optional)</span>
            </label>
            <Input
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              placeholder="Default: Rachel"
            />
          </div>
          {audioAssets.length > 0 && (
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-ink-dim">
                Music
              </label>
              <select
                value={musicAssetId}
                onChange={(e) => setMusicAssetId(e.target.value)}
                className="h-10 w-full cursor-pointer rounded-lg border border-line bg-surface px-3 text-sm text-ink focus:border-accent/70 focus:outline-none"
              >
                <option value="">No music</option>
                {audioAssets.map((a) => (
                  <option key={a.assetId} value={a.assetId}>
                    {a.prompt.slice(0, 60) || a.assetId}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Scenes */}
        <Reorder.Group
          axis="y"
          values={scenes}
          onReorder={setScenes}
          className="space-y-3"
        >
          <AnimatePresence>
            {scenes.map((scene, index) => (
              <Reorder.Item
                key={scene.key}
                value={scene}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                className="glass flex cursor-grab gap-4 rounded-card p-4 active:cursor-grabbing"
              >
                <div className="flex flex-col items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-full bg-overlay text-xs text-ink-dim">
                    {index + 1}
                  </span>
                  <div className="h-full w-px bg-line" />
                </div>

                <div className="relative aspect-square w-24 shrink-0 overflow-hidden rounded-lg bg-void">
                  {scene.mime.startsWith("video/") ? (
                    <video
                      src={`/api/assets/${scene.assetId}`}
                      muted
                      className="size-full object-cover"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/assets/${scene.assetId}`}
                      alt=""
                      className="size-full object-cover"
                    />
                  )}
                  <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[9px] uppercase text-white">
                    {scene.mime.startsWith("video/") ? "clip" : "still"}
                  </span>
                </div>

                <div className="min-w-0 flex-1 space-y-2">
                  <Textarea
                    rows={2}
                    value={scene.voiceover}
                    onChange={(e) =>
                      setScenes((prev) =>
                        prev.map((s) =>
                          s.key === scene.key ? { ...s, voiceover: e.target.value } : s,
                        ),
                      )
                    }
                    placeholder="Voiceover for this scene (optional — drives captions & timing)"
                    className="text-xs"
                  />
                  <div className="flex items-center gap-3">
                    {!scene.voiceover && (
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min={0.5}
                          max={60}
                          step={0.5}
                          value={scene.duration}
                          onChange={(e) =>
                            setScenes((prev) =>
                              prev.map((s) =>
                                s.key === scene.key
                                  ? { ...s, duration: e.target.value }
                                  : s,
                              ),
                            )
                          }
                          placeholder="auto"
                          className="h-8 w-20 text-xs"
                        />
                        <span className="text-xs text-ink-faint">sec</span>
                      </div>
                    )}
                    <button
                      onClick={() =>
                        setScenes((prev) => prev.filter((s) => s.key !== scene.key))
                      }
                      className="ml-auto cursor-pointer text-xs text-ink-faint transition-colors hover:text-danger"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </Reorder.Item>
            ))}
          </AnimatePresence>
        </Reorder.Group>

        <button
          onClick={() => setPickerOpen(true)}
          className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-card border border-dashed border-line-bright py-5 text-sm text-ink-dim transition-colors hover:border-accent/50 hover:text-ink"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          Add scene from your generations
        </button>

        {/* Asset picker */}
        <AnimatePresence>
          {pickerOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
              onClick={() => setPickerOpen(false)}
            >
              <motion.div
                initial={{ scale: 0.95, y: 16 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.97, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="glass max-h-[75vh] w-full max-w-2xl overflow-y-auto rounded-card p-5"
              >
                <h3 className="mb-4 font-display font-medium">Pick a generation</h3>
                {mediaAssets.length === 0 ? (
                  <p className="py-8 text-center text-sm text-ink-faint">
                    No finished video or image generations yet — create some in
                    the studio first.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                    {mediaAssets.map((asset) => (
                      <button
                        key={asset.assetId}
                        onClick={() => addScene(asset)}
                        className="group relative aspect-square cursor-pointer overflow-hidden rounded-lg border border-line bg-void transition-colors hover:border-accent/60"
                      >
                        {asset.mime.startsWith("video/") ? (
                          <video
                            src={`/api/assets/${asset.assetId}`}
                            muted
                            className="size-full object-cover"
                          />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/assets/${asset.assetId}`}
                            alt={asset.prompt}
                            className="size-full object-cover"
                          />
                        )}
                        <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-4 text-left text-[10px] text-white/80">
                          {asset.prompt}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Right: renders */}
      <aside>
        <h2 className="mb-4 font-display text-lg font-medium">Renders</h2>
        {composeJobs.length === 0 ? (
          <p className="text-sm text-ink-faint">
            Rendered videos appear here, ready to download and upload to
            YouTube, TikTok or Reels.
          </p>
        ) : (
          <div className="space-y-4">
            <AnimatePresence mode="popLayout">
              {composeJobs.map((job) => (
                <GenerationCard key={job.id} job={job} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </aside>
    </div>
  );
}
