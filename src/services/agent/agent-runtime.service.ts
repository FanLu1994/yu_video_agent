import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AgentRemotionConfig,
  JobArtifacts,
  JobWarning,
  RunAgentJobRequest,
  Stage,
} from "@/domain/agent/types";
import type { AgentCompositionInput } from "@/remotion/Root";
import { buildPiModel } from "@/services/provider/pi-model";
import type { ProviderConfigService } from "@/services/provider/provider-config.service";
import { getDataRootPath } from "@/services/storage/runtime-paths";
import type { VoiceCloneService } from "../voice/voice-clone.service";
import type { RemotionRenderService } from "../remotion/remotion-render.service";

export interface RuntimeStageUpdate {
  currentTool: string;
  progress: number;
  stage: Stage;
}

export interface RuntimePipelineInput {
  jobId: string;
  onStageUpdate: (update: RuntimeStageUpdate) => Promise<void>;
  request: RunAgentJobRequest;
}

export interface RuntimePipelineResult {
  artifacts: JobArtifacts;
  audioPath?: string;
  warnings: JobWarning[];
}

interface IngestedSource {
  contentPreview: string;
  source: string;
  type: "file" | "url";
}

const DEFAULT_SYSTEM_PROMPT =
  "你是资深短视频编导与事实校对助手。请严格基于输入资料生成中文内容，避免编造，语言口语化且适合配音。";
const DEFAULT_TOPIC_PROMPT =
  "请输出 1 条 14-22 字的视频标题，仅输出标题本身，不要解释。";
const DEFAULT_SCRIPT_PROMPT =
  "请输出 6 句旁白脚本，每句独立成行，保持逻辑连贯，不加编号和 Markdown。";

const THEME_COLOR_MAP: Record<
  NonNullable<AgentRemotionConfig["theme"]>,
  {
    accentColor: string;
    backgroundEndColor: string;
    backgroundStartColor: string;
  }
> = {
  aurora: {
    accentColor: "#38bdf8",
    backgroundStartColor: "#0f172a",
    backgroundEndColor: "#1e293b",
  },
  sunset: {
    accentColor: "#fb7185",
    backgroundStartColor: "#3f1d2e",
    backgroundEndColor: "#7c2d12",
  },
  ocean: {
    accentColor: "#34d399",
    backgroundStartColor: "#042f2e",
    backgroundEndColor: "#083344",
  },
};

export class AgentRuntimeService {
  private initialized = false;
  private piAgentCoreLoaded = false;
  private piAiLoaded = false;

  constructor(
    private readonly providers: ProviderConfigService,
    private readonly remotionRenderer: RemotionRenderService,
    private readonly voiceCloneService: VoiceCloneService
  ) {}

  private getOutputDir(jobId: string) {
    return path.join(getDataRootPath(), "output", jobId);
  }

  private normalizeWhitespace(value: string) {
    return value.replace(/\s+/g, " ").trim();
  }

  private stripHtml(value: string) {
    return value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  private async appendPipelineLog(logPath: string, line: string) {
    await mkdir(path.dirname(logPath), { recursive: true });
    await writeFile(logPath, `[${new Date().toISOString()}] ${line}\n`, {
      encoding: "utf-8",
      flag: "a",
    });
  }

  private splitIntoScriptLines(scriptText: string) {
    const normalized = scriptText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" ");

    const lines = normalized
      .split(/[。！？!?；;]+/g)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 8);

    if (lines.length > 0) {
      return lines;
    }

    return ["基于输入资料生成脚本失败，已退回默认文案。"];
  }

  private buildFallbackTopic(request: RunAgentJobRequest) {
    const base = request.localFiles[0] || request.articleUrls[0] || "输入资料";
    const sanitized = base.replace(/\\/g, "/").split("/").at(-1) || "主题";
    return `基于${sanitized}的视频解读`;
  }

  private buildFallbackScript(topic: string, sources: IngestedSource[]) {
    const sourceTips = sources.slice(0, 3).map((item, index) => {
      return `${index + 1}. ${item.type === "file" ? "文件" : "网页"}：${item.source}`;
    });

    return [
      `本期视频围绕「${topic}」展开。`,
      "我们先快速梳理背景与核心问题。",
      "随后对关键信息进行结构化拆解。",
      "最后给出可执行的总结与下一步建议。",
      ...(sourceTips.length > 0 ? [`参考来源：${sourceTips.join("；")}`] : []),
    ].join("\n");
  }

  private resolveRemotionPalette(config: AgentRemotionConfig | undefined) {
    const theme = config?.theme ?? "aurora";
    const preset = THEME_COLOR_MAP[theme];

    return {
      accentColor: config?.accentColor ?? preset.accentColor,
      backgroundStartColor:
        config?.backgroundStartColor ?? preset.backgroundStartColor,
      backgroundEndColor:
        config?.backgroundEndColor ?? preset.backgroundEndColor,
    };
  }

  private resolveTargetDurationSec(
    request: RunAgentJobRequest,
    lineCount: number
  ) {
    const explicit = request.videoSpec
      ? Math.round(
          (request.videoSpec.durationSecMin +
            request.videoSpec.durationSecMax) /
            2
        )
      : undefined;
    const byLines = Math.max(12, lineCount * 4);
    return explicit ?? byLines;
  }

  private createTimeline(lines: string[]) {
    const secPerLine = 3.2;
    return lines.map((line, index) => {
      const startSec = Number((index * secPerLine).toFixed(2));
      const endSec = Number(((index + 1) * secPerLine).toFixed(2));
      return {
        line,
        index,
        startSec,
        endSec,
      };
    });
  }

  private async ingestSources(
    request: RunAgentJobRequest,
    maxSources: number,
    pipelineLogPath: string
  ) {
    const limit = Math.max(1, Math.min(20, maxSources));
    const sources: IngestedSource[] = [];

    for (const filePath of request.localFiles.slice(0, limit)) {
      try {
        const raw = await readFile(filePath, "utf-8");
        const cleaned = this.normalizeWhitespace(raw).slice(0, 5000);
        if (!cleaned) {
          continue;
        }
        sources.push({
          type: "file",
          source: filePath,
          contentPreview: cleaned,
        });
      } catch (error) {
        await this.appendPipelineLog(
          pipelineLogPath,
          `ingest.file.skip path=${filePath} reason=${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    const remaining = Math.max(0, limit - sources.length);
    for (const url of request.articleUrls.slice(0, remaining)) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10_000);
        const response = await fetch(url, {
          signal: controller.signal,
        }).finally(() => clearTimeout(timer));
        const html = await response.text();
        const text = this.stripHtml(html).slice(0, 5000);
        if (!text) {
          continue;
        }
        sources.push({
          type: "url",
          source: url,
          contentPreview: text,
        });
      } catch (error) {
        await this.appendPipelineLog(
          pipelineLogPath,
          `ingest.url.skip url=${url} reason=${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    return sources;
  }

  private async callLlm(
    request: RunAgentJobRequest,
    systemPrompt: string,
    userPrompt: string
  ): Promise<string | undefined> {
    const provider = await this.providers.getProviderById(request.providerId);
    if (!(provider && provider.enabled)) {
      return undefined;
    }

    const apiKey = await this.providers.getApiKey(request.providerId);
    if (!apiKey) {
      return undefined;
    }

    const { completeSimple } = await import("@mariozechner/pi-ai");
    const model = buildPiModel({
      ...provider,
      model: request.model || provider.model,
    });
    const response = await completeSimple(
      model,
      {
        messages: [
          {
            role: "user",
            content: `${systemPrompt}\n\n${userPrompt}`,
            timestamp: Date.now(),
          },
        ],
      },
      {
        apiKey,
        maxTokens: request.runtimeConfig?.maxOutputTokens ?? 1400,
        temperature: request.runtimeConfig?.temperature ?? 0.5,
        reasoning: "minimal",
      }
    );

    const textParts = response.content
      .filter((item) => item.type === "text")
      .map((item) => ("text" in item ? item.text : ""))
      .join("\n")
      .trim();

    return textParts || undefined;
  }

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

  async runPipeline(
    input: RuntimePipelineInput
  ): Promise<RuntimePipelineResult> {
    const { jobId, onStageUpdate, request } = input;
    await this.initialize();
    const warnings: JobWarning[] = [];

    const outputDir = this.getOutputDir(jobId);
    const researchDir = path.join(outputDir, "research");
    const scriptDir = path.join(outputDir, "script");
    const stagesDir = path.join(outputDir, "stages");
    const timelineDir = path.join(outputDir, "timeline");
    const logsDir = path.join(outputDir, "logs");
    const pipelineLogPath = path.join(logsDir, "pipeline.log");

    await Promise.all([
      mkdir(researchDir, { recursive: true }),
      mkdir(scriptDir, { recursive: true }),
      mkdir(stagesDir, { recursive: true }),
      mkdir(timelineDir, { recursive: true }),
      mkdir(logsDir, { recursive: true }),
    ]);

    const writeStageOutput = async (
      stage: Stage,
      payload: Record<string, unknown>
    ) => {
      const outputPath = path.join(stagesDir, `${stage}.json`);
      await writeFile(
        outputPath,
        JSON.stringify(
          {
            jobId,
            stage,
            generatedAt: new Date().toISOString(),
            ...payload,
          },
          null,
          2
        ),
        "utf-8"
      );
      return outputPath;
    };

    const emit = async (
      stage: Stage,
      progress: number,
      currentTool: string,
      logLine?: string
    ) => {
      await onStageUpdate({
        stage,
        progress,
        currentTool,
      });
      if (logLine) {
        await this.appendPipelineLog(pipelineLogPath, logLine);
      }
    };

    await emit("ingest", 8, "ingestTool", "Pipeline started.");

    const sources = await this.ingestSources(
      request,
      request.runtimeConfig?.maxResearchSources ?? 6,
      pipelineLogPath
    );
    const sourcesPath = path.join(researchDir, "sources.json");
    await writeFile(sourcesPath, JSON.stringify(sources, null, 2), "utf-8");
    await writeStageOutput("ingest", {
      progress: 8,
      sourceCount: sources.length,
      sourcesPath,
      sources: sources.map((item) => ({
        type: item.type,
        source: item.source,
      })),
    });

    const mergedSourceText = sources
      .map((item, index) => {
        return `来源${index + 1}（${item.type}:${item.source}）：\n${item.contentPreview}`;
      })
      .join("\n\n");

    await emit("topic", 18, "topicTool", `Ingested sources=${sources.length}`);

    const topicPrompt = request.prompts?.topicPrompt ?? DEFAULT_TOPIC_PROMPT;
    const topicSourceText =
      mergedSourceText ||
      "未读取到可用输入资料，请仅根据用户任务信息生成主题。";
    let topic: string;
    try {
      topic =
        (await this.callLlm(
          request,
          request.prompts?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
          `${topicPrompt}\n\n以下是输入资料：\n${topicSourceText}`
        )) ?? this.buildFallbackTopic(request);
    } catch {
      topic = this.buildFallbackTopic(request);
      warnings.push({
        code: "TOPIC_FALLBACK",
        message: "Topic generation fallback to local heuristic.",
      });
    }
    topic = this.normalizeWhitespace(topic).slice(0, 56);
    if (!topic) {
      topic = this.buildFallbackTopic(request);
    }
    await writeStageOutput("topic", {
      progress: 18,
      topic,
      sourceCount: sources.length,
      prompt: topicPrompt,
    });

    await emit("research", 30, "researchTool", `Topic=${topic}`);

    const researchSummaryPath = path.join(researchDir, "summary.json");
    const researchNotes = {
      topic,
      sourceCount: sources.length,
      generatedAt: new Date().toISOString(),
    };
    await writeFile(
      researchSummaryPath,
      JSON.stringify(researchNotes, null, 2),
      "utf-8"
    );
    await writeStageOutput("research", {
      progress: 30,
      summaryPath: researchSummaryPath,
      summary: researchNotes,
    });

    await emit("script", 50, "scriptTool", "Generating script.");

    const scriptPrompt = request.prompts?.scriptPrompt ?? DEFAULT_SCRIPT_PROMPT;
    let scriptText: string;
    try {
      scriptText =
        (await this.callLlm(
          request,
          request.prompts?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
          [
            `任务主题：${topic}`,
            scriptPrompt,
            "",
            "以下是资料摘要：",
            topicSourceText,
          ].join("\n")
        )) ?? this.buildFallbackScript(topic, sources);
    } catch {
      scriptText = this.buildFallbackScript(topic, sources);
      warnings.push({
        code: "SCRIPT_FALLBACK",
        message: "Script generation fallback to local template.",
      });
    }

    const normalizedScript = scriptText.trim();
    const scriptPath = path.join(scriptDir, "script.md");
    await writeFile(scriptPath, `# ${topic}\n\n${normalizedScript}\n`, "utf-8");
    const scriptLines = this.splitIntoScriptLines(normalizedScript);
    await writeStageOutput("script", {
      progress: 50,
      scriptPath,
      lineCount: scriptLines.length,
      topic,
    });

    await emit(
      "voice_clone",
      62,
      "voiceCloneTool",
      request.voiceId
        ? `Voice clone selected voiceId=${request.voiceId}`
        : "Voice clone skipped (no voiceId)."
    );

    let generatedAudioPath: string | undefined;
    if (request.voiceId) {
      try {
        const scriptText = scriptLines.join("\n");
        const { previewAudioUrl } =
          await this.voiceCloneService.synthesizePreviewVoice(
            request.voiceId,
            scriptText
          );
        const audioDir = path.join(outputDir, "audio");
        await mkdir(audioDir, { recursive: true });
        const previewAudioPath = fileURLToPath(previewAudioUrl);
        const ext = path.extname(previewAudioPath).trim() || ".mp3";
        const audioFileName = `${request.voiceId}_audio${ext}`;
        generatedAudioPath = path.join(audioDir, audioFileName);
        const { copyFile } = await import("node:fs/promises");
        await copyFile(previewAudioPath, generatedAudioPath);
        await this.appendPipelineLog(
          pipelineLogPath,
          `voice_clone.generated path=${generatedAudioPath}`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.appendPipelineLog(
          pipelineLogPath,
          `voice_clone.failed error=${message}`
        );
        warnings.push({
          code: "VOICE_CLONE_FAILED",
          message: `Voice synthesis failed: ${message}`,
        });
      }
    }

    await writeStageOutput("voice_clone", {
      progress: 62,
      status: request.voiceId ? "selected" : "skipped",
      voiceId: request.voiceId ?? null,
      voiceProviderId: request.voiceProviderId ?? null,
      voiceModel: request.voiceModel ?? null,
      audioPath: generatedAudioPath,
    });

    await emit("compose", 74, "composeRenderTool", "Preparing Remotion props.");

    const palette = this.resolveRemotionPalette(request.remotionConfig);
    const remotionInputProps: AgentCompositionInput = {
      title: topic,
      subtitle:
        request.voiceId && request.voiceProviderId
          ? `Voice: ${request.voiceId} (${request.voiceProviderId})`
          : "Voice: default narration",
      scriptLines,
      accentColor: palette.accentColor,
      backgroundStartColor: palette.backgroundStartColor,
      backgroundEndColor: palette.backgroundEndColor,
      durationSec: this.resolveTargetDurationSec(request, scriptLines.length),
      fps: request.remotionConfig?.fps ?? 30,
      width: request.remotionConfig?.width ?? 1920,
      height: request.remotionConfig?.height ?? 1080,
      audioPath: generatedAudioPath,
    };
    const compositionInputPath = path.join(
      timelineDir,
      "composition-input.json"
    );
    await writeFile(
      compositionInputPath,
      JSON.stringify(remotionInputProps, null, 2),
      "utf-8"
    );
    await writeStageOutput("compose", {
      progress: 74,
      compositionInputPath,
      durationSec: remotionInputProps.durationSec,
      fps: remotionInputProps.fps,
      width: remotionInputProps.width,
      height: remotionInputProps.height,
    });

    const timeline = this.createTimeline(scriptLines);
    const timelinePath = path.join(timelineDir, "timestamps.json");
    await writeFile(timelinePath, JSON.stringify(timeline, null, 2), "utf-8");

    await emit("render", 84, "remotionRenderTool", "Rendering video.");
    const renderResult = await this.remotionRenderer.renderAgentVideo({
      jobId,
      outputDir,
      inputProps: remotionInputProps,
      onProgress: async (percent) => {
        if (percent >= 95) {
          await this.appendPipelineLog(
            pipelineLogPath,
            `render.progress=${percent}%`
          );
        }
      },
    });
    await writeStageOutput("render", {
      progress: 84,
      videoPath: renderResult.videoPath,
      outputDir,
    });

    await emit("package", 96, "packageTool", "Creating manifest.");
    const manifestPath = path.join(outputDir, "manifest.json");
    const manifest = {
      jobId,
      stage: "completed",
      generatedAt: new Date().toISOString(),
      request,
      topic,
      scriptLines,
      timeline,
      output: {
        videoPath: renderResult.videoPath,
        scriptPath,
        timelinePath,
        pipelineLogPath,
        audioPath: generatedAudioPath,
      },
      warnings,
    };
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
    await this.appendPipelineLog(pipelineLogPath, "Pipeline completed.");
    await emit("package", 100, "packageTool", "Manifest created.");
    await writeStageOutput("package", {
      progress: 100,
      manifestPath,
      timelinePath,
      pipelineLogPath,
      warningCount: warnings.length,
    });

    return {
      warnings,
      audioPath: generatedAudioPath,
      artifacts: {
        audioPath: generatedAudioPath,
        compositionInputPath,
        outputDir,
        manifestPath,
        videoPath: renderResult.videoPath,
        scriptPath,
        stageOutputDir: stagesDir,
        timelinePath,
        pipelineLogPath,
      },
    };
  }
}
