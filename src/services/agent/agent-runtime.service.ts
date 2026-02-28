import type { Stage } from "@/domain/agent/types";

const DEFAULT_STAGES: Stage[] = [
  "ingest",
  "topic",
  "research",
  "script",
  "voice_clone",
  "compose",
  "render",
  "package",
];

export interface RuntimeStageUpdate {
  stage: Stage;
  progress: number;
  currentTool: string;
}

export class AgentRuntimeService {
  private initialized = false;
  private piAgentCoreLoaded = false;
  private piAiLoaded = false;

  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      await import("@mariozechner/pi-agent-core");
      this.piAgentCoreLoaded = true;
    } catch {
      this.piAgentCoreLoaded = false;
    }

    try {
      await import("@mariozechner/pi-ai");
      this.piAiLoaded = true;
    } catch {
      this.piAiLoaded = false;
    }

    this.initialized = true;
  }

  getStatus() {
    return {
      initialized: this.initialized,
      piAgentCoreLoaded: this.piAgentCoreLoaded,
      piAiLoaded: this.piAiLoaded,
    };
  }

  async runPipeline(onStageUpdate: (update: RuntimeStageUpdate) => Promise<void>) {
    await this.initialize();

    const total = DEFAULT_STAGES.length;
    for (let index = 0; index < total; index += 1) {
      const stage = DEFAULT_STAGES[index];
      await onStageUpdate({
        stage,
        progress: Math.round(((index + 1) / total) * 100),
        currentTool: `${stage}Tool`,
      });
    }
  }
}
