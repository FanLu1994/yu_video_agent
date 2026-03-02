import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  JobEvent,
  JobRecord,
  JobStageOutputs,
  JobState,
  RunAgentJobRequest,
  Stage,
} from "@/domain/agent/types";
import { JsonFileStore } from "@/services/storage/json-file-store";
import { getDataRootPath } from "@/services/storage/runtime-paths";
import type { AgentRuntimeService } from "./agent-runtime.service";

interface JobsDb {
  events: JobEvent[];
  jobs: JobRecord[];
}

interface StageReadableOutput {
  audioPath?: string;
  content?: string;
  outputPath: string;
}

export class AgentJobService {
  private readonly db = new JsonFileStore<JobsDb>("jobs.json", {
    jobs: [],
    events: [],
  });

  private runningJobId: string | undefined;

  constructor(private readonly runtime: AgentRuntimeService) {}

  private resolveOutputDir(job: JobRecord) {
    if (job.artifacts?.outputDir) {
      return job.artifacts.outputDir;
    }

    return path.join(getDataRootPath(), "output", job.jobId);
  }

  private async readTextFile(filePath: string) {
    try {
      const content = await readFile(filePath, "utf-8");
      const maxChars = 120_000;
      if (content.length <= maxChars) {
        return content;
      }

      return `${content.slice(0, maxChars)}\n\n... (内容过长，已截断)`;
    } catch {
      return undefined;
    }
  }

  private parseJson(value: string | undefined): unknown {
    if (!value) {
      return undefined;
    }

    try {
      return JSON.parse(value) as unknown;
    } catch {
      return undefined;
    }
  }

  private asRecord(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }

    return value as Record<string, unknown>;
  }

  private asString(value: unknown) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }

    return undefined;
  }

  private getStageTitle(stage: Stage) {
    const titleMap: Record<Stage, string> = {
      ingest: "资料采集",
      topic: "主题生成",
      research: "资料归纳",
      script: "脚本生成",
      voice_clone: "音色阶段",
      compose: "画面编排",
      render: "视频渲染",
      package: "产物打包",
    };

    return titleMap[stage];
  }

  private async buildFallbackStageContent(
    stage: Stage,
    job: JobRecord,
    outputDir: string
  ): Promise<StageReadableOutput> {
    const sourcesPath = path.join(outputDir, "research", "sources.json");
    const summaryPath = path.join(outputDir, "research", "summary.json");
    const scriptPath =
      job.artifacts?.scriptPath ?? path.join(outputDir, "script", "script.md");
    const composePath =
      job.artifacts?.compositionInputPath ??
      path.join(outputDir, "timeline", "composition-input.json");
    const manifestPath =
      job.artifacts?.manifestPath ?? path.join(outputDir, "manifest.json");

    switch (stage) {
      case "ingest":
        return {
          content: await this.readTextFile(sourcesPath),
          outputPath: sourcesPath,
        };
      case "topic":
      case "research":
        return {
          content: await this.readTextFile(summaryPath),
          outputPath: summaryPath,
        };
      case "script":
        return {
          content: await this.readTextFile(scriptPath),
          outputPath: scriptPath,
        };
      case "voice_clone":
        return {
          content: JSON.stringify(
            {
              status: job.request.voiceId ? "selected" : "skipped",
              voiceId: job.request.voiceId ?? null,
              voiceProviderId: job.request.voiceProviderId ?? null,
              voiceModel: job.request.voiceModel ?? null,
              audioPath: job.artifacts?.audioPath ?? null,
            },
            null,
            2
          ),
          outputPath: path.join(outputDir, "stages", "voice_clone.json"),
          audioPath: job.artifacts?.audioPath,
        };
      case "compose":
        return {
          content: await this.readTextFile(composePath),
          outputPath: composePath,
        };
      case "render":
        return {
          content: JSON.stringify(
            {
              videoPath: job.artifacts?.videoPath ?? null,
            },
            null,
            2
          ),
          outputPath: path.join(outputDir, "stages", "render.json"),
        };
      case "package":
        return {
          content: await this.readTextFile(manifestPath),
          outputPath: manifestPath,
        };
    }
  }

  private async buildReadableStageContent(
    stage: Stage,
    job: JobRecord,
    outputDir: string,
    stageReportContent: string | undefined
  ): Promise<StageReadableOutput> {
    const stageReport = this.asRecord(this.parseJson(stageReportContent)) ?? {};

    const sourcesPath = path.join(outputDir, "research", "sources.json");
    const summaryPath = path.join(outputDir, "research", "summary.json");
    const scriptPath =
      this.asString(stageReport.scriptPath) ??
      job.artifacts?.scriptPath ??
      path.join(outputDir, "script", "script.md");
    const composePath =
      this.asString(stageReport.compositionInputPath) ??
      job.artifacts?.compositionInputPath ??
      path.join(outputDir, "timeline", "composition-input.json");
    const manifestPath =
      this.asString(stageReport.manifestPath) ??
      job.artifacts?.manifestPath ??
      path.join(outputDir, "manifest.json");
    const audioPath =
      this.asString(stageReport.audioPath) ?? job.artifacts?.audioPath;

    if (stage === "script") {
      const scriptContent = await this.readTextFile(scriptPath);
      if (scriptContent) {
        return {
          content: scriptContent,
          outputPath: scriptPath,
        };
      }
    }

    if (stage === "topic") {
      const topic = this.asString(stageReport.topic);
      if (topic) {
        return {
          content: `主题结果：${topic}`,
          outputPath: path.join(outputDir, "stages", "topic.json"),
        };
      }
    }

    if (stage === "ingest") {
      const sourcesRaw = await this.readTextFile(sourcesPath);
      const sourcesParsed = this.parseJson(sourcesRaw);
      if (Array.isArray(sourcesParsed) && sourcesParsed.length > 0) {
        const lines = sourcesParsed.slice(0, 30).map((item, index) => {
          const record = this.asRecord(item);
          const type = this.asString(record?.type) ?? "source";
          const source = this.asString(record?.source) ?? "unknown";
          return `${index + 1}. [${type}] ${source}`;
        });

        return {
          content: `已采集 ${sourcesParsed.length} 条输入资料：\n${lines.join("\n")}`,
          outputPath: sourcesPath,
        };
      }
    }

    if (stage === "research") {
      const summaryRaw = await this.readTextFile(summaryPath);
      const summary = this.asRecord(this.parseJson(summaryRaw));
      if (summary) {
        const topic = this.asString(summary.topic) ?? "未生成";
        const sourceCount =
          typeof summary.sourceCount === "number" ? summary.sourceCount : 0;
        const generatedAt = this.asString(summary.generatedAt) ?? "未知时间";
        return {
          content: [
            `研究主题：${topic}`,
            `资料数量：${sourceCount}`,
            `生成时间：${generatedAt}`,
          ].join("\n"),
          outputPath: summaryPath,
        };
      }
    }

    if (stage === "voice_clone") {
      const status = this.asString(stageReport.status);
      const voiceId =
        this.asString(stageReport.voiceId) ?? job.request.voiceId ?? "";
      const voiceProviderId =
        this.asString(stageReport.voiceProviderId) ??
        job.request.voiceProviderId ??
        "";
      const voiceModel =
        this.asString(stageReport.voiceModel) ?? job.request.voiceModel ?? "";

      if (!voiceId) {
        return {
          content:
            "当前任务未选择音色。你可以在创建任务时选择 voiceId，然后在本页进行缓存试听。",
          outputPath: path.join(outputDir, "stages", "voice_clone.json"),
          audioPath,
        };
      }

      return {
        content: [
          `音色状态：${status === "selected" ? "已选择" : status || "已配置"}`,
          `voiceId：${voiceId}`,
          `语音服务：${voiceProviderId || "未填写"}`,
          `语音模型：${voiceModel || "未填写"}`,
          `流程语音：${audioPath || "尚未生成或路径不可用"}`,
          "可在本页下方输入试听文本并生成语音；系统会自动缓存试听结果。",
        ].join("\n"),
        outputPath: path.join(outputDir, "stages", "voice_clone.json"),
        audioPath,
      };
    }

    if (stage === "compose") {
      const composeRaw = await this.readTextFile(composePath);
      const compose = this.asRecord(this.parseJson(composeRaw));
      if (compose) {
        const title = this.asString(compose.title) ?? "-";
        const subtitle = this.asString(compose.subtitle) ?? "-";
        const durationSec =
          typeof compose.durationSec === "number" ? compose.durationSec : "-";
        const scriptLines = Array.isArray(compose.scriptLines)
          ? compose.scriptLines
              .map((line) =>
                typeof line === "string" ? line.trim() : String(line)
              )
              .filter(Boolean)
          : [];

        return {
          content: [
            `标题：${title}`,
            `副标题：${subtitle}`,
            `预计时长：${durationSec} 秒`,
            "",
            "脚本分句：",
            ...(scriptLines.length > 0
              ? scriptLines.map((line, index) => `${index + 1}. ${line}`)
              : ["暂无脚本分句"]),
          ].join("\n"),
          outputPath: composePath,
        };
      }
    }

    if (stage === "render") {
      const videoPath =
        this.asString(stageReport.videoPath) ?? job.artifacts?.videoPath ?? "-";
      return {
        content: `渲染输出视频路径：\n${videoPath}`,
        outputPath: path.join(outputDir, "stages", "render.json"),
      };
    }

    if (stage === "package") {
      const manifestRaw = await this.readTextFile(manifestPath);
      const manifest = this.asRecord(this.parseJson(manifestRaw));
      if (manifest) {
        const output = this.asRecord(manifest.output);
        const videoPath = this.asString(output?.videoPath) ?? "-";
        const scriptOutputPath = this.asString(output?.scriptPath) ?? "-";
        const timelinePath = this.asString(output?.timelinePath) ?? "-";
        const warningCount = Array.isArray(manifest.warnings)
          ? manifest.warnings.length
          : 0;
        return {
          content: [
            "打包清单：",
            `视频文件：${videoPath}`,
            `脚本文件：${scriptOutputPath}`,
            `时间线文件：${timelinePath}`,
            `告警数量：${warningCount}`,
          ].join("\n"),
          outputPath: manifestPath,
        };
      }
    }

    return this.buildFallbackStageContent(stage, job, outputDir);
  }

  private async appendEvent(
    jobId: string,
    type: JobEvent["type"],
    message: string,
    extra: Partial<JobEvent> = {}
  ) {
    const event: JobEvent = {
      id: randomUUID(),
      jobId,
      createdAt: new Date().toISOString(),
      type,
      message,
      ...extra,
    };

    await this.db.update((prev) => ({
      ...prev,
      events: [...prev.events, event],
    }));
  }

  private async updateJob(
    jobId: string,
    updater: (job: JobRecord) => JobRecord
  ) {
    await this.db.update((prev) => ({
      ...prev,
      jobs: prev.jobs.map((job) => (job.jobId === jobId ? updater(job) : job)),
    }));
  }

  private async renumberQueuePositions() {
    await this.db.update((prev) => {
      let queueIndex = 1;

      return {
        ...prev,
        jobs: prev.jobs.map((job) => {
          if (job.state === "queued") {
            return {
              ...job,
              queuePosition: queueIndex++,
              updatedAt: new Date().toISOString(),
            };
          }

          return {
            ...job,
            queuePosition: 0,
          };
        }),
      };
    });
  }

  async createJob(request: RunAgentJobRequest): Promise<JobRecord> {
    const now = new Date().toISOString();
    const job: JobRecord = {
      jobId: randomUUID(),
      createdAt: now,
      updatedAt: now,
      state: "queued",
      stage: "ingest",
      progress: 0,
      queuePosition: 0,
      retryCount: 0,
      request,
      warnings: [],
      errors: [],
    };

    await this.db.update((prev) => ({
      ...prev,
      jobs: [...prev.jobs, job],
    }));

    await this.renumberQueuePositions();
    await this.appendEvent(job.jobId, "job.created", "Job created and queued.");
    void this.runNext();

    const saved = await this.getJob(job.jobId);
    if (!saved) {
      throw new Error("Failed to create job.");
    }

    return saved;
  }

  async listJobs(): Promise<JobRecord[]> {
    const data = await this.db.read();
    return [...data.jobs].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
  }

  async getJob(jobId: string): Promise<JobRecord | undefined> {
    const jobs = await this.listJobs();
    return jobs.find((job) => job.jobId === jobId);
  }

  async getJobEvents(jobId: string): Promise<JobEvent[]> {
    const data = await this.db.read();
    return data.events.filter((event) => event.jobId === jobId);
  }

  async getJobStageOutputs(jobId: string): Promise<JobStageOutputs> {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error(`Job '${jobId}' not found.`);
    }

    const outputDir = this.resolveOutputDir(job);
    const stageOrder: Stage[] = [
      "ingest",
      "topic",
      "research",
      "script",
      "voice_clone",
      "compose",
      "render",
      "package",
    ];

    const steps = await Promise.all(
      stageOrder.map(async (stage) => {
        const stageReportPath = path.join(outputDir, "stages", `${stage}.json`);
        const stageReportContent = await this.readTextFile(stageReportPath);
        const readable = await this.buildReadableStageContent(
          stage,
          job,
          outputDir,
          stageReportContent
        );

        return {
          audioPath: readable.audioPath,
          stage,
          title: this.getStageTitle(stage),
          outputPath: readable.outputPath,
          exists: Boolean(readable.content),
          content:
            readable.content ?? "该阶段尚未产出文件，或任务尚未运行到此阶段。",
          source: stageReportContent
            ? ("stage_report" as const)
            : ("fallback" as const),
        };
      })
    );

    return {
      jobId,
      outputDir,
      steps,
    };
  }

  async cancelJob(jobId: string) {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error(`Job '${jobId}' not found.`);
    }

    if (job.state !== "queued" && job.state !== "running") {
      return job;
    }

    await this.updateJob(jobId, (prev) => ({
      ...prev,
      state: "cancelled",
      updatedAt: new Date().toISOString(),
      progress: prev.state === "queued" ? 0 : prev.progress,
    }));

    await this.appendEvent(jobId, "job.cancelled", "Job has been cancelled.");

    if (this.runningJobId === jobId) {
      this.runningJobId = undefined;
    }

    await this.renumberQueuePositions();
    void this.runNext();

    const refreshed = await this.getJob(jobId);
    if (!refreshed) {
      throw new Error(`Job '${jobId}' not found after cancellation.`);
    }

    return refreshed;
  }

  async retryJob(jobId: string) {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error(`Job '${jobId}' not found.`);
    }

    if (job.state !== "failed" && job.state !== "draft_pending_review") {
      return job;
    }

    await this.updateJob(jobId, (prev) => ({
      ...prev,
      state: "queued",
      stage: "ingest",
      progress: 0,
      queuePosition: 0,
      retryCount: prev.retryCount + 1,
      errors: [],
      updatedAt: new Date().toISOString(),
    }));
    await this.appendEvent(jobId, "job.created", "Job re-queued for retry.");
    await this.renumberQueuePositions();
    void this.runNext();

    const refreshed = await this.getJob(jobId);
    if (!refreshed) {
      throw new Error(`Job '${jobId}' not found after retry.`);
    }

    return refreshed;
  }

  private async runNext() {
    if (this.runningJobId) {
      return;
    }

    const data = await this.db.read();
    const nextJob = data.jobs
      .filter((job) => job.state === "queued")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];

    if (!nextJob) {
      return;
    }

    this.runningJobId = nextJob.jobId;
    await this.updateJob(nextJob.jobId, (job) => ({
      ...job,
      state: "running",
      queuePosition: 0,
      updatedAt: new Date().toISOString(),
    }));
    await this.renumberQueuePositions();
    await this.appendEvent(nextJob.jobId, "job.started", "Job started.");

    try {
      const pipelineResult = await this.runtime.runPipeline({
        jobId: nextJob.jobId,
        request: nextJob.request,
        onStageUpdate: async (update) => {
          const currentJob = await this.getJob(nextJob.jobId);
          if (!currentJob || currentJob.state === "cancelled") {
            return;
          }

          await this.updateJob(nextJob.jobId, (job) => ({
            ...job,
            stage: update.stage,
            currentTool: update.currentTool,
            progress: update.progress,
            updatedAt: new Date().toISOString(),
          }));
          await this.appendEvent(
            nextJob.jobId,
            "job.progress",
            "Stage progressed.",
            {
              stage: update.stage,
              progress: update.progress,
            }
          );
        },
      });

      const refreshed = await this.getJob(nextJob.jobId);
      if (refreshed && refreshed.state !== "cancelled") {
        await this.updateJob(nextJob.jobId, (job) => ({
          ...job,
          state: "completed",
          progress: 100,
          warnings: [...job.warnings, ...pipelineResult.warnings],
          artifacts: pipelineResult.artifacts,
          updatedAt: new Date().toISOString(),
        }));
        await this.appendEvent(
          nextJob.jobId,
          "job.completed",
          "Job completed."
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await this.updateJob(nextJob.jobId, (job) => ({
        ...job,
        state: "failed",
        errors: [...job.errors, { code: "RUNTIME_ERROR", message }],
        updatedAt: new Date().toISOString(),
      }));
      await this.appendEvent(nextJob.jobId, "job.failed", message);
    } finally {
      this.runningJobId = undefined;
      await this.renumberQueuePositions();
      void this.runNext();
    }
  }

  async summarizeQueue() {
    const jobs = await this.listJobs();
    const counts = jobs.reduce<Record<JobState, number>>(
      (acc, job) => {
        acc[job.state] += 1;
        return acc;
      },
      {
        queued: 0,
        running: 0,
        completed: 0,
        draft_pending_review: 0,
        failed: 0,
        cancelled: 0,
      }
    );

    return {
      counts,
      runningJobId: this.runningJobId,
    };
  }
}
