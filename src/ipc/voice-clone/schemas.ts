import { z } from "zod";

export const createVoiceCloneInputSchema = z
  .object({
    providerId: z.string().trim().min(1),
    voiceId: z.string().trim().min(1),
    cloneAudioPath: z.string().trim().min(1),
    promptAudioPath: z.string().trim().min(1).optional(),
    promptText: z.string().trim().min(1).optional(),
    sampleText: z.string().trim().min(1),
    model: z.string().trim().min(1),
  })
  .superRefine((value, ctx) => {
    const hasPromptAudio = Boolean(value.promptAudioPath);
    const hasPromptText = Boolean(value.promptText);

    if (hasPromptAudio !== hasPromptText) {
      ctx.addIssue({
        code: "custom",
        message: "promptAudioPath and promptText must be provided together.",
        path: hasPromptAudio ? ["promptText"] : ["promptAudioPath"],
      });
    }
  });

export const voiceByIdInputSchema = z.object({
  voiceId: z.string().trim().min(1),
  displayName: z.string().trim().min(1).max(64).optional(),
});

export const synthesizePreviewVoiceInputSchema = z.object({
  voiceId: z.string().trim().min(1),
  text: z.string().trim().min(1),
});
