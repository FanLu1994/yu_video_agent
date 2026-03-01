import z from "zod";

export const openExternalLinkInputSchema = z.object({
  url: z.url(),
});

export const pickAudioFileInputSchema = z.object({
  title: z.string().min(1).optional(),
});
