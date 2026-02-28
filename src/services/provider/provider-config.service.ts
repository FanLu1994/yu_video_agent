import type {
  ProviderConfig,
  SaveProviderConfigInput,
} from "@/domain/provider/types";
import { JsonFileStore } from "@/services/storage/json-file-store";
import { SecretVault } from "../security/secret-vault";

interface ProvidersDb {
  providers: ProviderConfig[];
}

const PROVIDER_SCOPE = "provider";

const DEFAULT_MINIMAX_PROVIDER: ProviderConfig = {
  id: "minimax",
  kind: "minimax",
  displayName: "MiniMax",
  baseUrl: "https://api.minimaxi.com",
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

    return {
      ok: true,
      message: `Provider '${providerId}' configuration is valid.`,
    };
  }
}
