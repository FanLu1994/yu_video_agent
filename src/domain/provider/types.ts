export type ProviderKind =
  | "openai-compatible"
  | "anthropic"
  | "google"
  | "domestic-compatible"
  | "minimax";

export interface ProviderRetryPolicy {
  maxAttempts: number;
  backoffMs: number;
}

export interface ProviderConfig {
  id: string;
  kind: ProviderKind;
  displayName: string;
  baseUrl?: string;
  model: string;
  enabled: boolean;
  timeoutMs?: number;
  retry?: ProviderRetryPolicy;
  createdAt: string;
  updatedAt: string;
}

export interface SaveProviderConfigInput {
  id: string;
  kind: ProviderKind;
  displayName: string;
  baseUrl?: string;
  model: string;
  enabled: boolean;
  timeoutMs?: number;
  retry?: ProviderRetryPolicy;
  apiKey?: string;
}
