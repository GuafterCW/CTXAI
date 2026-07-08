import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, jobs } from "@/lib/db/schema";
import { assetAbsolutePath, saveAsset } from "@/lib/assets";
import { getProviderContext } from "@/lib/credentials";
import { elevenLabsProvider } from "@/lib/providers/elevenlabs";
import { ffmpegPath, ffprobePath, run } from "@/lib/ffmpeg";
import { emitJobEvent } from "@/lib/jobs/events";
import {
  alignmentToWords,
  buildAss,
  chunkWords,
  type Alignment,
  type TimedWord,
} from "./captions";
import { FORMAT_PRESETS, type Timeline } from "./schema";

const FPS = 30;

interface PreparedScene {
  segmentPath: string;
  duration: number;
  words: TimedWord[];
}

async function probeDuration(file: string): Promise<number> {
  try {
    const { stdout } = await run(ffprobePath(), [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "csv=p=0",
      file,
    ]);
    const duration = parseFloat(stdout.trim());
    if (duration > 0) return duration;
  } catch {
    // ffprobe may be unusable even when ffmpeg works (ffprobe-static ships
    // an x86_64 binary for darwin/arm64) — fall through to ffmpeg.
  }
  const { stderr } = await run(ffmpegPath(), ["-i", file, "-f", "null", "-"]);
  const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) throw new Error(`Could not determine duration of ${path.basename(file)}`);
  return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseFloat(match[3]);
}

async function loadAsset(userId: string, assetId: string) {
  const asset = await db.query.assets.findFirst({ where: eq(assets.id, assetId) });
  if (!asset || asset.userId !== userId) {
    throw new Error(`Asset ${assetId} not found`);
  }
  return { ...asset, absPath: assetAbsolutePath(asset.filePath) };
}

/** Generate narration for one scene via the user's ElevenLabs key. */
async function synthesizeVoiceover(
  userId: string,
  text: string,
  voice: Timeline["voice"],
  workDir: string,
  index: number,
): Promise<{ audioPath: string; duration: number; words: TimedWord[] }> {
  const ctx = await getProviderContext(userId, "elevenlabs");
  if (!ctx) {
    throw new Error(
      "Scene has a voiceover but no ElevenLabs API key is configured. Add one in Settings or remove the voiceover text.",
    );
  }

  const input: Record<string, unknown> = { text };
  if (voice.voice_id) input.voice_id = voice.voice_id;
  if (voice.model_id) input.model_id = voice.model_id;

  const parsed = elevenLabsProvider.models[0].inputSchema.parse(input);
  const { immediate } = await elevenLabsProvider.createJob(
    ctx,
    "elevenlabs-tts",
    parsed,
  );
  const audio = immediate?.assets?.find((a) => a.mime === "audio/mpeg");
  if (!audio?.data) throw new Error("ElevenLabs returned no audio");

  const audioPath = path.join(workDir, `vo-${index}.mp3`);
  await writeFile(audioPath, audio.data);

  const alignmentAsset = immediate?.assets?.find(
    (a) => a.mime === "application/json",
  );
  const words = alignmentAsset?.data
    ? alignmentToWords(JSON.parse(alignmentAsset.data.toString()) as Alignment)
    : [];

  return { audioPath, duration: await probeDuration(audioPath), words };
}

/** Normalize one scene into a uniform mp4 segment (video + audio track). */
async function renderSegment(
  opts: {
    sceneIndex: number;
    mediaPath: string;
    isImage: boolean;
    width: number;
    height: number;
    duration: number;
    trimStart: number;
    audioPath: string | null;
    workDir: string;
  },
): Promise<string> {
  const { width, height, duration } = opts;
  const out = path.join(opts.workDir, `segment-${opts.sceneIndex}.mp4`);
  const cover = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`;

  const args: string[] = ["-y"];

  if (opts.isImage) {
    args.push("-loop", "1", "-t", duration.toFixed(3), "-i", opts.mediaPath);
  } else {
    if (opts.trimStart > 0) args.push("-ss", opts.trimStart.toFixed(3));
    args.push("-t", (duration + 0.5).toFixed(3), "-i", opts.mediaPath);
  }

  if (opts.audioPath) {
    args.push("-i", opts.audioPath);
  } else {
    args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
  }

  const videoFilter = opts.isImage
    ? // Ken Burns: slow push-in on stills.
      `${cover},zoompan=z='min(zoom+0.0009,1.14)':d=${Math.ceil(duration * FPS)}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=${FPS}`
    : // Freeze the last frame if the clip is shorter than the narration.
      `${cover},fps=${FPS},tpad=stop_mode=clone:stop_duration=60`;

  args.push(
    "-filter_complex", `[0:v]${videoFilter}[v]`,
    "-map", "[v]",
    "-map", "1:a",
    "-t", duration.toFixed(3),
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-ar", "44100",
    "-shortest",
    out,
  );

  await run(ffmpegPath(), args);
  return out;
}

/**
 * Render a full composition to an MP4 and attach it to the compose job.
 * Reports progress through job events (SSE).
 */
export async function renderComposition(
  job: { id: string; userId: string },
  timeline: Timeline,
): Promise<void> {
  const preset = FORMAT_PRESETS[timeline.format];
  const workDir = await mkdtemp(path.join(tmpdir(), "ctxai-montage-"));

  const setProgress = async (progress: number) => {
    await db.update(jobs).set({ progress }).where(eq(jobs.id, job.id));
    emitJobEvent(job.userId, {
      jobId: job.id,
      status: "running",
      progress,
      error: null,
      kind: "compose",
    });
  };

  try {
    /* 1) Prepare scenes: voiceover + normalized segments (≈70% of work). */
    const prepared: PreparedScene[] = [];
    let cursor = 0; // global time offset for captions

    for (const [index, scene] of timeline.scenes.entries()) {
      const media = await loadAsset(job.userId, scene.assetId);
      const isImage = media.mime.startsWith("image/");
      if (!isImage && !media.mime.startsWith("video/")) {
        throw new Error(`Scene ${index + 1}: asset must be an image or video`);
      }
      if (media.mime === "image/svg+xml") {
        // FFmpeg has no SVG decoder; older demo images were saved as SVG.
        throw new Error(
          `Scene ${index + 1}: SVG images can't be rendered into a montage — generate a new image for this scene.`,
        );
      }

      let audioPath: string | null = null;
      let words: TimedWord[] = [];
      let duration: number;

      if (scene.voiceover?.trim()) {
        const vo = await synthesizeVoiceover(
          job.userId,
          scene.voiceover.trim(),
          timeline.voice,
          workDir,
          index,
        );
        audioPath = vo.audioPath;
        duration = vo.duration + 0.35; // small breathing room
        words = vo.words.map((w) => ({
          ...w,
          start: w.start + cursor,
          end: w.end + cursor,
        }));
      } else if (isImage) {
        duration = scene.duration ?? 3.5;
      } else {
        const clipLength = media.duration ?? (await probeDuration(media.absPath));
        duration = scene.duration ?? Math.max(clipLength - (scene.trimStart ?? 0), 1);
      }

      const segmentPath = await renderSegment({
        sceneIndex: index,
        mediaPath: media.absPath,
        isImage,
        width: preset.width,
        height: preset.height,
        duration,
        trimStart: scene.trimStart ?? 0,
        audioPath,
        workDir,
      });

      prepared.push({ segmentPath, duration, words });
      cursor += duration;
      await setProgress(((index + 1) / timeline.scenes.length) * 0.7);
    }

    /* 2) Concat segments. */
    const concatList = prepared
      .map((s) => `file '${s.segmentPath.replaceAll("'", "'\\''")}'`)
      .join("\n");
    const listPath = path.join(workDir, "concat.txt");
    await writeFile(listPath, concatList);

    const concatPath = path.join(workDir, "concat.mp4");
    await run(ffmpegPath(), [
      "-y", "-f", "concat", "-safe", "0",
      "-i", listPath,
      "-c", "copy",
      concatPath,
    ]);
    await setProgress(0.8);

    /* 3) Captions + music in a single final pass. */
    const finalPath = path.join(workDir, "final.mp4");
    const args: string[] = ["-y", "-i", concatPath];
    const filters: string[] = [];
    let videoLabel = "0:v";
    let audioLabel = "0:a";

    if (timeline.captionStyle !== "none") {
      const allWords = prepared.flatMap((s) => s.words);
      if (allWords.length > 0) {
        const assPath = path.join(workDir, "captions.ass");
        await writeFile(
          assPath,
          buildAss(chunkWords(allWords), {
            width: preset.width,
            height: preset.height,
            style: timeline.captionStyle,
          }),
        );
        filters.push(`[0:v]ass='${assPath.replaceAll("'", "\\'")}'[vout]`);
        videoLabel = "vout";
      }
    }

    if (timeline.musicAssetId) {
      const music = await loadAsset(job.userId, timeline.musicAssetId);
      args.push("-stream_loop", "-1", "-i", music.absPath);
      filters.push(
        `[1:a]volume=${timeline.musicVolume}[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
      );
      audioLabel = "aout";
    }

    if (filters.length > 0) args.push("-filter_complex", filters.join(";"));
    args.push(
      "-map", videoLabel === "0:v" ? "0:v" : `[${videoLabel}]`,
      "-map", audioLabel === "0:a" ? "0:a" : `[${audioLabel}]`,
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "19",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "192k",
      "-movflags", "+faststart",
      finalPath,
    );
    await run(ffmpegPath(), args);
    await setProgress(0.95);

    /* 4) Store the result as a job asset. */
    const data = await readFile(finalPath);
    const total = prepared.reduce((sum, s) => sum + s.duration, 0);
    await saveAsset(job.userId, job.id, {
      data,
      mime: "video/mp4",
      width: preset.width,
      height: preset.height,
      duration: total,
    });

    await db
      .update(jobs)
      .set({ status: "succeeded", progress: 1, finishedAt: new Date() })
      .where(eq(jobs.id, job.id));
    emitJobEvent(job.userId, {
      jobId: job.id,
      status: "succeeded",
      progress: 1,
      error: null,
      kind: "compose",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Render failed";
    await db
      .update(jobs)
      .set({ status: "failed", error: message, finishedAt: new Date() })
      .where(eq(jobs.id, job.id));
    emitJobEvent(job.userId, {
      jobId: job.id,
      status: "failed",
      progress: null,
      error: message,
      kind: "compose",
    });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
