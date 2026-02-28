import type { Api, Model } from "@mariozechner/pi-ai";
import type { ProviderConfig, ProviderKind } from "@/domain/provider/types";

function mapProviderKindToApi(kind: ProviderKind): Api {
  switch (kind) {
    case "anthropic":
      return "anthropic-messages";
    case "google":
      return "google-generative-ai";
    case "openai-compatible":
    case "domestic-compatible":
    case "minimax":
    default:
      return "openai-completions";
  }
}

function normalizeModelBaseUrl(provider: ProviderConfig): string {
  const base = provider.baseUrl?.trim();
  if (!base) {
    return "https://api.openai.com/v1";
  }

  if (provider.kind === "openai-compatible" || provider.kind === "domestic-compatible") {
    return base;
  }

  if (provider.kind === "minimax") {
    if (base.endsWith("/v1")) {
      return base;
    }
    return `${base.replace(/\/+$/, "")}/v1`;
  }

  return base;
}

export function buildPiModel(provider: ProviderConfig): Model<Api> {
  return {
    id: provider.model,
    name: provider.displayName,
    api: mapProviderKindToApi(provider.kind),
    provider: provider.id,
    baseUrl: normalizeModelBaseUrl(provider),
    reasoning: true,
    input: ["text"],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 128_000,
    maxTokens: 8_192,
  };
}
