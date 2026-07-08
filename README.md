# CTXAI — your keys, your studio

Self-hosted, open-source AI generation studio. Bring your own API keys for
**Kling** (video), **Seedream** (images) and **ElevenLabs** (voiceover), and pay
providers directly instead of a subscription markup. Includes a built-in
**MCP server** so Claude and Claude Code can generate right through your
instance — and a **montage pipeline** that turns generations into
publish-ready YouTube Shorts, Reels or long-form videos with narration,
word-level captions and music.

> Working title "CTXAI"

## Features

- **Bring your own keys** — credentials are AES-256-GCM encrypted at rest and
  only ever used to call the providers from your own server.
- **Cinematic studio UI** — animated generation cards (shimmer while queued,
  progress ring while running, blur-to-sharp reveal on finish), live updates
  over SSE, gallery with filters.
- **Direct provider APIs** — no aggregator in between:
  - Kling text-to-video & image-to-video (JWT auth, region-configurable)
  - Seedream 4.0–5.0 via BytePlus ModelArk (synchronous image generation)
  - ElevenLabs TTS with character-level timestamps
  - A keyless **demo provider** so you can try everything without spending a cent
- **MCP for Claude / Claude Code** — Streamable HTTP endpoint plus an npx stdio
  proxy. Tools: `list_models`, `generate_video`, `generate_image`,
  `generate_voiceover`, `get_job_status`, `wait_for_job`, `list_generations`,
  `compose_video`.
- **CLI** — `npx @ctxai/cli` to generate, watch jobs, download assets and
  render montages from the terminal (great for scripts and cron).
- **Montage** — order your generations into scenes, add narration per scene
  (drives timing + burned-in TikTok-style captions), lay music underneath and
  render 9:16 / 16:9 / 1:1 MP4s with FFmpeg. Fully drivable by agents via MCP.
- **Multi-user** — email/password auth (Better Auth), per-user keys, jobs and
  assets. SQLite + Drizzle, zero external services.

## Quickstart

### Docker (recommended)

```bash
git clone https://github.com/GuafterCW/ctxai && cd ctxai
cat > .env <<EOF
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
EOF
docker compose up -d
```

Open http://localhost:3000, create an account, add keys under **Settings**.

`docker compose up` uses the prebuilt multi-arch image
`ghcr.io/guaftercw/ctxai:latest` (published by CI on every release; `:master`
tracks the latest commit) and builds locally when it isn't available.

### From source

Requires Node.js ≥ 20 and pnpm (`corepack enable pnpm`). FFmpeg is bundled via
`ffmpeg-static`; a system FFmpeg is used when available.

```bash
pnpm install
cp .env.example apps/web/.env   # fill BETTER_AUTH_SECRET + ENCRYPTION_KEY
pnpm dev                        # http://localhost:3000
```

## Getting provider keys

| Provider | What for | Where |
| --- | --- | --- |
| Kling | text-to-video, image-to-video | [Kling console](https://kling.ai/dev/api-key) → “+ New API Key” (shown once; legacy Access/Secret key pairs still work but don’t cover new models) |
| Seedream | image generation | [BytePlus console](https://console.byteplus.com/ark/apiKey) → ModelArk → API Keys |
| ElevenLabs | voiceover + captions for montage | [elevenlabs.io](https://elevenlabs.io/app/settings/api-keys) |

Keys are verified with a cheap authenticated call before being saved.

## Connect Claude / Claude Code (MCP)

1. In CTXAI: **Settings → API keys → Create key** (starts with `ctx_`).
2. Connect:

```bash
# Claude Code (HTTP — recommended)
claude mcp add --transport http ctxai http://localhost:3000/api/mcp \
  --header "Authorization: Bearer ctx_…"

# Any stdio-only MCP client (e.g. Claude Desktop)
CTXAI_URL=http://localhost:3000 CTXAI_API_KEY=ctx_… npx @ctxai/mcp
```

3. Ask Claude to build something:

> "Generate three 5s Kling clips of a neon-lit city at night, then compose
> them into a 9:16 Short with an energetic narration about future cities."

Claude will call `generate_video` → `wait_for_job` → `compose_video` and hand
you a download link for the finished MP4.

## CLI

The same platform key also drives the terminal client:

```bash
npx @ctxai/cli login              # instance URL + ctx_… key, saved once
npx @ctxai/cli models             # what can I generate?
npx @ctxai/cli generate "a fox in the snow, cinematic" -m seedream-image
npx @ctxai/cli generate "animate this" -m kling-image-to-video -p image=@still.png
npx @ctxai/cli compose short.json -o renders/   # montage timeline → MP4
```

`generate` waits for the job (with live progress) and downloads the result;
use `--no-wait` + `ctxai job <id> --wait` for fire-and-forget. See
[`packages/cli`](packages/cli/README.md) for all commands.

## Montage pipeline

The **Montage** page (or the `compose_video` MCP tool) renders a timeline of
scenes into a platform-ready MP4:

1. Each scene references a generated clip or image; scenes with narration get
   ElevenLabs voiceover, and its timestamps drive **word-level captions**
   (burned in as ASS subtitles — styles: `bold`, `minimal`, `none`).
2. Images get a Ken-Burns push-in; clips are trimmed or last-frame-extended to
   match the narration.
3. Everything is normalized (1080×1920 / 1920×1080 / 1080×1080, 30 fps,
   H.264 + AAC, `+faststart`) and concatenated, with optional music mixed
   underneath.

## Architecture

```
apps/web                Next.js 15 monolith (UI + REST + SSE + MCP)
├─ src/lib/providers    provider adapters (kling/, seedream/, elevenlabs/, mock/)
├─ src/lib/jobs         job creation, in-process poller, SSE events
├─ src/lib/montage      timeline schema, captions (ASS), FFmpeg renderer
├─ src/lib/mcp          MCP tool definitions
└─ src/lib/db           Drizzle schema (SQLite), migrations run on boot
packages/mcp-stdio      @ctxai/mcp — stdio→HTTP MCP proxy (npx)
packages/cli            @ctxai/cli — terminal client for the REST API (npx)
```

- Jobs live in SQLite; a lightweight poller (no Redis) polls providers every
  3s, downloads finished assets to `data/assets/` (provider URLs expire) and
  pushes updates to the UI via Server-Sent Events.
- The MCP endpoint is a stateless Streamable-HTTP JSON-RPC server; platform
  API keys (`ctx_…`, SHA-256 hashed) also work against the whole REST API and
  asset downloads.

## Security notes

- Provider keys: AES-256-GCM, key from `ENCRYPTION_KEY` (32-byte hex).
- Platform API keys are stored hashed and shown exactly once.
- Everything (DB, assets) stays on your machine; there is no telemetry.

## Adding a provider

One folder + one registry line — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
