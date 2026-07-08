import { requireSession } from "@/lib/session";
import { isDemoMode } from "@/lib/demo";
import { credentialStatus } from "@/lib/credentials";
import { listApiKeys } from "@/lib/api-keys";
import { listProviders } from "@/lib/providers/registry";
import { ProviderKeyCard } from "@/components/settings/provider-key-card";
import { ApiKeysSection } from "@/components/settings/api-keys-section";

export default async function SettingsPage() {
  const session = await requireSession();
  const [status, apiKeys] = await Promise.all([
    credentialStatus(session.user.id),
    listApiKeys(session.user.id),
  ]);

  const providers = listProviders()
    .filter((p) => p.credentialFields.length > 0)
    .map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      keyUrl: p.keyUrl,
      credentialFields: p.credentialFields,
      configFields: p.configFields ?? [],
      configured: status.has(p.id),
      config: status.get(p.id)?.config ?? {},
    }));

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="font-display text-2xl font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-ink-dim">
        Bring your own API keys. They are encrypted at rest and only used to
        call the providers on your behalf.
      </p>

      <section className="mt-8">
        <h2 className="mb-4 font-display text-lg font-medium">Provider keys</h2>
        {isDemoMode() ? (
          <p className="rounded-xl border border-line bg-surface p-4 text-sm text-ink-dim">
            This is a public demo — storing provider keys is disabled and only
            the built-in demo provider is available.{" "}
            <a
              href="https://github.com/GuafterCW/CTXAI"
              className="text-accent-bright underline underline-offset-2"
            >
              Self-host CTXAI
            </a>{" "}
            to plug in your own Kling, Seedream and ElevenLabs keys.
          </p>
        ) : (
          <div className="space-y-4">
            {providers.map((provider) => (
              <ProviderKeyCard key={provider.id} provider={provider} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-10" id="api-keys">
        <h2 className="mb-4 font-display text-lg font-medium">
          MCP &amp; API access
        </h2>
        <ApiKeysSection
          initialKeys={apiKeys.map((k) => ({
            ...k,
            createdAt: k.createdAt.toISOString(),
            lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
          }))}
        />
      </section>
    </div>
  );
}
