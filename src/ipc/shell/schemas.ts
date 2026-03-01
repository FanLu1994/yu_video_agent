import z from "zod";

export const openExternalLinkInputSchema = z.object({
  url: z.url(),
});

export const pickAudioFileInputSchema = z.object({
  title: z.string().min(1).optional(),
});

export const pickLocalFilesInputSchema = z.object({
  title: z.string().min(1).optional(),
});

export const saveRecordedAudioInputSchema = z.object({
  base64Audio: z.string().trim().min(1),
  extension: z.enum(["wav", "mp3", "m4a"]).optional(),
  fileNamePrefix: z.string().trim().min(1).max(64).optional(),
});
