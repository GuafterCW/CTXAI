import { z } from "zod";
import { fetchJson } from "../http";
import {
  ProviderError,
  type Provider,
  type ProviderContext,
} from "../types";

const BASE_URL = "https://api.elevenlabs.io/v1";

function headersOf(ctx: ProviderContext) {
  const { apiKey } = ctx.credentials;
  if (!apiKey) throw new ProviderError("ElevenLabs: API key is required");
  return { "xi-api-key": apiKey, "Content-Type": "application/json" };
}

const inputSchema = z.object({
  text: z.string().min(1).max(5000).describe("Text to speak"),
  voice_id: z
    .string()
    .default("21m00Tcm4TlvDq8ikWAM")
    .describe("ElevenLabs voice id (default: Rachel)"),
  model_id: z
    .enum(["eleven_multilingual_v2", "eleven_turbo_v2_5", "eleven_v3"])
    .default("eleven_multilingual_v2"),
  stability: z.number().min(0).max(1).default(0.5),
  similarity_boost: z.number().min(0).max(1).default(0.75),
});

interface TtsWithTimestamps {
  audio_base64: string;
  alignment: {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  } | null;
}

export const elevenLabsProvider: Provider = {
  id: "elevenlabs",
  name: "ElevenLabs",
  description:
    "Voiceover generation with word-level timestamps — powers montage narration and captions.",
  keyUrl: "https://elevenlabs.io/app/settings/api-keys",
  credentialFields: [
    { key: "apiKey", label: "API Key", secret: true, placeholder: "sk_…" },
  ],
  models: [
    {
      id: "elevenlabs-tts",
      name: "ElevenLabs · Voiceover",
      kind: "audio",
      description:
        "Text-to-speech with timestamps. Returns an MP3 plus an alignment JSON asset.",
      inputSchema,
      costHint: "uses your ElevenLabs characters",
    },
  ],

  async validateCredentials(ctx) {
    await fetchJson(`${BASE_URL}/user`, {
      headers: headersOf(ctx),
      providerName: "ElevenLabs",
    });
  },

  // TTS is synchronous — the audio and its alignment come back in one call.
  async createJob(ctx, _modelId, input) {
    const { text, voice_id, model_id, stability, similarity_boost } =
      input as z.infer<typeof inputSchema>;
    const res = await fetchJson<TtsWithTimestamps>(
      `${BASE_URL}/text-to-speech/${voice_id}/with-timestamps`,
      {
        method: "POST",
        headers: headersOf(ctx),
        body: JSON.stringify({
          text,
          model_id,
          voice_settings: { stability, similarity_boost },
        }),
        providerName: "ElevenLabs",
      },
    );

    const assets = [
      {
        data: Buffer.from(res.audio_base64, "base64"),
        mime: "audio/mpeg",
      },
    ];
    if (res.alignment) {
      // Alignment rides along as a JSON asset so the montage renderer
      // can build word-level captions without re-calling the API.
      assets.push({
        data: Buffer.from(JSON.stringify(res.alignment)),
        mime: "application/json",
      });
    }

    return {
      providerJobId: `sync:${Date.now()}`,
      immediate: { status: "succeeded" as const, assets },
    };
  },

  async pollJob() {
    throw new ProviderError("ElevenLabs jobs complete synchronously");
  },
};
