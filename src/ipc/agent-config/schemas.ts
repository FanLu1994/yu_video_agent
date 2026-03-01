import { z } from "zod";

const promptSchema = z.object({
  systemPrompt: z.string(),
  topicPrompt: z.string(),
  scriptPrompt: z.string(),
});

const runtimeConfigSchema = z.object({
  maxResearchSources: z.number().int().min(1).max(20),
  temperature: z.number().min(0).max(2),
  maxOutputTokens: z.number().int().min(64).max(32_768),
});

const remotionConfigSchema = z.object({
  theme: z.enum(["aurora", "sunset", "ocean"]),
  width: z.number().int().min(640).max(4096),
  height: z.number().int().min(360).max(4096),
  fps: z.number().int().min(12).max(60),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).or(z.literal("")).optional(),
  backgroundStartColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .or(z.literal(""))
    .optional(),
  backgroundEndColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .or(z.literal(""))
    .optional(),
});

const videoSpecSchema = z.object({
  aspect: z.literal("16:9"),
  resolution: z.literal("1920x1080"),
  durationSecMin: z.number().int().positive(),
  durationSecMax: z.number().int().positive(),
});

export const saveAgentConfigInputSchema = z.object({
  prompts: promptSchema,
  runtimeConfig: runtimeConfigSchema,
  remotionConfig: remotionConfigSchema,
  videoSpec: videoSpecSchema,
});
