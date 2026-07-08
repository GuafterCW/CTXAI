import { z } from "zod";
import { fetchJson } from "../http";
import {
  ProviderError,
  type Provider,
  type ProviderContext,
} from "../types";

const DEFAULT_BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3";

function ctxOf(ctx: ProviderContext) {
  const { apiKey } = ctx.credentials;
  if (!apiKey) throw new ProviderError("Seedream: API key is required");
  return {
    baseUrl: ctx.config.baseUrl?.replace(/\/$/, "") || DEFAULT_BASE_URL,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  };
}

const inputSchema = z.object({
  prompt: z.string().min(1).max(4000).describe("Describe the image to create"),
  size: z
    .enum(["1024x1024", "1080x1920", "1920x1080", "2048x2048", "2K", "4K"])
    .default("2048x2048")
    .describe("Output resolution"),
  seed: z.number().int().min(0).max(2147483647).optional(),
  watermark: z.boolean().default(false),
  model_version: z
    .enum(["seedream-4-0-250828", "seedream-3-5"])
    .default("seedream-4-0-250828")
    .describe("Seedream model version"),
});

interface ArkImageResponse {
  data: Array<{ url?: string; b64_json?: string; size?: string }>;
}

const dims = (size?: string) => {
  const match = size?.match(/^(\d+)x(\d+)$/);
  return match
    ? { width: Number(match[1]), height: Number(match[2]) }
    : {};
};

export const seedreamProvider: Provider = {
  id: "seedream",
  name: "Seedream",
  description:
    "ByteDance Seedream via BytePlus ModelArk — fast, high-fidelity image generation.",
  keyUrl: "https://console.byteplus.com/ark/apiKey",
  credentialFields: [
    {
      key: "apiKey",
      label: "ARK API Key",
      secret: true,
      placeholder: "ak-…",
      hint: "console.byteplus.com → ModelArk → API Keys",
    },
  ],
  configFields: [
    {
      key: "baseUrl",
      label: "API Base URL",
      placeholder: DEFAULT_BASE_URL,
      hint: "Change only if your ModelArk region differs.",
    },
  ],
  models: [
    {
      id: "seedream-image",
      name: "Seedream · Image",
      kind: "image",
      description: "Generate a high-fidelity image from a text prompt.",
      inputSchema,
      costHint: "~$0.03 / image",
    },
  ],

  async validateCredentials(ctx) {
    const { baseUrl, headers } = ctxOf(ctx);
    // Listing foundation models is a cheap authenticated read.
    await fetchJson(`${baseUrl}/models`, {
      headers,
      providerName: "Seedream",
    });
  },

  // ModelArk image generation is synchronous — return the result immediately.
  async createJob(ctx, _modelId, input) {
    const { baseUrl, headers } = ctxOf(ctx);
    const { model_version, ...rest } = input as z.infer<typeof inputSchema>;
    const res = await fetchJson<ArkImageResponse>(
      `${baseUrl}/images/generations`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: model_version,
          response_format: "url",
          ...rest,
        }),
        providerName: "Seedream",
      },
    );

    const images = res.data ?? [];
    if (images.length === 0) {
      throw new ProviderError("Seedream returned no image");
    }

    return {
      providerJobId: `sync:${Date.now()}`,
      immediate: {
        status: "succeeded" as const,
        assets: images.map((img) => ({
          url: img.url,
          data: img.b64_json ? Buffer.from(img.b64_json, "base64") : undefined,
          mime: "image/png",
          ...dims(img.size),
        })),
      },
    };
  },

  async pollJob() {
    // Never reached: createJob always resolves immediately.
    throw new ProviderError("Seedream jobs complete synchronously");
  },
};
