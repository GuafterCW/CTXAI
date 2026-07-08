import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { providerCredentials } from "@/lib/db/schema";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { getProvider } from "@/lib/providers/registry";
import type { Credentials, ProviderContext } from "@/lib/providers/types";

/** Load and decrypt a user's credentials for a provider. */
export async function getProviderContext(
  userId: string,
  providerId: string,
): Promise<ProviderContext | null> {
  // The mock provider is keyless: every user implicitly has credentials.
  if (getProvider(providerId).credentialFields.length === 0) {
    return { credentials: {}, config: {} };
  }

  const row = await db.query.providerCredentials.findFirst({
    where: and(
      eq(providerCredentials.userId, userId),
      eq(providerCredentials.provider, providerId),
    ),
  });
  if (!row) return null;

  return {
    credentials: decryptJson<Credentials>(row.encryptedPayload),
    config: row.config ?? {},
  };
}

export async function upsertCredentials(
  userId: string,
  providerId: string,
  secrets: Credentials,
  config: Record<string, string>,
) {
  const encryptedPayload = encryptJson(secrets);
  const existing = await db.query.providerCredentials.findFirst({
    where: and(
      eq(providerCredentials.userId, userId),
      eq(providerCredentials.provider, providerId),
    ),
  });

  if (existing) {
    await db
      .update(providerCredentials)
      .set({ encryptedPayload, config, updatedAt: new Date() })
      .where(eq(providerCredentials.id, existing.id));
  } else {
    await db.insert(providerCredentials).values({
      id: nanoid(),
      userId,
      provider: providerId,
      encryptedPayload,
      config,
    });
  }
}

export async function deleteCredentials(userId: string, providerId: string) {
  await db
    .delete(providerCredentials)
    .where(
      and(
        eq(providerCredentials.userId, userId),
        eq(providerCredentials.provider, providerId),
      ),
    );
}

/** Which providers the user has configured (no secrets included). */
export async function credentialStatus(userId: string) {
  const rows = await db.query.providerCredentials.findMany({
    where: eq(providerCredentials.userId, userId),
    columns: { provider: true, config: true, updatedAt: true },
  });
  return new Map(rows.map((r) => [r.provider, r]));
}
