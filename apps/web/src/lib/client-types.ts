/** DTOs shared between server components, API routes and client UI. */

export interface AssetDto {
  id: string;
  mime: string;
  width: number | null;
  height: number | null;
  duration: number | null;
}

export interface JobDto {
  id: string;
  provider: string;
  modelId: string;
  kind: string;
  status: "queued" | "running" | "succeeded" | "failed";
  input: Record<string, unknown>;
  progress: number | null;
  error: string | null;
  createdAt: string;
  assets: AssetDto[];
}

export interface ModelDto {
  id: string;
  providerId: string;
  providerName: string;
  name: string;
  kind: string;
  description: string;
  costHint?: string;
  /** JSON schema derived from the provider's zod input schema. */
  paramsSchema: JsonSchema;
  configured: boolean;
}

export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

export interface JsonSchemaProperty {
  type?: string;
  description?: string;
  enum?: string[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toJobDto(job: any): JobDto {
  return {
    id: job.id,
    provider: job.provider,
    modelId: job.modelId,
    kind: job.kind,
    status: job.status,
    input: job.input ?? {},
    progress: job.progress,
    error: job.error,
    createdAt:
      job.createdAt instanceof Date
        ? job.createdAt.toISOString()
        : String(job.createdAt),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assets: (job.assets ?? []).map((a: any) => ({
      id: a.id,
      mime: a.mime,
      width: a.width,
      height: a.height,
      duration: a.duration,
    })),
  };
}
