import { z } from "zod";
import { createHmac } from "node:crypto";
import { fetchJson } from "../http";
import {
  ProviderError,
  type PollResult,
  type Provider,
  type ProviderContext,
} from "../types";

const DEFAULT_BASE_URL = "https://api-singapore.klingai.com";

/* ----------------------------- JWT (HS256) ------------------------------ */

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64url");

/** Kling authenticates with a short-lived JWT signed by the secret key. */
export function klingJwt(accessKey: string, secretKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({ iss: accessKey, exp: now + 1800, nbf: now - 5 }),
  );
  const signature = createHmac("sha256", secretKey)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

/* --------------------------------- API ---------------------------------- */

interface KlingEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

interface KlingTask {
  task_id: string;
  task_status: "submitted" | "processing" | "succeed" | "failed";
  task_status_msg?: string;
  task_result?: {
    videos?: Array<{ id: string; url: string; duration: string }>;
  };
}

function ctxOf(ctx: ProviderContext) {
  const { accessKey, secretKey } = ctx.credentials;
  if (!accessKey || !secretKey) {
    throw new ProviderError("Kling: access key and secret key are required");
  }
  return {
    baseUrl: ctx.config.baseUrl?.replace(/\/$/, "") || DEFAULT_BASE_URL,
    headers: {
      Authorization: `Bearer ${klingJwt(accessKey, secretKey)}`,
      "Content-Type": "application/json",
    },
  };
}

function unwrap<T>(envelope: KlingEnvelope<T>): T {
  if (envelope.code !== 0) {
    throw new ProviderError(`Kling: ${envelope.message} (code ${envelope.code})`);
  }
  return envelope.data;
}

/* -------------------------------- models -------------------------------- */

const commonVideoParams = {
  model_version: z
    .enum(["kling-v1-6", "kling-v2-1", "kling-v2-1-master"])
    .default("kling-v2-1")
    .describe("Kling model version"),
  duration: z.enum(["5", "10"]).default("5").describe("Clip length in seconds"),
  mode: z
    .enum(["std", "pro"])
    .default("std")
    .describe("std is cheaper, pro has higher fidelity"),
  negative_prompt: z
    .string()
    .max(2500)
    .optional()
    .describe("What to avoid in the video"),
  cfg_scale: z
    .number()
    .min(0)
    .max(1)
    .default(0.5)
    .describe("Prompt adherence (0 = loose, 1 = strict)"),
};

const t2vSchema = z.object({
  prompt: z.string().min(1).max(2500).describe("Describe the video to create"),
  aspect_ratio: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
  ...commonVideoParams,
});

const i2vSchema = z.object({
  image: z
    .string()
    .min(1)
    .describe("Source image: public URL or base64 (no data: prefix)"),
  prompt: z
    .string()
    .max(2500)
    .optional()
    .describe("How the image should move"),
  ...commonVideoParams,
});

/** providerJobId format: "<endpoint>:<task_id>" — polling URL depends on endpoint. */
const endpointOf = (providerJobId: string) => {
  const [endpoint, taskId] = providerJobId.split(":");
  if (!taskId) throw new ProviderError("Kling: malformed provider job id");
  return { endpoint, taskId };
};

export const klingProvider: Provider = {
  id: "kling",
  name: "Kling",
  description: "Kuaishou's Kling — state-of-the-art text-to-video and image-to-video.",
  keyUrl: "https://app.klingai.com/global/dev/document-api",
  credentialFields: [
    { key: "accessKey", label: "Access Key", secret: true, placeholder: "AK…" },
    { key: "secretKey", label: "Secret Key", secret: true, placeholder: "SK…" },
  ],
  configFields: [
    {
      key: "baseUrl",
      label: "API Base URL",
      placeholder: DEFAULT_BASE_URL,
      hint: "Leave empty for the international (Singapore) endpoint.",
    },
  ],
  models: [
    {
      id: "kling-text-to-video",
      name: "Kling · Text to Video",
      kind: "video",
      description: "Generate a 5–10s cinematic clip from a text prompt.",
      inputSchema: t2vSchema,
      costHint: "uses your Kling credits",
    },
    {
      id: "kling-image-to-video",
      name: "Kling · Image to Video",
      kind: "video",
      description: "Animate a still image into a 5–10s clip.",
      inputSchema: i2vSchema,
      costHint: "uses your Kling credits",
    },
  ],

  async validateCredentials(ctx) {
    const { baseUrl, headers } = ctxOf(ctx);
    const now = Date.now();
    // Cheap authenticated read: account cost query for the last 24h.
    await fetchJson<KlingEnvelope<unknown>>(
      `${baseUrl}/account/costs?start_time=${now - 86_400_000}&end_time=${now}`,
      { headers, providerName: "Kling" },
    ).then(unwrap);
  },

  async createJob(ctx, modelId, input) {
    const { baseUrl, headers } = ctxOf(ctx);
    const endpoint =
      modelId === "kling-image-to-video" ? "image2video" : "text2video";
    const { model_version, ...rest } = input as Record<string, unknown> & {
      model_version?: string;
    };
    const data = await fetchJson<KlingEnvelope<KlingTask>>(
      `${baseUrl}/v1/videos/${endpoint}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ model_name: model_version, ...rest }),
        providerName: "Kling",
      },
    ).then(unwrap);
    return { providerJobId: `${endpoint}:${data.task_id}` };
  },

  async pollJob(ctx, providerJobId): Promise<PollResult> {
    const { baseUrl, headers } = ctxOf(ctx);
    const { endpoint, taskId } = endpointOf(providerJobId);
    const data = await fetchJson<KlingEnvelope<KlingTask>>(
      `${baseUrl}/v1/videos/${endpoint}/${taskId}`,
      { headers, providerName: "Kling" },
    ).then(unwrap);

    switch (data.task_status) {
      case "submitted":
        return { status: "running", progress: 0.05 };
      case "processing":
        return { status: "running" };
      case "failed":
        return {
          status: "failed",
          error: data.task_status_msg || "Kling reported a failure",
        };
      case "succeed": {
        const videos = data.task_result?.videos ?? [];
        if (videos.length === 0) {
          return { status: "failed", error: "Kling returned no video" };
        }
        return {
          status: "succeeded",
          assets: videos.map((v) => ({
            url: v.url,
            mime: "video/mp4",
            duration: Number(v.duration) || undefined,
          })),
        };
      }
      default:
        return { status: "running" };
    }
  },
};
