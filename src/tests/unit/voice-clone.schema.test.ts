import { describe, expect, it } from "vitest";
import {
  createVoiceCloneInputSchema,
  voiceByIdInputSchema,
} from "@/ipc/voice-clone/schemas";

const baseInput = {
  providerId: "minimax",
  voiceId: "voice_001",
  cloneAudioPath: "C:\\tmp\\clone.wav",
  sampleText: "hello",
  model: "speech-2.8-hd",
};

describe("createVoiceCloneInputSchema", () => {
  it("accepts base input without prompt fields", () => {
    const result = createVoiceCloneInputSchema.safeParse(baseInput);
    expect(result.success).toBe(true);
  });

  it("rejects prompt audio without prompt text", () => {
    const result = createVoiceCloneInputSchema.safeParse({
      ...baseInput,
      promptAudioPath: "C:\\tmp\\prompt.wav",
    });
    expect(result.success).toBe(false);
  });

  it("rejects prompt text without prompt audio", () => {
    const result = createVoiceCloneInputSchema.safeParse({
      ...baseInput,
      promptText: "prompt",
    });
    expect(result.success).toBe(false);
  });
});

describe("voiceByIdInputSchema", () => {
  it("accepts optional displayName for rename", () => {
    const result = voiceByIdInputSchema.safeParse({
      voiceId: "voice_001",
      displayName: "中文音色-A",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty displayName", () => {
    const result = voiceByIdInputSchema.safeParse({
      voiceId: "voice_001",
      displayName: "   ",
    });
    expect(result.success).toBe(false);
  });
});
