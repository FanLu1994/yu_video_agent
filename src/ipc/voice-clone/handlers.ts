import { os } from "@orpc/server";
import { services } from "@/services/container";
import { runLoggedIpcHandler } from "../logging";
import {
  createVoiceCloneInputSchema,
  synthesizePreviewVoiceInputSchema,
  voiceByIdInputSchema,
} from "./schemas";

export const createVoiceClone = os
  .input(createVoiceCloneInputSchema)
  .handler(({ input }) => {
    return runLoggedIpcHandler("voiceClone.createVoiceClone", input, () => {
      return services.voiceCloneService.createVoiceClone(input);
    });
  });

export const listVoices = os.handler(() => {
  return runLoggedIpcHandler("voiceClone.listVoices", undefined, () => {
    return services.voiceCloneService.listVoices();
  });
});

export const getVoice = os.input(voiceByIdInputSchema).handler(({ input }) => {
  return runLoggedIpcHandler("voiceClone.getVoice", input, () => {
    if (input.displayName) {
      return services.voiceCloneService.updateVoiceDisplayName(
        input.voiceId,
        input.displayName
      );
    }

    return services.voiceCloneService.getVoice(input.voiceId);
  });
});

export const synthesizePreviewVoice = os
  .input(synthesizePreviewVoiceInputSchema)
  .handler(({ input }) => {
    return runLoggedIpcHandler(
      "voiceClone.synthesizePreviewVoice",
      input,
      () => {
        return services.voiceCloneService.synthesizePreviewVoice(
          input.voiceId,
          input.text
        );
      }
    );
  });

export const getCachedPreviewVoice = os
  .input(voiceByIdInputSchema)
  .handler(({ input }) => {
    return runLoggedIpcHandler(
      "voiceClone.getCachedPreviewVoice",
      input,
      () => {
        return services.voiceCloneService.getCachedPreviewVoice(input.voiceId);
      }
    );
  });
