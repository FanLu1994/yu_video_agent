import { os } from "@orpc/server";
import { services } from "@/services/container";
import { createVoiceCloneInputSchema, voiceByIdInputSchema } from "./schemas";

export const createVoiceClone = os
  .input(createVoiceCloneInputSchema)
  .handler(async ({ input }) => {
    return services.voiceCloneService.createVoiceClone(input);
  });

export const listVoices = os.handler(async () => {
  return services.voiceCloneService.listVoices();
});

export const getVoice = os
  .input(voiceByIdInputSchema)
  .handler(async ({ input }) => {
    return services.voiceCloneService.getVoice(input.voiceId);
  });
