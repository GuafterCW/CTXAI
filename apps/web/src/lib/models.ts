import { zodToJsonSchema } from "zod-to-json-schema";
import { credentialStatus } from "@/lib/credentials";
import { listProviders } from "@/lib/providers/registry";
import type { JsonSchema, ModelDto } from "@/lib/client-types";

/** All models across providers, flagged with whether the user can use them. */
export async function listModelsForUser(userId: string): Promise<ModelDto[]> {
  const status = await credentialStatus(userId);
  return listProviders().flatMap((provider) =>
    provider.models.map((model) => ({
      id: model.id,
      providerId: provider.id,
      providerName: provider.name,
      name: model.name,
      kind: model.kind,
      description: model.description,
      costHint: model.costHint,
      paramsSchema: zodToJsonSchema(model.inputSchema) as JsonSchema,
      configured:
        provider.credentialFields.length === 0 || status.has(provider.id),
    })),
  );
}
