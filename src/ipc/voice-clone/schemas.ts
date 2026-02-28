import { z } from "zod";

export const createVoiceCloneInputSchema = z.object({
  providerId: z.string().min(1),
  voiceId: z.string().min(1),
  cloneAudioPath: z.string().min(1),
  promptAudioPath: z.string().min(1).optional(),
  promptText: z.string().optional(),
  sampleText: z.string().min(1),
  model: z.string().min(1),
});

export const voiceByIdInputSchema = z.object({
  voiceId: z.string().min(1),
});
