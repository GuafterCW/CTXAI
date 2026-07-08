import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { apiKeys, user } from "@/lib/db/schema";

/** Platform API keys (`ctx_…`) authenticate MCP and REST clients. */

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export async function createApiKey(userId: string, name: string) {
  const secret = `ctx_${randomBytes(24).toString("base64url")}`;
  const [row] = await db
    .insert(apiKeys)
    .values({
      id: nanoid(),
      userId,
      name,
      keyHash: sha256(secret),
      keyPrefix: secret.slice(0, 12),
    })
    .returning();
  // The full key is returned exactly once.
  return { key: secret, row };
}

export async function listApiKeys(userId: string) {
  return db.query.apiKeys.findMany({
    where: eq(apiKeys.userId, userId),
    orderBy: [desc(apiKeys.createdAt)],
    columns: { id: true, name: true, keyPrefix: true, lastUsedAt: true, createdAt: true },
  });
}

export async function deleteApiKey(userId: string, keyId: string) {
  await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)));
}

/** Resolve a bearer token to its owning user, or null. */
export async function resolveApiKeyUser(token: string) {
  if (!token.startsWith("ctx_")) return null;
  const row = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.keyHash, sha256(token)),
  });
  if (!row) return null;

  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.id))
    .run();

  const owner = await db.query.user.findFirst({ where: eq(user.id, row.userId) });
  return owner ?? null;
}
