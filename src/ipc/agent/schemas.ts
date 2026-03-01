import { z } from "zod";

const videoSpecSchema = z.object({
  aspect: z.literal("16:9"),
  resolution: z.literal("1920x1080"),
  durationSecMin: z.number().int().positive(),
  durationSecMax: z.number().int().positive(),
});

const promptConfigSchema = z.object({
  systemPrompt: z.string().min(1).max(20_000).optional(),
  topicPrompt: z.string().min(1).max(20_000).optional(),
  scriptPrompt: z.string().min(1).max(20_000).optional(),
});

const runtimeConfigSchema = z.object({
  maxResearchSources: z.number().int().min(1).max(20).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxOutputTokens: z.number().int().min(64).max(32_768).optional(),
});

const remotionConfigSchema = z.object({
  width: z.number().int().min(640).max(4096).optional(),
  height: z.number().int().min(360).max(4096).optional(),
  fps: z.number().int().min(12).max(60).optional(),
  theme: z.enum(["aurora", "sunset", "ocean"]).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  backgroundStartColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  backgroundEndColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export const createJobInputSchema = z.object({
  localFiles: z.array(z.string()),
  articleUrls: z.array(z.string().url()),
  providerId: z.string().min(1),
  model: z.string().min(1),
  voiceProviderId: z.string().min(1).optional(),
  voiceModel: z.string().min(1).optional(),
  voiceId: z.string().min(1).optional(),
  videoSpec: videoSpecSchema.optional(),
  prompts: promptConfigSchema.optional(),
  runtimeConfig: runtimeConfigSchema.optional(),
  remotionConfig: remotionConfigSchema.optional(),
});

export const jobByIdInputSchema = z.object({
  jobId: z.string().min(1),
});
