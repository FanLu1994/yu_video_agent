import { z } from "zod";

const providerRetrySchema = z.object({
  maxAttempts: z.number().int().nonnegative(),
  backoffMs: z.number().int().nonnegative(),
});

export const saveProviderConfigInputSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    "openai-compatible",
    "anthropic",
    "google",
    "domestic-compatible",
    "minimax",
  ]),
  displayName: z.string().min(1),
  baseUrl: z.string().url().optional(),
  model: z.string().min(1),
  enabled: z.boolean(),
  timeoutMs: z.number().int().positive().optional(),
  retry: providerRetrySchema.optional(),
  apiKey: z.string().min(1).optional(),
});

export const providerByIdInputSchema = z.object({
  providerId: z.string().min(1),
});

export const deleteProviderInputSchema = z.object({
  providerId: z.string().min(1),
});
