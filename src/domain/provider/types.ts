export type ProviderKind =
  | "openai-compatible"
  | "anthropic"
  | "google"
  | "domestic-compatible"
  | "minimax";

export interface ProviderRetryPolicy {
  backoffMs: number;
  maxAttempts: number;
}

export interface ProviderConfig {
  baseUrl?: string;
  createdAt: string;
  displayName: string;
  enabled: boolean;
  id: string;
  kind: ProviderKind;
  model: string;
  retry?: ProviderRetryPolicy;
  timeoutMs?: number;
  updatedAt: string;
}

export interface SaveProviderConfigInput {
  apiKey?: string;
  baseUrl?: string;
  displayName: string;
  enabled: boolean;
  id: string;
  kind: ProviderKind;
  model: string;
  retry?: ProviderRetryPolicy;
  timeoutMs?: number;
}
