import { NextResponse } from "next/server";
import { zodToJsonSchema } from "zod-to-json-schema";
import { handling, requireApiUser } from "@/lib/api";
import { credentialStatus } from "@/lib/credentials";
import { listProviders } from "@/lib/providers/registry";

export async function GET() {
  return handling(async () => {
    const user = await requireApiUser();
    const status = await credentialStatus(user.id);

    return NextResponse.json({
      providers: listProviders().map((p) => {
        const row = status.get(p.id);
        return {
          id: p.id,
          name: p.name,
          description: p.description,
          keyUrl: p.keyUrl,
          credentialFields: p.credentialFields,
          configFields: p.configFields ?? [],
          models: p.models.map((m) => ({
            id: m.id,
            name: m.name,
            kind: m.kind,
            description: m.description,
            costHint: m.costHint,
            paramsSchema: zodToJsonSchema(m.inputSchema),
          })),
          configured: p.credentialFields.length === 0 || Boolean(row),
          config: row?.config ?? {},
          updatedAt: row?.updatedAt ?? null,
        };
      }),
    });
  });
}
