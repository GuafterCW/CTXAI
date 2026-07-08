import type { z } from "zod";
import type { JobKind } from "@/lib/db/schema";

/** A credential/config field a provider needs from the user. */
export interface ProviderField {
  key: string;
  label: string;
  /** Secret fields are encrypted at rest and never returned to the client. */
  secret?: boolean;
  placeholder?: string;
  /** Optional help text, e.g. where to obtain the key. */
  hint?: string;
}

/** One generation model a provider offers. */
export interface ModelDescriptor {
  id: string;
  name: string;
  kind: Exclude<JobKind, "compose">;
  description: string;
  /**
   * Zod object schema for the generation input (prompt + params).
   * Drives both the studio parameter UI and the MCP tool schemas.
   */
  inputSchema: z.ZodObject<z.ZodRawShape>;
  /** Rough cost hint shown in the UI, e.g. "$0.03 / image". */
  costHint?: string;
}

export type Credentials = Record<string, string>;

export interface ProviderContext {
  credentials: Credentials;
  /** Non-secret per-user config, e.g. { baseUrl } for region selection. */
  config: Record<string, string>;
}

export interface ProviderAsset {
  /** Remote URL to download from (either url or data must be set). */
  url?: string;
  /** Inline binary content for providers that return data directly. */
  data?: Buffer;
  mime: string;
  width?: number;
  height?: number;
  /** Seconds, for video/audio. */
  duration?: number;
}

export interface PollResult {
  status: "running" | "succeeded" | "failed";
  /** 0..1 if the provider reports progress. */
  progress?: number;
  error?: string;
  /** Present when status is "succeeded". */
  assets?: ProviderAsset[];
}

export interface Provider {
  id: string;
  name: string;
  /** Short description shown in settings. */
  description: string;
  /** URL where users create their API keys. */
  keyUrl: string;
  credentialFields: ProviderField[];
  configFields?: ProviderField[];
  models: ModelDescriptor[];
  /** Throws (or rejects) with a useful message when credentials are bad. */
  validateCredentials(ctx: ProviderContext): Promise<void>;
  /**
   * Start a generation. Poll-based providers return a providerJobId;
   * synchronous providers may return the finished result as `immediate`.
   */
  createJob(
    ctx: ProviderContext,
    modelId: string,
    input: Record<string, unknown>,
  ): Promise<{ providerJobId: string; immediate?: PollResult }>;
  pollJob(ctx: ProviderContext, providerJobId: string): Promise<PollResult>;
}

/** Error with a message safe to surface to the user. */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
