import { z } from "zod";

const videoSpecSchema = z.object({
  aspect: z.literal("16:9"),
  resolution: z.literal("1920x1080"),
  durationSecMin: z.number().int().positive(),
  durationSecMax: z.number().int().positive(),
});

export const createJobInputSchema = z.object({
  localFiles: z.array(z.string()),
  articleUrls: z.array(z.string().url()),
  providerId: z.string().min(1),
  model: z.string().min(1),
  voiceId: z.string().min(1).optional(),
  videoSpec: videoSpecSchema.optional(),
});

export const jobByIdInputSchema = z.object({
  jobId: z.string().min(1),
});
