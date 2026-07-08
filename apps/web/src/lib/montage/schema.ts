import { z } from "zod";

/** Output presets: platform-ready resolutions. */
export const FORMAT_PRESETS = {
  "9:16": { width: 1080, height: 1920, label: "Shorts / Reels / TikTok" },
  "16:9": { width: 1920, height: 1080, label: "YouTube" },
  "1:1": { width: 1080, height: 1080, label: "Square feed" },
} as const;

export const sceneSchema = z.object({
  /** Asset id of a generated video clip or image. */
  assetId: z.string().min(1),
  /** Spoken narration for this scene (drives duration + captions). */
  voiceover: z.string().max(2000).optional(),
  /** Seconds. For images without voiceover; ignored when voiceover is set. */
  duration: z.number().min(0.5).max(60).optional(),
  /** Trim start within a video clip, seconds. */
  trimStart: z.number().min(0).optional(),
});

export const timelineSchema = z.object({
  format: z.enum(["9:16", "16:9", "1:1"]).default("9:16"),
  scenes: z.array(sceneSchema).min(1).max(30),
  captionStyle: z.enum(["bold", "minimal", "none"]).default("bold"),
  /** Asset id of an audio track to lay under the whole video. */
  musicAssetId: z.string().optional(),
  musicVolume: z.number().min(0).max(1).default(0.2),
  voice: z
    .object({
      voice_id: z.string().optional(),
      model_id: z.string().optional(),
    })
    .default({}),
});

export type Timeline = z.infer<typeof timelineSchema>;
export type Scene = z.infer<typeof sceneSchema>;
