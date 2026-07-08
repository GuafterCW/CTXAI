# Contributing

Thanks for helping build CTXAI! The most valuable contribution is a new
**provider adapter** — that's how the platform grows beyond Kling and
Seedream.

## Dev setup

```bash
corepack enable pnpm
pnpm install
cp .env.example apps/web/.env   # set BETTER_AUTH_SECRET + ENCRYPTION_KEY
pnpm dev
```

Checks that must pass before a PR: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

## Adding a provider adapter

1. Create `apps/web/src/lib/providers/<your-provider>/index.ts` and implement
   the `Provider` interface from `../types`:

   ```ts
   export const myProvider: Provider = {
     id: "my-provider",
     name: "My Provider",
     description: "…",
     keyUrl: "https://…",            // where users create API keys
     credentialFields: [{ key: "apiKey", label: "API Key", secret: true }],
     models: [{
       id: "my-model",
       name: "My Provider · Video",
       kind: "video",                 // "video" | "image" | "audio"
       description: "…",
       inputSchema: z.object({        // drives the studio UI AND MCP schemas
         prompt: z.string().min(1).describe("…"),
         // enums render as pills, bounded numbers as sliders, booleans as toggles
       }),
     }],
     async validateCredentials(ctx) { /* cheap authenticated call, throw on 401 */ },
     async createJob(ctx, modelId, input) {
       // poll-based APIs: return { providerJobId }
       // synchronous APIs: return { providerJobId: "sync:…", immediate: { status: "succeeded", assets: [...] } }
     },
     async pollJob(ctx, providerJobId) {
       // map provider status → { status, progress?, assets?, error? }
     },
   };
   ```

2. Register it in `apps/web/src/lib/providers/registry.ts`.
3. Map errors through `ProviderError` (`retryable: true` for rate limits and
   5xx — the poller will retry those instead of failing the job).
4. Assets: return either a downloadable `url` or an inline `data` Buffer with
   a correct `mime` — the job system stores them locally.
5. Add a unit test next to the adapter (see `kling/kling.test.ts`) that covers
   auth/signing and status mapping with mocked HTTP.

That's it — the studio UI, gallery, SSE updates and MCP tools pick the new
models up automatically from the registry.

## Code style

- TypeScript strict; no `any` unless interfacing with untyped JSON.
- Comments only where the code can't speak for itself (constraints, formats).
- UI follows the existing token system in `globals.css` — no ad-hoc colors.

## Reporting issues

Please include: what you did, what happened, server logs (`pnpm dev` output),
and your platform. Never paste API keys.
