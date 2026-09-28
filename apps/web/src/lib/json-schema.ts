import { z } from "zod";

/**
 * JSON schema for a zod schema, as consumed by the studio params UI and MCP
 * tool definitions. `io: "input"` keeps fields with defaults optional (they
 * describe what callers may send, not what parsing produces); draft-07 keeps
 * the dialect the schemas have always been published in.
 */
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, {
    target: "draft-7",
    io: "input",
    // In input mode zod omits `additionalProperties` for (stripping) objects.
    // Keep advertising closed objects so MCP clients don't invent params.
    override: ({ zodSchema, jsonSchema }) => {
      if (
        zodSchema._zod.def.type === "object" &&
        jsonSchema.additionalProperties === undefined
      ) {
        jsonSchema.additionalProperties = false;
      }
    },
  });
}
