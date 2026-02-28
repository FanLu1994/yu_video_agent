import { completeSimple } from "@mariozechner/pi-ai";
import type {
  ProviderConfig,
  SaveProviderConfigInput,
} from "@/domain/provider/types";
import { JsonFileStore } from "@/services/storage/json-file-store";
import { buildPiModel } from "./pi-model";
import { SecretVault } from "../security/secret-vault";

interface ProvidersDb {
  providers: ProviderConfig[];
}

const PROVIDER_SCOPE = "provider";

const DEFAULT_MINIMAX_PROVIDER: ProviderConfig = {
  id: "minimax",
  kind: "minimax",
  displayName: "MiniMax",
  baseUrl: "https://api.minimaxi.com/v1",
  model: "speech-2.8-hd",
  enabled: true,
  timeoutMs: 30_000,
  retry: {
    maxAttempts: 2,
    backoffMs: 1_000,
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export class ProviderConfigService {
  private readonly db = new JsonFileStore<ProvidersDb>("providers.json", {
    providers: [DEFAULT_MINIMAX_PROVIDER],
  });

  constructor(private readonly vault: SecretVault) {}

  async listProviders(): Promise<ProviderConfig[]> {
    const data = await this.db.read();
    return data.providers;
  }

  async getProviderById(id: string): Promise<ProviderConfig | undefined> {
    const providers = await this.listProviders();
    return providers.find((provider) => provider.id === id);
  }

  async saveProviderConfig(input: SaveProviderConfigInput): Promise<ProviderConfig> {
    const now = new Date().toISOString();
    const data = await this.db.read();
    const existing = data.providers.find((provider) => provider.id === input.id);

    const config: ProviderConfig = {
      id: input.id,
      kind: input.kind,
      displayName: input.displayName,
      baseUrl: input.baseUrl,
      model: input.model,
      enabled: input.enabled,
      timeoutMs: input.timeoutMs,
      retry: input.retry,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const nextProviders = existing
      ? data.providers.map((provider) =>
          provider.id === input.id ? config : provider
        )
      : [...data.providers, config];

    await this.db.write({ providers: nextProviders });

    if (input.apiKey) {
      await this.vault.setSecret(PROVIDER_SCOPE, input.id, input.apiKey);
    }

    return config;
  }

  async deleteProviderConfig(id: string) {
    const data = await this.db.read();
    await this.db.write({
      providers: data.providers.filter((provider) => provider.id !== id),
    });
    await this.vault.deleteSecret(PROVIDER_SCOPE, id);
  }

  async getApiKey(providerId: string): Promise<string | undefined> {
    return this.vault.getSecret(PROVIDER_SCOPE, providerId);
  }

  async testProviderConnection(providerId: string) {
    const provider = await this.getProviderById(providerId);
    if (!provider) {
      return {
        ok: false,
        message: `Provider '${providerId}' not found.`,
      };
    }

    if (!provider.enabled) {
      return {
        ok: false,
        message: `Provider '${providerId}' is disabled.`,
      };
    }

    const apiKey = await this.getApiKey(providerId);
    if (!apiKey) {
      return {
        ok: false,
        message: `Provider '${providerId}' is missing apiKey.`,
      };
    }

    if (provider.kind === "minimax" && provider.model.startsWith("speech-")) {
      return {
        ok: true,
        message:
          `Provider '${providerId}' is configured for speech model '${provider.model}'. ` +
          "LLM probe is skipped; this provider can still be used for voice cloning.",
      };
    }

    try {
      const model = buildPiModel(provider);
      const response = await completeSimple(
        model,
        {
          messages: [
            {
              role: "user",
              content:
                "Health check. Reply with exactly one word: ready.",
              timestamp: Date.now(),
            },
          ],
        },
        {
          apiKey,
          maxTokens: 16,
          reasoning: "minimal",
        }
      );

      const firstText = response.content.find((item) => item.type === "text");
      const preview = firstText?.type === "text" ? firstText.text.slice(0, 80) : "";

      return {
        ok: response.stopReason !== "error" && response.stopReason !== "aborted",
        message: preview
          ? `Provider '${providerId}' reachable. Response: ${preview}`
          : `Provider '${providerId}' reachable.`,
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? `Provider '${providerId}' test failed: ${error.message}`
            : `Provider '${providerId}' test failed.`,
      };
    }
  }
}
