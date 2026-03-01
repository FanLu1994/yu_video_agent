import type { AgentSidebarConfig } from "@/domain/agent/types";
import { JsonFileStore } from "@/services/storage/json-file-store";

const DEFAULT_AGENT_CONFIG: AgentSidebarConfig = {
  prompts: {
    systemPrompt:
      "你是资深短视频编导与事实校对助手。请严格基于用户提供的文件与网页内容产出结果，避免编造。输出中文，表达清晰、口语化、适合配音。若信息不足，请保守表达并减少结论强度。",
    topicPrompt:
      "请基于输入资料生成 1 条视频标题：\n1) 长度 14-22 个中文字符\n2) 不使用夸张词、感叹号\n3) 尽量包含核心对象与动作\n4) 仅输出标题本身，不要任何解释或前后缀。",
    scriptPrompt:
      "请输出可直接用于 16:9 解说短视频的旁白脚本：\n1) 共 6 句，每句 18-32 字\n2) 结构：开场钩子 -> 背景事实 -> 关键拆解 -> 结论建议\n3) 每句独立成行，不加编号，不加 Markdown\n4) 只引用资料中可验证信息，避免绝对化措辞。",
  },
  runtimeConfig: {
    maxResearchSources: 6,
    temperature: 0.5,
    maxOutputTokens: 1400,
  },
  remotionConfig: {
    theme: "aurora",
    width: 1920,
    height: 1080,
    fps: 30,
    accentColor: "",
    backgroundStartColor: "",
    backgroundEndColor: "",
  },
  videoSpec: {
    aspect: "16:9",
    resolution: "1920x1080",
    durationSecMin: 45,
    durationSecMax: 90,
  },
};

interface AgentConfigDb {
  config: AgentSidebarConfig;
}

export class AgentConfigService {
  private readonly db = new JsonFileStore<AgentConfigDb>("agent-config.json", {
    config: DEFAULT_AGENT_CONFIG,
  });

  async getConfig(): Promise<AgentSidebarConfig> {
    const data = await this.db.read();
    return data.config;
  }

  async saveConfig(input: AgentSidebarConfig): Promise<AgentSidebarConfig> {
    await this.db.write({
      config: input,
    });
    return input;
  }
}
