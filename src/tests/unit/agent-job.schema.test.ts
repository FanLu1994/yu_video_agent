import { describe, expect, it } from "vitest";
import { createJobInputSchema } from "@/ipc/agent/schemas";

const BASE_INPUT = {
  localFiles: ["D:\\docs\\input.md"],
  articleUrls: ["https://example.com/article"],
  providerId: "openai-main",
  model: "gpt-4o-mini",
};

describe("createJobInputSchema", () => {
  it("accepts prompts and remotion config", () => {
    const parsed = createJobInputSchema.parse({
      ...BASE_INPUT,
      prompts: {
        systemPrompt: "你是编导",
        topicPrompt: "提炼标题",
        scriptPrompt: "生成脚本",
      },
      runtimeConfig: {
        maxResearchSources: 6,
        temperature: 0.4,
        maxOutputTokens: 1800,
      },
      remotionConfig: {
        theme: "aurora",
        width: 1920,
        height: 1080,
        fps: 30,
        accentColor: "#38bdf8",
        backgroundStartColor: "#0f172a",
        backgroundEndColor: "#1e293b",
      },
    });

    expect(parsed.remotionConfig?.theme).toBe("aurora");
    expect(parsed.prompts?.scriptPrompt).toBe("生成脚本");
  });

  it("rejects invalid hex color", () => {
    expect(() =>
      createJobInputSchema.parse({
        ...BASE_INPUT,
        remotionConfig: {
          accentColor: "blue",
        },
      })
    ).toThrow();
  });
});
