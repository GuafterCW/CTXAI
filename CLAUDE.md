# CTXAI — agent notes

Self-hosted BYO-key AI generation studio. pnpm monorepo: `apps/web` (Next.js 15
monolith: UI + REST + SSE + MCP) and `packages/mcp-stdio` (npx MCP proxy).

## Commands (run from repo root)

- `pnpm dev` — dev server on :3000 (DB migrations run on boot)
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — full check
  (typecheck needs a prior dev/build run for `next-env.d.ts` / `.next/types`)
- `pnpm --filter @ctxai/web db:generate` — regenerate Drizzle migrations after
  editing `src/lib/db/schema.ts`

`apps/web/.env` needs `BETTER_AUTH_SECRET` (base64) and `ENCRYPTION_KEY`
(32-byte hex). SQLite + assets land in `apps/web/data/` (gitignored).

## Architecture invariants

- **Provider adapters** (`src/lib/providers/<id>/index.ts`) implement the
  `Provider` interface and are registered in `registry.ts`. Their zod
  `inputSchema` drives the studio params UI (via zod-to-json-schema) AND the
  MCP tool schemas — change it in one place only.
- Sync providers (Seedream, ElevenLabs) return `immediate` results from
  `createJob`; poll-based ones (Kling) are driven by the in-process poller
  (`src/lib/jobs/poller.ts`, started lazily, globalThis-guarded).
- **Dev-mode gotcha**: Next.js compiles separate module instances per route
  bundle. Anything that must be shared across routes (event emitter, mock job
  map, poller handle) lives on `globalThis` under a `Symbol.for` key.
- Assets are always downloaded to disk (`src/lib/assets.ts`) because provider
  URLs expire; they are served through `/api/assets/[id]` with owner checks.
- Auth: browser uses Better Auth session cookies; MCP/REST clients use
  hashed platform keys (`ctx_…`) via `Authorization: Bearer` — both resolved
  in `src/lib/api.ts#requireApiUser`.
- The MCP endpoint (`/api/mcp`) is a hand-rolled stateless Streamable-HTTP
  JSON-RPC server (tools only, no sessions). The stdio package is a dumb
  line-based proxy to it — keep it dependency-free.
- Montage rendering (`src/lib/montage/renderer.ts`) shells out to FFmpeg
  (`src/lib/ffmpeg.ts` prefers system binaries, falls back to ffmpeg-static;
  Docker sets FFMPEG_PATH/FFPROBE_PATH). Compose jobs are `kind: "compose"`
  and are NOT polled — the renderer pushes progress itself.

## UI conventions

- Design tokens live in `src/app/globals.css` (`@theme`): void/surface/raised
  surfaces, ink text scale, violet→blue accent gradient, `glass`,
  `gradient-border-spin`, `shimmer-surface`, `text-gradient` utilities.
  No ad-hoc colors.
- Animations use `motion/react` (framer-motion). Generation card states:
  busy = spinning gradient border + shimmer + progress ring; success =
  blur-to-sharp reveal + one-shot glow; failure = shake + danger border.
- Live updates: one SSE stream per user (`/api/jobs/events`), consumed by
  `useJobStream` — jobs created via MCP appear in the UI through the same
  stream.
