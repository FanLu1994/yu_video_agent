import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_REMOTION_TEMPLATE_ID,
  resolveRemotionTemplateById,
} from "@/constants";
import type {
  AgentRemotionConfig,
  JobArtifacts,
  JobWarning,
  RunAgentJobRequest,
  Stage,
} from "@/domain/agent/types";
import type { AgentCompositionInput } from "@/remotion/Root";
import { appLogger } from "@/services/logging/app-logger";
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
  resumeFromStage?: Stage;
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

  private previewText(value: string, maxLength = 280) {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized.length <= maxLength) {
      return normalized;
    }

    return `${normalized.slice(0, maxLength)}...`;
  }

  private async appendPipelineLog(logPath: string, line: string) {
    await mkdir(path.dirname(logPath), { recursive: true });
    await writeFile(logPath, `[${new Date().toISOString()}] ${line}\n`, {
      encoding: "utf-8",
      flag: "a",
    });
    appLogger.debug("Agent pipeline file log appended", {
      logPath,
      line,
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

  private async probeAudioFile(audioPath: string | undefined) {
    if (!audioPath) {
      return {
        exists: false,
        sizeBytes: 0,
      };
    }

    try {
      const fileStats = await stat(audioPath);
      return {
        exists: true,
        sizeBytes: fileStats.size,
      };
    } catch {
      return {
        exists: false,
        sizeBytes: 0,
      };
    }
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
    userPrompt: string,
    context: {
      jobId: string;
      stage: Stage;
      purpose: string;
    }
  ): Promise<string | undefined> {
    const provider = await this.providers.getProviderById(request.providerId);
    if (!(provider && provider.enabled)) {
      appLogger.warn("LLM 请求未执行：Provider 不可用或未启用", {
        jobId: context.jobId,
        stage: context.stage,
        providerId: request.providerId,
      });
      return undefined;
    }

    const apiKey = await this.providers.getApiKey(request.providerId);
    if (!apiKey) {
      appLogger.warn("LLM 请求未执行：缺少 API Key", {
        jobId: context.jobId,
        stage: context.stage,
        providerId: request.providerId,
      });
      return undefined;
    }

    appLogger.info("LLM 请求", {
      jobId: context.jobId,
      stage: context.stage,
      purpose: context.purpose,
      providerId: request.providerId,
      model: request.model || provider.model,
      temperature: request.runtimeConfig?.temperature ?? 0.5,
      maxTokens: request.runtimeConfig?.maxOutputTokens ?? 1400,
      systemPromptPreview: this.previewText(systemPrompt),
      userPromptPreview: this.previewText(userPrompt, 600),
    });

    const { completeSimple } = await import("@mariozechner/pi-ai");
    const model = buildPiModel({
      ...provider,
      model: request.model || provider.model,
    });
    const startedAt = Date.now();
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

    appLogger.info("LLM 响应", {
      jobId: context.jobId,
      stage: context.stage,
      purpose: context.purpose,
      durationMs: Date.now() - startedAt,
      outputLength: textParts.length,
      outputPreview: this.previewText(textParts),
    });

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
    const { jobId, onStageUpdate, request, resumeFromStage } = input;
    appLogger.info("Agent pipeline started", {
      jobId,
      remotionTemplateId:
        request.remotionTemplateId ?? DEFAULT_REMOTION_TEMPLATE_ID,
      resumeFromStage: resumeFromStage ?? null,
      providerId: request.providerId,
      model: request.model,
      voiceId: request.voiceId,
      voiceProviderId: request.voiceProviderId,
      voiceModel: request.voiceModel,
      articleUrlCount: request.articleUrls.length,
      localFileCount: request.localFiles.length,
    });
    await this.initialize();

    const stagesOrder: Stage[] = [
      "ingest",
      "topic",
      "research",
      "script",
      "voice_clone",
      "compose",
      "render",
      "package",
    ];

    const resumeIndex = resumeFromStage
      ? stagesOrder.indexOf(resumeFromStage)
      : -1;
    appLogger.info("流程恢复策略已解析", {
      jobId,
      resumeFromStage: resumeFromStage ?? null,
      resumeIndex,
    });
    if (resumeIndex === -1) {
      appLogger.info("流程执行模式：全量执行（从 ingest 开始，不跳过阶段）", {
        jobId,
      });
    } else {
      appLogger.info("流程执行模式：断点续跑（早于 resumeFromStage 的阶段将尝试跳过）", {
        jobId,
        resumeFromStage,
      });
    }

    const shouldSkipStage = async (stage: Stage): Promise<boolean> => {
      if (resumeIndex === -1) {
        return false;
      }
      const stageIndex = stagesOrder.indexOf(stage);
      if (stageIndex < resumeIndex) {
        appLogger.info("阶段跳过：该阶段早于 resumeFromStage，使用历史结果", {
          jobId,
          stage,
          resumeFromStage,
        });
        return true;
      }
      appLogger.debug("阶段不跳过：该阶段位于 resumeFromStage 及之后", {
        jobId,
        stage,
        resumeFromStage,
      });
      return false;
    };

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
    const warnings: JobWarning[] = [];

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
      appLogger.debug("Agent pipeline stage update", {
        jobId,
        stage,
        progress,
        currentTool,
      });
      if (logLine) {
        await this.appendPipelineLog(pipelineLogPath, logLine);
      }
    };
    const createRenderProgressReporter = () => {
      let lastOverallProgress = -1;
      let lastEmitAt = 0;

      return async (renderProgressPercent: number) => {
        const boundedRender = Math.max(
          0,
          Math.min(100, Math.round(renderProgressPercent))
        );
        const overall = Math.max(
          84,
          Math.min(95, Math.round(84 + boundedRender * 0.11))
        );
        const now = Date.now();
        const shouldEmit =
          overall !== lastOverallProgress &&
          (overall - lastOverallProgress >= 1 || now - lastEmitAt >= 800);
        if (!shouldEmit) {
          return;
        }

        lastOverallProgress = overall;
        lastEmitAt = now;
        await emit("render", overall, "remotionRenderTool");
      };
    };

    await emit("ingest", 8, "ingestTool", "Pipeline started.");

    let sources: IngestedSource[];
    const sourcesPath = path.join(researchDir, "sources.json");
    appLogger.info("阶段请求：ingest", {
      jobId,
      localFiles: request.localFiles,
      articleUrls: request.articleUrls,
      maxResearchSources: request.runtimeConfig?.maxResearchSources ?? 6,
    });
    if (await shouldSkipStage("ingest")) {
      try {
        const sourcesData = await readFile(sourcesPath, "utf-8");
        sources = JSON.parse(sourcesData);
        appLogger.info("阶段结果：ingest", {
          jobId,
          reusedCache: true,
          sourceCount: sources.length,
          sourcePreview: sources.slice(0, 8).map((item) => item.source),
        });
      } catch {
        appLogger.warn("ingest 缓存不可用，自动重新执行", {
          jobId,
          sourcesPath,
        });
        sources = await this.ingestSources(
          request,
          request.runtimeConfig?.maxResearchSources ?? 6,
          pipelineLogPath
        );
        await writeFile(sourcesPath, JSON.stringify(sources, null, 2), "utf-8");
      }
    } else {
      sources = await this.ingestSources(
        request,
        request.runtimeConfig?.maxResearchSources ?? 6,
        pipelineLogPath
      );
      await writeFile(sourcesPath, JSON.stringify(sources, null, 2), "utf-8");
    }
    await writeStageOutput("ingest", {
      progress: 8,
      sourceCount: sources.length,
      sourcesPath,
      sources: sources.map((item) => ({
        type: item.type,
        source: item.source,
      })),
    });
    appLogger.info("阶段结果：ingest", {
      jobId,
      reusedCache: false,
      sourceCount: sources.length,
      sourcePreview: sources.slice(0, 8).map((item) => item.source),
      sourcesPath,
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
    let topic = "";
    const generateTopic = async () => {
      appLogger.info("阶段请求：topic", {
        jobId,
        sourceCount: sources.length,
        promptPreview: this.previewText(topicPrompt),
      });
      try {
        topic =
          (await this.callLlm(
            request,
            request.prompts?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
            `${topicPrompt}\n\n以下是输入资料：\n${topicSourceText}`,
            {
              jobId,
              stage: "topic",
              purpose: "generate_topic",
            }
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
      appLogger.info("阶段结果：topic", {
        jobId,
        reusedCache: false,
        topic,
      });
    };

    if (await shouldSkipStage("topic")) {
      const topicStagePath = path.join(stagesDir, "topic.json");
      try {
        const topicStageRaw = await readFile(topicStagePath, "utf-8");
        const topicStage = JSON.parse(topicStageRaw) as Record<string, unknown>;
        const cachedTopic =
          typeof topicStage.topic === "string" ? topicStage.topic.trim() : "";
        if (!cachedTopic) {
          throw new Error("cached topic is empty");
        }
        topic = this.normalizeWhitespace(cachedTopic).slice(0, 56);
        appLogger.info("阶段结果：topic", {
          jobId,
          reusedCache: true,
          topic,
        });
      } catch {
        appLogger.warn("topic 缓存不可用，自动重新执行", {
          jobId,
          topicStagePath,
        });
        await generateTopic();
      }
    } else {
      await generateTopic();
    }

    await emit("research", 30, "researchTool", `Topic=${topic}`);

    const researchSummaryPath = path.join(researchDir, "summary.json");
    if (await shouldSkipStage("research")) {
      appLogger.info("阶段结果：research", {
        jobId,
        reusedCache: true,
        summaryPath: researchSummaryPath,
      });
    } else {
      appLogger.info("阶段请求：research", {
        jobId,
        topic,
        sourceCount: sources.length,
      });
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
      appLogger.info("阶段结果：research", {
        jobId,
        reusedCache: false,
        summaryPath: researchSummaryPath,
      });
    }

    await emit("script", 50, "scriptTool", "Generating script.");

    const scriptPrompt = request.prompts?.scriptPrompt ?? DEFAULT_SCRIPT_PROMPT;
    let scriptText: string;
    const scriptPath = path.join(scriptDir, "script.md");
    let scriptLines: string[] = [];
    const generateScript = async () => {
      appLogger.info("阶段请求：script", {
        jobId,
        topic,
        sourceCount: sources.length,
        promptPreview: this.previewText(scriptPrompt),
      });
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
            ].join("\n"),
            {
              jobId,
              stage: "script",
              purpose: "generate_script",
            }
          )) ?? this.buildFallbackScript(topic, sources);
      } catch {
        scriptText = this.buildFallbackScript(topic, sources);
        warnings.push({
          code: "SCRIPT_FALLBACK",
          message: "Script generation fallback to local template.",
        });
      }

      const normalizedScript = scriptText.trim();
      await writeFile(scriptPath, `# ${topic}\n\n${normalizedScript}\n`, "utf-8");
      scriptLines = this.splitIntoScriptLines(normalizedScript);
      await writeStageOutput("script", {
        progress: 50,
        scriptPath,
        lineCount: scriptLines.length,
        topic,
      });
      appLogger.info("阶段结果：script", {
        jobId,
        reusedCache: false,
        scriptPath,
        lineCount: scriptLines.length,
        scriptPreview: scriptLines.slice(0, 3),
      });
    };

    if (await shouldSkipStage("script")) {
      const scriptStagePath = path.join(stagesDir, "script.json");
      try {
        const scriptStageRaw = await readFile(scriptStagePath, "utf-8");
        const scriptStage = JSON.parse(scriptStageRaw) as Record<string, unknown>;
        const cachedScriptPath =
          typeof scriptStage.scriptPath === "string" &&
          scriptStage.scriptPath.trim().length > 0
            ? scriptStage.scriptPath
            : scriptPath;
        const cachedRaw = await readFile(cachedScriptPath, "utf-8");
        scriptText = cachedRaw.replace(/^#.*\r?\n+/u, "").trim();
        scriptLines = this.splitIntoScriptLines(scriptText);
        appLogger.info("阶段结果：script", {
          jobId,
          reusedCache: true,
          scriptPath: cachedScriptPath,
          lineCount: scriptLines.length,
          scriptPreview: scriptLines.slice(0, 3),
        });
      } catch {
        appLogger.warn("script 缓存不可用，自动重新执行", {
          jobId,
          scriptStagePath,
        });
        await generateScript();
      }
    } else {
      await generateScript();
    }

    await emit(
      "voice_clone",
      62,
      "voiceCloneTool",
      request.voiceId
        ? `Voice clone selected voiceId=${request.voiceId}`
        : "Voice clone skipped (no voiceId)."
    );

    let generatedAudioPath: string | undefined;
    const runVoiceClone = async () => {
      appLogger.info("阶段请求：voice_clone", {
        jobId,
        voiceId: request.voiceId ?? null,
        voiceProviderId: request.voiceProviderId ?? null,
        voiceModel: request.voiceModel ?? null,
        scriptLineCount: scriptLines.length,
      });
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
          appLogger.info("阶段结果：voice_clone", {
            jobId,
            reusedCache: false,
            status: "generated",
            previewAudioUrl,
            generatedAudioPath,
          });
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
          appLogger.warn("阶段结果：voice_clone", {
            jobId,
            reusedCache: false,
            status: "failed",
            error: message,
          });
        }
      } else {
        appLogger.info("阶段结果：voice_clone", {
          jobId,
          reusedCache: false,
          status: "skipped_no_voice_id",
        });
      }

      await writeStageOutput("voice_clone", {
        progress: 62,
        status: request.voiceId ? "selected" : "skipped",
        voiceId: request.voiceId ?? null,
        voiceProviderId: request.voiceProviderId ?? null,
        voiceModel: request.voiceModel ?? null,
        audioPath: generatedAudioPath,
      });
    };

    if (await shouldSkipStage("voice_clone")) {
      const voiceStagePath = path.join(stagesDir, "voice_clone.json");
      try {
        const voiceStageRaw = await readFile(voiceStagePath, "utf-8");
        const voiceStage = JSON.parse(voiceStageRaw) as Record<string, unknown>;
        const cachedAudioPath =
          typeof voiceStage.audioPath === "string" &&
          voiceStage.audioPath.trim().length > 0
            ? voiceStage.audioPath
            : undefined;

        if (request.voiceId && !cachedAudioPath) {
          throw new Error("cached voice audio not found");
        }

        generatedAudioPath = cachedAudioPath;
        appLogger.info("阶段结果：voice_clone", {
          jobId,
          reusedCache: true,
          status: request.voiceId ? "reused_cached_audio" : "reused_skip_status",
          audioPath: generatedAudioPath ?? null,
        });
      } catch {
        appLogger.warn("voice_clone 缓存不可用，自动重新执行", {
          jobId,
          voiceStagePath,
        });
        await runVoiceClone();
      }
    } else {
      await runVoiceClone();
    }

    await emit("compose", 74, "composeRenderTool", "Preparing Remotion props.");

    const remotionTemplate = resolveRemotionTemplateById(
      request.remotionTemplateId
    );
    let remotionInputProps: AgentCompositionInput;
    const compositionInputPath = path.join(
      timelineDir,
      "composition-input.json"
    );
    const composeStagePath = path.join(stagesDir, "compose.json");
    if (await shouldSkipStage("compose")) {
      try {
        const composeStageRaw = await readFile(composeStagePath, "utf-8");
        const composeStage = JSON.parse(composeStageRaw) as Record<string, unknown>;
        const cachedCompositionInputPath =
          typeof composeStage.compositionInputPath === "string" &&
          composeStage.compositionInputPath.trim().length > 0
            ? composeStage.compositionInputPath
            : compositionInputPath;
        const cachedPropsRaw = await readFile(cachedCompositionInputPath, "utf-8");
        remotionInputProps = JSON.parse(cachedPropsRaw) as AgentCompositionInput;
        scriptLines = remotionInputProps.scriptLines;
        if (!generatedAudioPath && remotionInputProps.audioPath) {
          generatedAudioPath = remotionInputProps.audioPath;
        }
        appLogger.info("阶段结果：compose", {
          jobId,
          reusedCache: true,
          compositionInputPath: cachedCompositionInputPath,
          lineCount: scriptLines.length,
          audioPath: generatedAudioPath ?? null,
        });
      } catch {
        appLogger.warn("compose 缓存不可用，自动重新执行", {
          jobId,
          composeStagePath,
        });
        const palette = this.resolveRemotionPalette(request.remotionConfig);
        remotionInputProps = {
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
        appLogger.info("阶段请求：compose", {
          jobId,
          title: remotionInputProps.title,
          lineCount: remotionInputProps.scriptLines.length,
          durationSec: remotionInputProps.durationSec,
          fps: remotionInputProps.fps,
          width: remotionInputProps.width,
          height: remotionInputProps.height,
          audioPath: remotionInputProps.audioPath ?? null,
        });
        await writeFile(
          compositionInputPath,
          JSON.stringify(remotionInputProps, null, 2),
          "utf-8"
        );
        const composeAudioProbe = await this.probeAudioFile(
          remotionInputProps.audioPath
        );
        await writeStageOutput("compose", {
          progress: 74,
          remotionTemplateId: remotionTemplate.id,
          compositionId: remotionTemplate.compositionId,
          compositionInputPath,
          audioPath: remotionInputProps.audioPath ?? null,
          audioFileExists: composeAudioProbe.exists,
          audioFileSizeBytes: composeAudioProbe.sizeBytes,
          durationSec: remotionInputProps.durationSec,
          fps: remotionInputProps.fps,
          width: remotionInputProps.width,
          height: remotionInputProps.height,
        });
        appLogger.info("阶段结果：compose", {
          jobId,
          reusedCache: false,
          compositionInputPath,
          lineCount: remotionInputProps.scriptLines.length,
        });
      }
    } else {
      const palette = this.resolveRemotionPalette(request.remotionConfig);
      remotionInputProps = {
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
      appLogger.info("阶段请求：compose", {
        jobId,
        title: remotionInputProps.title,
        lineCount: remotionInputProps.scriptLines.length,
        durationSec: remotionInputProps.durationSec,
        fps: remotionInputProps.fps,
        width: remotionInputProps.width,
        height: remotionInputProps.height,
        audioPath: remotionInputProps.audioPath ?? null,
      });
      await writeFile(
        compositionInputPath,
        JSON.stringify(remotionInputProps, null, 2),
        "utf-8"
      );
      const composeAudioProbe = await this.probeAudioFile(
        remotionInputProps.audioPath
      );
      await writeStageOutput("compose", {
        progress: 74,
        remotionTemplateId: remotionTemplate.id,
        compositionId: remotionTemplate.compositionId,
        compositionInputPath,
        audioPath: remotionInputProps.audioPath ?? null,
        audioFileExists: composeAudioProbe.exists,
        audioFileSizeBytes: composeAudioProbe.sizeBytes,
        durationSec: remotionInputProps.durationSec,
        fps: remotionInputProps.fps,
        width: remotionInputProps.width,
        height: remotionInputProps.height,
      });
      appLogger.info("阶段结果：compose", {
        jobId,
        reusedCache: false,
        compositionInputPath,
        lineCount: remotionInputProps.scriptLines.length,
      });
    }

    const timeline = this.createTimeline(scriptLines);
    const timelinePath = path.join(timelineDir, "timestamps.json");
    await writeFile(timelinePath, JSON.stringify(timeline, null, 2), "utf-8");

    await emit("render", 84, "remotionRenderTool", "Rendering video.");
    let finalVideoPath: string;
    if (await shouldSkipStage("render")) {
      const renderStagePath = path.join(stagesDir, "render.json");
      try {
        const renderStageRaw = await readFile(renderStagePath, "utf-8");
        const renderStage = JSON.parse(renderStageRaw) as Record<string, unknown>;
        const cachedVideoPath =
          typeof renderStage.videoPath === "string" &&
          renderStage.videoPath.trim().length > 0
            ? renderStage.videoPath
            : undefined;
        if (!cachedVideoPath) {
          throw new Error("cached video path missing");
        }
        finalVideoPath = cachedVideoPath;
        await emit("render", 95, "remotionRenderTool", "Render cache reused.");
        appLogger.info("阶段结果：render", {
          jobId,
          reusedCache: true,
          videoPath: finalVideoPath,
        });
      } catch {
        appLogger.warn("render 缓存不可用，自动重新执行", {
          jobId,
          renderStagePath,
        });
        appLogger.info("阶段请求：render", {
          jobId,
          title: remotionInputProps.title,
          scriptLines: remotionInputProps.scriptLines.length,
          durationSec: remotionInputProps.durationSec,
          audioPath: remotionInputProps.audioPath ?? null,
          audioFile: await this.probeAudioFile(remotionInputProps.audioPath),
        });
        let lastLoggedRenderPercent = -1;
        const reportRenderProgress = createRenderProgressReporter();
        const renderResult = await this.remotionRenderer.renderAgentVideo({
          jobId,
          outputDir,
          compositionId: remotionTemplate.compositionId,
          inputProps: remotionInputProps,
          onProgress: async (percent) => {
            const rounded = Math.round(percent);
            await reportRenderProgress(rounded);
            if (
              rounded !== lastLoggedRenderPercent &&
              (rounded % 10 === 0 || rounded >= 95)
            ) {
              lastLoggedRenderPercent = rounded;
              appLogger.info("阶段结果：render-progress", {
                jobId,
                percent: rounded,
              });
            }
            if (percent >= 95) {
              await this.appendPipelineLog(
                pipelineLogPath,
                `render.progress=${percent}%`
              );
            }
          },
        });
        await emit("render", 95, "remotionRenderTool", "Render completed.");
        finalVideoPath = renderResult.videoPath;
        await writeStageOutput("render", {
          progress: 84,
          remotionTemplateId: remotionTemplate.id,
          compositionId: renderResult.compositionId,
          videoPath: finalVideoPath,
          outputDir,
        });
        appLogger.info("阶段结果：render", {
          jobId,
          reusedCache: false,
          videoPath: finalVideoPath,
        });
      }
    } else {
      appLogger.info("阶段请求：render", {
        jobId,
        title: remotionInputProps.title,
        scriptLines: remotionInputProps.scriptLines.length,
        durationSec: remotionInputProps.durationSec,
        audioPath: remotionInputProps.audioPath ?? null,
        audioFile: await this.probeAudioFile(remotionInputProps.audioPath),
      });
      let lastLoggedRenderPercent = -1;
      const reportRenderProgress = createRenderProgressReporter();
      const renderResult = await this.remotionRenderer.renderAgentVideo({
        jobId,
        outputDir,
        compositionId: remotionTemplate.compositionId,
        inputProps: remotionInputProps,
        onProgress: async (percent) => {
          const rounded = Math.round(percent);
          await reportRenderProgress(rounded);
          if (
            rounded !== lastLoggedRenderPercent &&
            (rounded % 10 === 0 || rounded >= 95)
          ) {
            lastLoggedRenderPercent = rounded;
            appLogger.info("阶段结果：render-progress", {
              jobId,
              percent: rounded,
            });
          }
          if (percent >= 95) {
            await this.appendPipelineLog(
              pipelineLogPath,
              `render.progress=${percent}%`
            );
          }
        },
      });
      await emit("render", 95, "remotionRenderTool", "Render completed.");
      finalVideoPath = renderResult.videoPath;
      await writeStageOutput("render", {
        progress: 84,
        remotionTemplateId: remotionTemplate.id,
        compositionId: renderResult.compositionId,
        videoPath: finalVideoPath,
        outputDir,
      });
      appLogger.info("阶段结果：render", {
        jobId,
        reusedCache: false,
        videoPath: finalVideoPath,
      });
    }

    await emit("package", 96, "packageTool", "Creating manifest.");
    const manifestPath = path.join(outputDir, "manifest.json");
    appLogger.info("阶段请求：package", {
      jobId,
      videoPath: finalVideoPath,
      scriptPath,
      timelinePath,
      audioPath: generatedAudioPath ?? null,
      warningCount: warnings.length,
    });
    const manifest = {
      jobId,
      stage: "completed",
      generatedAt: new Date().toISOString(),
      request,
      topic,
      scriptLines,
      timeline,
      output: {
        remotionTemplateId: remotionTemplate.id,
        compositionId: remotionTemplate.compositionId,
        videoPath: finalVideoPath,
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
    appLogger.info("阶段结果：package", {
      jobId,
      manifestPath,
      warningCount: warnings.length,
    });
    appLogger.info("Agent pipeline completed", {
      jobId,
      videoPath: finalVideoPath,
      audioPath: generatedAudioPath,
      scriptPath,
      manifestPath,
      warnings: warnings.length,
    });
    return {
      warnings,
      audioPath: generatedAudioPath,
      artifacts: {
        audioPath: generatedAudioPath,
        compositionInputPath,
        outputDir,
        manifestPath,
        videoPath: finalVideoPath,
        scriptPath,
        stageOutputDir: stagesDir,
        timelinePath,
        pipelineLogPath,
      },
    };
  }
}
