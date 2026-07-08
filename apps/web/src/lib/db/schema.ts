import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

/* ---------------------------------- auth ---------------------------------- */
/* Tables required by Better Auth (drizzle adapter). */

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", {
    mode: "timestamp",
  }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", {
    mode: "timestamp",
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

/* --------------------------------- domain --------------------------------- */

/** Encrypted BYO provider credentials (Kling, Seedream, ElevenLabs, …). */
export const providerCredentials = sqliteTable(
  "provider_credentials",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    /** AES-256-GCM encrypted JSON blob of provider-specific fields. */
    encryptedPayload: text("encrypted_payload").notNull(),
    /** Non-secret settings, e.g. { baseUrl } for Kling region selection. */
    config: text("config", { mode: "json" }).$type<Record<string, string>>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("provider_credentials_user_idx").on(t.userId, t.provider)],
);

/** Platform API keys (`ctx_…`) used to authenticate MCP / REST clients. */
export const apiKeys = sqliteTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** SHA-256 hash of the full key; the key itself is shown once. */
    keyHash: text("key_hash").notNull().unique(),
    /** First 12 chars (`ctx_ab12cd34`) for display. */
    keyPrefix: text("key_prefix").notNull(),
    lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("api_keys_user_idx").on(t.userId)],
);

export type JobKind = "video" | "image" | "audio" | "compose";
export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    modelId: text("model_id").notNull(),
    kind: text("kind").$type<JobKind>().notNull(),
    status: text("status").$type<JobStatus>().notNull().default("queued"),
    /** Validated generation input: prompt + params (JSON). */
    input: text("input", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    providerJobId: text("provider_job_id"),
    /** 0..1 where known, null where the provider reports no progress. */
    progress: real("progress"),
    error: text("error"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    startedAt: integer("started_at", { mode: "timestamp" }),
    finishedAt: integer("finished_at", { mode: "timestamp" }),
  },
  (t) => [
    index("jobs_user_idx").on(t.userId, t.createdAt),
    index("jobs_status_idx").on(t.status),
  ],
);

export const assets = sqliteTable(
  "assets",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Path relative to the data dir; provider URLs expire, so we download. */
    filePath: text("file_path").notNull(),
    mime: text("mime").notNull(),
    width: integer("width"),
    height: integer("height"),
    /** Seconds, for video/audio. */
    duration: real("duration"),
    sizeBytes: integer("size_bytes"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("assets_job_idx").on(t.jobId),
    index("assets_user_idx").on(t.userId, t.createdAt),
  ],
);

export type FormatPreset = "9:16" | "16:9" | "1:1";

export const compositions = sqliteTable(
  "compositions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    formatPreset: text("format_preset").$type<FormatPreset>().notNull(),
    /** Full timeline JSON (scenes, voiceover, captions, music). */
    timeline: text("timeline", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    /** Job id of the latest render (kind "compose"), if any. */
    renderJobId: text("render_job_id"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("compositions_user_idx").on(t.userId, t.updatedAt)],
);
