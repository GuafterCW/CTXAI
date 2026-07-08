import type { ModelDescriptor, Provider } from "./types";
import { klingProvider } from "./kling";
import { seedreamProvider } from "./seedream";
import { elevenLabsProvider } from "./elevenlabs";
import { mockProvider } from "./mock";

const providers = new Map<string, Provider>();

function register(provider: Provider) {
  providers.set(provider.id, provider);
}

// Demo mode (see lib/demo.ts): only the keyless demo provider is registered,
// so a public showcase instance can never store visitors' real API keys.
// Everything downstream (settings UI, job creation, MCP tools) follows this.
const demoMode =
  process.env.DEMO_MODE === "1" || process.env.DEMO_MODE === "true";

if (!demoMode) {
  register(klingProvider);
  register(seedreamProvider);
  register(elevenLabsProvider);
}
// The mock provider needs no keys — useful for demos, UI work and tests.
if (demoMode || process.env.ENABLE_MOCK_PROVIDER !== "false") {
  register(mockProvider);
}

export function getProvider(id: string): Provider {
  const provider = providers.get(id);
  if (!provider) throw new Error(`Unknown provider: ${id}`);
  return provider;
}

export function listProviders(): Provider[] {
  return [...providers.values()];
}

export function findModel(
  providerId: string,
  modelId: string,
): { provider: Provider; model: ModelDescriptor } {
  const provider = getProvider(providerId);
  const model = provider.models.find((m) => m.id === modelId);
  if (!model) {
    throw new Error(`Unknown model ${modelId} for provider ${providerId}`);
  }
  return { provider, model };
}
