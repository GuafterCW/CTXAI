import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { createGenerationJob, getJob, JobInputError, listJobs } from "@/lib/jobs";
import { ensurePollerRunning } from "@/lib/jobs/poller";
import { listModelsForUser } from "@/lib/models";
import { findModel, listProviders } from "@/lib/providers/registry";

export interface McpToolContext {
  userId: string;
  /** Origin used to build absolute asset URLs, e.g. http://localhost:3000 */
  origin: string;
}

interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute(args: Record<string, unknown>, ctx: McpToolContext): Promise<unknown>;
}

/* --------------------------------- helpers -------------------------------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function jobPayload(job: any, ctx: McpToolContext) {
  return {
    job_id: job.id,
    status: job.status,
    provider: job.provider,
    model: job.modelId,
    kind: job.kind,
    progress: job.progress,
    error: job.error,
    created_at: job.createdAt,
    assets: (job.assets ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((a: any) => ({
      asset_id: a.id,
      mime: a.mime,
      width: a.width,
      height: a.height,
      duration: a.duration,
      url: `${ctx.origin}/api/assets/${a.id}`,
      download_hint:
        "GET this URL with the same Authorization: Bearer header to download the file.",
    })),
  };
}

async function startGeneration(
  ctx: McpToolContext,
  kind: "video" | "image" | "audio",
  args: { model?: string; params?: Record<string, unknown> } & Record<string, unknown>,
) {
  const models = (await listModelsForUser(ctx.userId)).filter(
    (m) => m.kind === kind && m.configured,
  );
  if (models.length === 0) {
    throw new Error(
      `No configured ${kind} provider. Add an API key in the CTXAI settings first.`,
    );
  }
  const model = args.model
    ? models.find((m) => m.id === args.model)
    : models.find((m) => m.providerId !== "mock") ?? models[0];
  if (!model) {
    throw new Error(
      `Unknown or unconfigured model "${args.model}". Available: ${models
        .map((m) => m.id)
        .join(", ")}`,
    );
  }

  const { model: descriptor } = findModel(model.providerId, model.id);
  const input: Record<string, unknown> = { ...(args.params ?? {}) };
  for (const key of Object.keys(descriptor.inputSchema.shape)) {
    if (args[key] !== undefined && key !== "model") input[key] = args[key];
  }

  try {
    const job = await createGenerationJob(ctx.userId, {
      provider: model.providerId,
      modelId: model.id,
      input,
    });
    return {
      ...jobPayload(job, ctx),
      hint:
        job?.status === "succeeded" || job?.status === "failed"
          ? undefined
          : "Generation is running. Call wait_for_job with this job_id to block until it finishes.",
    };
  } catch (err) {
    if (err instanceof JobInputError) throw new Error(err.message);
    throw err;
  }
}

const schema = (shape: z.ZodRawShape) =>
  zodToJsonSchema(z.object(shape)) as Record<string, unknown>;

/* ---------------------------------- tools --------------------------------- */

export const mcpTools: McpTool[] = [
  {
    name: "list_models",
    description:
      "List all generation models on this CTXAI instance, including whether the user has configured credentials for them and each model's parameter JSON schema.",
    inputSchema: schema({}),
    async execute(_args, ctx) {
      const models = await listModelsForUser(ctx.userId);
      return {
        models: models.map((m) => ({
          model: m.id,
          provider: m.providerName,
          kind: m.kind,
          description: m.description,
          configured: m.configured,
          cost_hint: m.costHint,
          parameters: m.paramsSchema,
        })),
      };
    },
  },
  {
    name: "generate_video",
    description:
      "Start a video generation (e.g. Kling text-to-video or image-to-video). Returns a job_id; use wait_for_job to get the finished video.",
    inputSchema: schema({
      prompt: z.string().describe("What the video should show"),
      model: z
        .string()
        .optional()
        .describe("Model id from list_models (default: first configured video model)"),
      image: z
        .string()
        .optional()
        .describe("Source image URL or base64 for image-to-video models"),
      params: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Model-specific parameters, see list_models"),
    }),
    execute: (args, ctx) =>
      startGeneration(ctx, "video", args as Parameters<typeof startGeneration>[2]),
  },
  {
    name: "generate_image",
    description:
      "Start an image generation (e.g. Seedream). Usually completes within seconds; the response then already contains the asset URL.",
    inputSchema: schema({
      prompt: z.string().describe("What the image should show"),
      model: z.string().optional().describe("Model id from list_models"),
      params: z.record(z.string(), z.unknown()).optional(),
    }),
    execute: (args, ctx) =>
      startGeneration(ctx, "image", args as Parameters<typeof startGeneration>[2]),
  },
  {
    name: "generate_voiceover",
    description:
      "Generate a voiceover (ElevenLabs) with word-level timestamps. Returns an MP3 asset plus an alignment JSON asset for captions.",
    inputSchema: schema({
      text: z.string().describe("Text to speak"),
      voice_id: z.string().optional().describe("ElevenLabs voice id"),
      params: z.record(z.string(), z.unknown()).optional(),
    }),
    async execute(args, ctx) {
      const params: Record<string, unknown> = { ...(args.params as object) };
      if (args.voice_id) params.voice_id = args.voice_id;
      return startGeneration(ctx, "audio", {
        text: args.text,
        params,
      });
    },
  },
  {
    name: "get_job_status",
    description: "Get the current status, progress and assets of a generation job.",
    inputSchema: schema({ job_id: z.string() }),
    async execute(args, ctx) {
      ensurePollerRunning();
      const job = await getJob(ctx.userId, String(args.job_id));
      if (!job) throw new Error(`Job ${args.job_id} not found`);
      return jobPayload(job, ctx);
    },
  },
  {
    name: "wait_for_job",
    description:
      "Block until a generation job finishes (or the timeout elapses) and return its final status with asset URLs.",
    inputSchema: schema({
      job_id: z.string(),
      timeout_seconds: z.number().int().min(5).max(300).default(120),
    }),
    async execute(args, ctx) {
      ensurePollerRunning();
      const deadline =
        Date.now() + Math.min(Number(args.timeout_seconds) || 120, 300) * 1000;
      for (;;) {
        const job = await getJob(ctx.userId, String(args.job_id));
        if (!job) throw new Error(`Job ${args.job_id} not found`);
        if (job.status === "succeeded" || job.status === "failed") {
          return jobPayload(job, ctx);
        }
        if (Date.now() > deadline) {
          return {
            ...jobPayload(job, ctx),
            hint: "Still running — call wait_for_job again to keep waiting.",
          };
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    },
  },
  {
    name: "list_generations",
    description: "List recent generation jobs of the authenticated user.",
    inputSchema: schema({
      limit: z.number().int().min(1).max(100).default(20),
      kind: z.enum(["video", "image", "audio", "compose"]).optional(),
    }),
    async execute(args, ctx) {
      const jobs = await listJobs(ctx.userId, {
        limit: Number(args.limit) || 20,
        kind: args.kind ? String(args.kind) : undefined,
      });
      return { jobs: jobs.map((j) => jobPayload(j, ctx)) };
    },
  },
  {
    name: "compose_video",
    description:
      "Compose generated assets into a publish-ready video (YouTube Shorts 9:16, YouTube 16:9 or square). Scenes play in order; scenes with voiceover text get ElevenLabs narration and burned-in word-level captions. Returns a compose job — use wait_for_job for the final MP4. Typical agent workflow: generate clips/images first, then compose them.",
    inputSchema: schema({
      title: z.string().optional().describe("Name for this montage"),
      format: z.enum(["9:16", "16:9", "1:1"]).default("9:16"),
      scenes: z
        .array(
          z.object({
            asset_id: z.string().describe("Asset id of a generated video/image"),
            voiceover: z
              .string()
              .optional()
              .describe("Narration for this scene (needs an ElevenLabs key)"),
            duration: z
              .number()
              .optional()
              .describe("Seconds; only used when there is no voiceover"),
            trim_start: z.number().optional(),
          }),
        )
        .min(1)
        .describe("Ordered scenes"),
      caption_style: z.enum(["bold", "minimal", "none"]).default("bold"),
      music_asset_id: z
        .string()
        .optional()
        .describe("Audio asset to lay under the video"),
      music_volume: z.number().min(0).max(1).default(0.2),
      voice_id: z.string().optional().describe("ElevenLabs voice id"),
    }),
    async execute(args, ctx) {
      const { composeAndRender, MontageInputError } = await import("@/lib/montage");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scenes = (args.scenes as any[]).map((s) => ({
        assetId: s.asset_id,
        voiceover: s.voiceover,
        duration: s.duration,
        trimStart: s.trim_start,
      }));
      try {
        const { compositionId, job } = await composeAndRender(ctx.userId, {
          title: args.title ? String(args.title) : undefined,
          timeline: {
            format: args.format ?? "9:16",
            scenes,
            captionStyle: args.caption_style ?? "bold",
            musicAssetId: args.music_asset_id,
            musicVolume: args.music_volume ?? 0.2,
            voice: { voice_id: args.voice_id ? String(args.voice_id) : undefined },
          },
        });
        const fresh = await getJob(ctx.userId, job.id);
        return {
          composition_id: compositionId,
          ...jobPayload(fresh ?? job, ctx),
          hint: "Rendering locally. Call wait_for_job with this job_id to get the finished MP4.",
        };
      } catch (err) {
        if (err instanceof MontageInputError) throw new Error(err.message);
        throw err;
      }
    },
  },
  {
    name: "list_providers",
    description:
      "List the AI providers this instance supports and where to obtain API keys.",
    inputSchema: schema({}),
    async execute() {
      return {
        providers: listProviders().map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          key_url: p.keyUrl,
        })),
      };
    },
  },
];

export function findMcpTool(name: string) {
  return mcpTools.find((t) => t.name === name);
}
