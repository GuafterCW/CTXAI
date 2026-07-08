import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handling, requireApiUser } from "@/lib/api";
import {
  deleteCredentials,
  getProviderContext,
  upsertCredentials,
} from "@/lib/credentials";
import { getProvider } from "@/lib/providers/registry";
import { ProviderError } from "@/lib/providers/types";

const putSchema = z.object({
  secrets: z.record(z.string(), z.string()),
  config: z.record(z.string(), z.string()).default({}),
});

type Params = { params: Promise<{ provider: string }> };

/** Save (and validate) credentials for a provider. */
export async function PUT(req: NextRequest, { params }: Params) {
  return handling(async () => {
    const user = await requireApiUser();
    const { provider: providerId } = await params;
    const provider = getProvider(providerId);
    const body = putSchema.parse(await req.json());

    // Allow updating only the config while keeping stored secrets.
    const existing = await getProviderContext(user.id, providerId);
    const secrets: Record<string, string> = {
      ...(existing?.credentials ?? {}),
    };
    for (const [key, value] of Object.entries(body.secrets)) {
      if (value.trim()) secrets[key] = value.trim();
    }

    const missing = provider.credentialFields.filter((f) => !secrets[f.key]);
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing: ${missing.map((f) => f.label).join(", ")}` },
        { status: 400 },
      );
    }

    try {
      await provider.validateCredentials({
        credentials: secrets,
        config: body.config,
      });
    } catch (err) {
      const message =
        err instanceof ProviderError ? err.message : "Validation failed";
      return NextResponse.json({ error: message }, { status: 422 });
    }

    await upsertCredentials(user.id, providerId, secrets, body.config);
    return NextResponse.json({ ok: true });
  });
}

/** Re-validate stored credentials. */
export async function POST(_req: NextRequest, { params }: Params) {
  return handling(async () => {
    const user = await requireApiUser();
    const { provider: providerId } = await params;
    const provider = getProvider(providerId);

    const ctx = await getProviderContext(user.id, providerId);
    if (!ctx) {
      return NextResponse.json(
        { error: "No credentials stored" },
        { status: 404 },
      );
    }

    try {
      await provider.validateCredentials(ctx);
      return NextResponse.json({ ok: true });
    } catch (err) {
      const message =
        err instanceof ProviderError ? err.message : "Validation failed";
      return NextResponse.json({ error: message }, { status: 422 });
    }
  });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  return handling(async () => {
    const user = await requireApiUser();
    const { provider: providerId } = await params;
    await deleteCredentials(user.id, providerId);
    return NextResponse.json({ ok: true });
  });
}
