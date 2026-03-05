import { createFileRoute, Link, useLocation } from "@tanstack/react-router";
import { FolderOpen } from "lucide-react";
import {
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  cancelAgentJob,
  createAgentJob,
  getAgentJobEvents,
  getAgentJobStageOutputs,
  getAgentQueueSummary,
  listAgentJobs,
  retryAgentJob,
} from "@/actions/agent";
import { getAgentConfig } from "@/actions/agent-config";
import { listProviders } from "@/actions/provider";
import { pickLocalFiles } from "@/actions/shell";
import {
  getCachedPreviewVoice,
  listVoiceProfiles,
  synthesizePreviewVoice,
} from "@/actions/voice-clone";
import {
  loadVoiceNameOverrides,
  resolveVoiceDisplayName,
} from "@/actions/voice-display-name";
import {
  getLastSelectedVoiceId,
  saveLastSelectedVoiceId,
} from "@/actions/voice-selection";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  extractDroppedFilePaths,
  mergeMultilineItems,
} from "@/utils/file-drop";

interface JobFormState {
  articleUrlsText: string;
  localFilesText: string;
  model: string;
  providerId: string;
  voiceId: string;
  voiceModel: string;
  voiceProviderId: string;
}

type JobsTab = "create" | "queue" | "detail" | "events";
type JobRow = Awaited<ReturnType<typeof listAgentJobs>>[number];
type JobState = JobRow["state"];
type StageOutputRow = Awaited<
  ReturnType<typeof getAgentJobStageOutputs>
>["steps"][number];

const JOB_STATE_ORDER: JobState[] = [
  "running",
  "queued",
  "draft_pending_review",
  "failed",
  "completed",
  "cancelled",
];

const RETRYABLE_STATES: JobState[] = [
  "failed",
  "draft_pending_review",
  "cancelled",
];

const JOB_STATE_META: Record<
  JobState,
  {
    badgeClass: string;
    cardBarClass: string;
    cardBgClass: string;
    sectionClass: string;
    sectionTitle: string;
    statusLabel: string;
  }
> = {
  running: {
    statusLabel: "运行中",
    sectionTitle: "运行中任务",
    sectionClass: "border-amber-300/40 bg-amber-50/30",
    badgeClass: "border-amber-300/60 bg-amber-100/70 text-amber-800",
    cardBgClass: "border-amber-300/30 bg-amber-50/40",
    cardBarClass: "bg-amber-500",
  },
  queued: {
    statusLabel: "排队中",
    sectionTitle: "排队任务",
    sectionClass: "border-sky-300/40 bg-sky-50/30",
    badgeClass: "border-sky-300/60 bg-sky-100/70 text-sky-800",
    cardBgClass: "border-sky-300/30 bg-sky-50/40",
    cardBarClass: "bg-sky-500",
  },
  draft_pending_review: {
    statusLabel: "待复核",
    sectionTitle: "待复核任务",
    sectionClass: "border-orange-300/40 bg-orange-50/30",
    badgeClass: "border-orange-300/60 bg-orange-100/70 text-orange-800",
    cardBgClass: "border-orange-300/30 bg-orange-50/40",
    cardBarClass: "bg-orange-500",
  },
  failed: {
    statusLabel: "失败",
    sectionTitle: "失败任务",
    sectionClass: "border-rose-300/40 bg-rose-50/30",
    badgeClass: "border-rose-300/60 bg-rose-100/70 text-rose-800",
    cardBgClass: "border-rose-300/30 bg-rose-50/40",
    cardBarClass: "bg-rose-500",
  },
  completed: {
    statusLabel: "已完成",
    sectionTitle: "完成任务",
    sectionClass: "border-emerald-300/40 bg-emerald-50/30",
    badgeClass: "border-emerald-300/60 bg-emerald-100/70 text-emerald-800",
    cardBgClass: "border-emerald-300/30 bg-emerald-50/40",
    cardBarClass: "bg-emerald-500",
  },
  cancelled: {
    statusLabel: "已取消",
    sectionTitle: "取消任务",
    sectionClass: "border-zinc-300/40 bg-zinc-100/30",
    badgeClass: "border-zinc-300/60 bg-zinc-200/70 text-zinc-700",
    cardBgClass: "border-zinc-300/30 bg-zinc-100/40",
    cardBarClass: "bg-zinc-500",
  },
};

function isSpeechModel(model: string) {
  return model.trim().startsWith("speech-");
}

function toPlayableFileUrl(filePath: string | undefined) {
  if (!filePath) {
    return null;
  }

  const trimmed = filePath.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("file://")) {
    return trimmed;
  }

  const normalized = trimmed.replace(/\\/g, "/");
  const normalizedWindows = normalized.replace(/^\/([A-Za-z]:\/)/, "$1");
  if (/^[A-Za-z]:\//.test(normalizedWindows)) {
    return `file:///${encodeURI(normalizedWindows)}`;
  }

  return encodeURI(normalizedWindows);
}

function JobsPage() {
  const location = useLocation();
  const [providers, setProviders] = useState<
    Awaited<ReturnType<typeof listProviders>>
  >([]);
  const [agentConfig, setAgentConfig] = useState<
    Awaited<ReturnType<typeof getAgentConfig>> | undefined
  >(undefined);
  const [voices, setVoices] = useState<
    Awaited<ReturnType<typeof listVoiceProfiles>>
  >([]);
  const [jobs, setJobs] = useState<Awaited<ReturnType<typeof listAgentJobs>>>(
    []
  );
  const [selectedJobId, setSelectedJobId] = useState("");
  const [events, setEvents] = useState<
    Awaited<ReturnType<typeof getAgentJobEvents>>
  >([]);
  const [stepOutputs, setStepOutputs] = useState<Awaited<
    ReturnType<typeof getAgentJobStageOutputs>
  > | null>(null);
  const [activeTab, setActiveTab] = useState<JobsTab>("queue");
  const [queueSummary, setQueueSummary] = useState<
    Awaited<ReturnType<typeof getAgentQueueSummary>> | undefined
  >(undefined);
  const [form, setForm] = useState<JobFormState>({
    providerId: "",
    model: "",
    voiceProviderId: "",
    voiceModel: "",
    voiceId: "",
    localFilesText: "",
    articleUrlsText: "",
  });
  const [isDraggingLocalFiles, setIsDraggingLocalFiles] = useState(false);
  const [message, setMessage] = useState("");
  const [activeOutputStage, setActiveOutputStage] = useState<string>("");
  const [voicePreviewText, setVoicePreviewText] = useState(
    "这是任务详情页的语音试听文本。"
  );
  const [voicePreviewUrl, setVoicePreviewUrl] = useState<string | null>(null);
  const [voicePreviewUpdatedAt, setVoicePreviewUpdatedAt] = useState<
    string | null
  >(null);
  const [voicePreviewError, setVoicePreviewError] = useState<string | null>(
    null
  );
  const [isGeneratingVoicePreview, setIsGeneratingVoicePreview] =
    useState(false);
  const [isPending, startTransition] = useTransition();

  // 从主页传递的状态中恢复选中的任务ID
  useEffect(() => {
    const state = location.state as { selectedJobId?: string } | null;
    if (state?.selectedJobId) {
      setSelectedJobId(state.selectedJobId);
      setActiveTab("detail");
    }
  }, [location.state]);

  const enabledProviders = useMemo(
    () => providers.filter((provider) => provider.enabled),
    [providers]
  );
  const agentProviders = useMemo(
    () => enabledProviders.filter((provider) => !isSpeechModel(provider.model)),
    [enabledProviders]
  );
  const voiceProviders = useMemo(
    () => enabledProviders.filter((provider) => isSpeechModel(provider.model)),
    [enabledProviders]
  );
  const agentProviderOptions = agentProviders.length
    ? agentProviders
    : enabledProviders;
  const voiceProviderOptions = voiceProviders.length
    ? voiceProviders
    : enabledProviders;

  const selectedJob = useMemo(
    () => jobs.find((job) => job.jobId === selectedJobId),
    [jobs, selectedJobId]
  );
  const jobsByState = useMemo(() => {
    const grouped = JOB_STATE_ORDER.map((state) => ({
      state,
      jobs: jobs.filter((job) => job.state === state),
    }));

    return grouped;
  }, [jobs]);
  const stageOutputs = stepOutputs?.steps ?? [];
  const generatedVoiceAudioPath =
    stageOutputs.find((step) => step.stage === "voice_clone")?.audioPath ??
    selectedJob?.artifacts?.audioPath;
  const generatedVoiceAudioUrl = toPlayableFileUrl(generatedVoiceAudioPath);
  const canRetrySelectedJob = selectedJob
    ? RETRYABLE_STATES.includes(selectedJob.state)
    : false;
  const canCancelSelectedJob = selectedJob
    ? selectedJob.state === "queued" || selectedJob.state === "running"
    : false;

  useEffect(() => {
    const selectedProvider = enabledProviders.find(
      (provider) => provider.id === form.providerId
    );
    if (!selectedProvider) {
      return;
    }

    setForm((prev) =>
      prev.model === selectedProvider.model
        ? prev
        : { ...prev, model: selectedProvider.model }
    );
  }, [enabledProviders, form.providerId]);

  useEffect(() => {
    const selectedVoiceProvider = enabledProviders.find(
      (provider) => provider.id === form.voiceProviderId
    );
    if (!selectedVoiceProvider) {
      return;
    }

    setForm((prev) =>
      prev.voiceModel === selectedVoiceProvider.model
        ? prev
        : { ...prev, voiceModel: selectedVoiceProvider.model }
    );
  }, [enabledProviders, form.voiceProviderId]);

  useEffect(() => {
    const fallbackAgentProvider = agentProviderOptions[0];
    const fallbackVoiceProvider = voiceProviderOptions[0];

    setForm((prev) => {
      let changed = false;
      let next = prev;

      if (
        !(
          prev.providerId &&
          enabledProviders.some((provider) => provider.id === prev.providerId)
        ) &&
        fallbackAgentProvider
      ) {
        next = {
          ...next,
          providerId: fallbackAgentProvider.id,
          model: fallbackAgentProvider.model,
        };
        changed = true;
      }

      if (
        !(
          prev.voiceProviderId &&
          enabledProviders.some(
            (provider) => provider.id === prev.voiceProviderId
          )
        ) &&
        fallbackVoiceProvider
      ) {
        next = {
          ...next,
          voiceProviderId: fallbackVoiceProvider.id,
          voiceModel: fallbackVoiceProvider.model,
        };
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [agentProviderOptions, enabledProviders, voiceProviderOptions]);

  useEffect(() => {
    if (voices.length === 0) {
      return;
    }

    setForm((prev) => {
      if (
        prev.voiceId &&
        voices.some((voice) => voice.voiceId === prev.voiceId)
      ) {
        return prev;
      }

      const lastSelectedVoiceId = getLastSelectedVoiceId();
      const fallbackVoiceId =
        lastSelectedVoiceId &&
        voices.some((voice) => voice.voiceId === lastSelectedVoiceId)
          ? lastSelectedVoiceId
          : voices[0]?.voiceId || "";

      if (!fallbackVoiceId || prev.voiceId === fallbackVoiceId) {
        return prev;
      }

      return {
        ...prev,
        voiceId: fallbackVoiceId,
      };
    });
  }, [voices]);

  useEffect(() => {
    if (!selectedJob) {
      setActiveOutputStage("");
      return;
    }

    if (stageOutputs.length === 0) {
      setActiveOutputStage("");
      return;
    }

    const hasActive = stageOutputs.some(
      (step) => step.stage === activeOutputStage
    );
    if (hasActive) {
      return;
    }

    const currentStage = stageOutputs.find(
      (step) => step.stage === selectedJob.stage
    );
    setActiveOutputStage(currentStage?.stage ?? stageOutputs[0]?.stage ?? "");
  }, [activeOutputStage, selectedJob, stageOutputs]);

  useEffect(() => {
    const voiceId = selectedJob?.request.voiceId?.trim();
    if (!voiceId) {
      setVoicePreviewUrl(null);
      setVoicePreviewUpdatedAt(null);
      setVoicePreviewError(null);
      return;
    }

    getCachedPreviewVoice(voiceId)
      .then((cached) => {
        if (!cached) {
          setVoicePreviewUrl(null);
          setVoicePreviewUpdatedAt(null);
          return;
        }

        setVoicePreviewText(
          cached.previewText?.trim() || "这是任务详情页的语音试听文本。"
        );
        setVoicePreviewUrl(cached.previewAudioUrl || null);
        setVoicePreviewUpdatedAt(cached.previewUpdatedAt || null);
        setVoicePreviewError(null);
      })
      .catch((error) => {
        setVoicePreviewError(
          error instanceof Error ? error.message : "读取缓存试听失败。"
        );
      });
  }, [selectedJob?.jobId, selectedJob?.request.voiceId]);

  const refresh = useCallback(async () => {
    const [providerRows, config, voiceRows, jobRows, summary] =
      await Promise.all([
        listProviders(),
        getAgentConfig(),
        listVoiceProfiles(),
        listAgentJobs(),
        getAgentQueueSummary(),
      ]);
    const voiceNameOverrides = loadVoiceNameOverrides();
    const mergedVoiceRows = voiceRows.map((voice) => ({
      ...voice,
      displayName: resolveVoiceDisplayName(
        voice.voiceId,
        voice.displayName,
        voiceNameOverrides
      ),
    }));

    setProviders(providerRows);
    setAgentConfig(config);
    setVoices(mergedVoiceRows);
    setJobs(jobRows);
    setQueueSummary(summary);

    if (selectedJobId && activeTab === "events") {
      const jobEvents = await getAgentJobEvents(selectedJobId);
      setEvents(jobEvents);
    }

    if (selectedJobId && activeTab === "detail") {
      const outputs = await getAgentJobStageOutputs(selectedJobId);
      setStepOutputs(outputs);
    }
  }, [activeTab, selectedJobId]);

  useEffect(() => {
    startTransition(() => {
      refresh().catch((error) => {
        setMessage(error instanceof Error ? error.message : "加载任务失败。");
      });
    });

    const timer = window.setInterval(() => {
      refresh().catch(() => {
        // Polling errors are surfaced on next successful refresh.
      });
    }, 2000);

    return () => {
      window.clearInterval(timer);
    };
  }, [refresh]);

  async function onCreateJob() {
    try {
      const localFiles = form.localFilesText
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean);

      const articleUrls = form.articleUrlsText
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean);

      if (!(form.providerId && form.model)) {
        setMessage("请填写 Agent 模型服务和 Agent 模型。");
        return;
      }

      if (form.voiceId && !(form.voiceProviderId && form.voiceModel)) {
        setMessage("选择音色时，请填写语音模型服务和语音模型。");
        return;
      }

      if (!agentConfig) {
        setMessage("Agent 配置尚未加载完成，请稍后再试。");
        return;
      }

      const toOptional = (value: string | undefined) => {
        const trimmed = value?.trim() ?? "";
        return trimmed.length > 0 ? trimmed : undefined;
      };

      const created = await createAgentJob({
        providerId: form.providerId,
        model: form.model,
        voiceProviderId: form.voiceProviderId || undefined,
        voiceModel: form.voiceModel || undefined,
        voiceId: form.voiceId || undefined,
        localFiles,
        articleUrls,
        prompts: {
          systemPrompt: toOptional(agentConfig.prompts.systemPrompt),
          topicPrompt: toOptional(agentConfig.prompts.topicPrompt),
          scriptPrompt: toOptional(agentConfig.prompts.scriptPrompt),
        },
        runtimeConfig: {
          maxResearchSources: agentConfig.runtimeConfig.maxResearchSources,
          temperature: agentConfig.runtimeConfig.temperature,
          maxOutputTokens: agentConfig.runtimeConfig.maxOutputTokens,
        },
        remotionConfig: {
          theme: agentConfig.remotionConfig.theme,
          fps: agentConfig.remotionConfig.fps,
          width: agentConfig.remotionConfig.width,
          height: agentConfig.remotionConfig.height,
          accentColor: toOptional(agentConfig.remotionConfig.accentColor),
          backgroundStartColor: toOptional(
            agentConfig.remotionConfig.backgroundStartColor
          ),
          backgroundEndColor: toOptional(
            agentConfig.remotionConfig.backgroundEndColor
          ),
        },
        videoSpec: agentConfig.videoSpec,
      });

      setSelectedJobId(created.jobId);
      setActiveTab("detail");
      setMessage(`任务已创建：${created.jobId}`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "创建任务失败。");
    }
  }

  async function onSelectJob(
    jobId: string,
    tab: Extract<JobsTab, "detail" | "events">
  ) {
    setSelectedJobId(jobId);
    setActiveTab(tab);

    if (tab === "events") {
      try {
        const rows = await getAgentJobEvents(jobId);
        setEvents(rows);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "加载事件失败。");
      }
    }

    if (tab === "detail") {
      try {
        const rows = await getAgentJobStageOutputs(jobId);
        setStepOutputs(rows);
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "加载流程产出失败。"
        );
      }
    }
  }

  async function onCancel(jobId: string) {
    try {
      await cancelAgentJob(jobId);
      setMessage(`已取消任务：${jobId}`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "取消失败。");
    }
  }

  async function onRetry(jobId: string) {
    try {
      await retryAgentJob(jobId);
      setMessage(`已重试任务：${jobId}`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "重试失败。");
    }
  }

  async function onGenerateJobVoicePreview(voiceId: string) {
    const text = voicePreviewText.trim();
    if (!text) {
      setVoicePreviewError("请输入试听文本。");
      return;
    }

    setIsGeneratingVoicePreview(true);
    setVoicePreviewError(null);
    try {
      const result = await synthesizePreviewVoice({
        voiceId,
        text,
      });
      setVoicePreviewUrl(result.previewAudioUrl);
      setVoicePreviewUpdatedAt(new Date().toISOString());
    } catch (error) {
      setVoicePreviewError(
        error instanceof Error ? error.message : "生成试听失败。"
      );
    } finally {
      setIsGeneratingVoicePreview(false);
    }
  }

  function onLocalFilesDragEnter(event: DragEvent<HTMLTextAreaElement>) {
    event.preventDefault();
    setIsDraggingLocalFiles(true);
  }

  function onLocalFilesDragLeave(event: DragEvent<HTMLTextAreaElement>) {
    event.preventDefault();
    setIsDraggingLocalFiles(false);
  }

  function onLocalFilesDragOver(event: DragEvent<HTMLTextAreaElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDraggingLocalFiles(true);
  }

  function onLocalFilesDrop(event: DragEvent<HTMLTextAreaElement>) {
    event.preventDefault();
    setIsDraggingLocalFiles(false);

    const droppedPaths = extractDroppedFilePaths(event.dataTransfer);
    if (droppedPaths.length === 0) {
      setMessage("未检测到可用文件路径，请直接拖入本地文件。");
      return;
    }

    setForm((prev) => ({
      ...prev,
      localFilesText: mergeMultilineItems(prev.localFilesText, droppedPaths),
    }));
    setMessage(`已添加 ${droppedPaths.length} 个文件。`);
  }

  async function onPickLocalFiles() {
    try {
      const selectedPaths = await pickLocalFiles("选择本地文件");
      if (selectedPaths.length === 0) {
        return;
      }

      setForm((prev) => ({
        ...prev,
        localFilesText: mergeMultilineItems(prev.localFilesText, selectedPaths),
      }));
      setMessage(`已添加 ${selectedPaths.length} 个文件。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "选择文件失败。");
    }
  }

  return (
    <div className="app-page">
      <section className="app-panel min-h-0 xl:col-span-12">
        <header className="app-panel-header">
          <div>
            <h1 className="font-semibold text-base">任务队列工作区</h1>
            <p className="text-muted-foreground text-xs">
              用上方页签切换任务创建、队列、详情与事件日志。
            </p>
          </div>
          {queueSummary ? (
            <p className="text-muted-foreground text-xs">
              排队 {queueSummary.counts.queued} · 运行中{" "}
              {queueSummary.counts.running} · 完成{" "}
              {queueSummary.counts.completed} · 失败{" "}
              {queueSummary.counts.failed}
            </p>
          ) : null}
        </header>

        <div className="app-panel-body !p-0">
          <Tabs
            className="flex h-full min-h-0 flex-col"
            onValueChange={(value) => setActiveTab(value as JobsTab)}
            value={activeTab}
          >
            <div className="border-border/70 border-b px-4 py-2">
              <TabsList>
                <TabsTrigger value="create">创建任务</TabsTrigger>
                <TabsTrigger value="queue">任务队列</TabsTrigger>
                <TabsTrigger value="detail">任务详情</TabsTrigger>
                <TabsTrigger value="events">事件日志</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent className="overflow-auto p-4" value="create">
              <div className="space-y-3">
                <div className="field-grid">
                  <label className="field-label">
                    <span>Agent 模型服务</span>
                    <select
                      className="field-input"
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          providerId: event.target.value,
                        }))
                      }
                      value={form.providerId}
                    >
                      {agentProviderOptions.length > 0 ? (
                        agentProviderOptions.map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.displayName} ({provider.id})
                          </option>
                        ))
                      ) : (
                        <option value="">暂无可用服务</option>
                      )}
                    </select>
                  </label>
                  <label className="field-label">
                    <span>Agent 模型</span>
                    <input
                      className="field-input"
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          model: event.target.value,
                        }))
                      }
                      value={form.model}
                    />
                  </label>
                  <label className="field-label md:col-span-2">
                    <span>音色（可选）</span>
                    <select
                      className="field-input"
                      onChange={(event) => {
                        const nextVoiceId = event.target.value;
                        if (nextVoiceId) {
                          saveLastSelectedVoiceId(nextVoiceId);
                        }

                        setForm((prev) => ({
                          ...prev,
                          voiceId: nextVoiceId,
                        }));
                      }}
                      value={form.voiceId}
                    >
                      <option value="">（不使用）</option>
                      {voices.map((voice) => (
                        <option key={voice.voiceId} value={voice.voiceId}>
                          {voice.displayName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">
                    <span>语音模型服务（可选）</span>
                    <select
                      className="field-input"
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          voiceProviderId: event.target.value,
                        }))
                      }
                      value={form.voiceProviderId}
                    >
                      {voiceProviderOptions.length > 0 ? (
                        voiceProviderOptions.map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.displayName} ({provider.id})
                          </option>
                        ))
                      ) : (
                        <option value="">暂无可用服务</option>
                      )}
                    </select>
                  </label>
                  <label className="field-label">
                    <span>语音模型（可选）</span>
                    <input
                      className="field-input"
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          voiceModel: event.target.value,
                        }))
                      }
                      value={form.voiceModel}
                    />
                  </label>
                  <label className="field-label">
                    <div className="flex items-center justify-between gap-2">
                      <span>本地文件（每行一个，可拖拽）</span>
                      <Button
                        disabled={isPending}
                        onClick={onPickLocalFiles}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <FolderOpen className="h-4 w-4" />
                        选择文件
                      </Button>
                    </div>
                    <textarea
                      className={`field-input min-h-24 transition-colors ${
                        isDraggingLocalFiles
                          ? "border-primary/70 bg-primary/5"
                          : ""
                      }`}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          localFilesText: event.target.value,
                        }))
                      }
                      onDragEnter={onLocalFilesDragEnter}
                      onDragLeave={onLocalFilesDragLeave}
                      onDragOver={onLocalFilesDragOver}
                      onDrop={onLocalFilesDrop}
                      placeholder={"D:\\docs\\input1.md\nD:\\docs\\input2.pdf"}
                      value={form.localFilesText}
                    />
                  </label>
                  <label className="field-label">
                    <span>文章 URL（每行一个）</span>
                    <textarea
                      className="field-input min-h-24"
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          articleUrlsText: event.target.value,
                        }))
                      }
                      placeholder={
                        "https://example.com/a\nhttps://example.com/b"
                      }
                      value={form.articleUrlsText}
                    />
                  </label>

                  <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-muted-foreground text-xs md:col-span-2">
                    Agent 的 Prompt / Runtime / Remotion 参数已迁移到侧边栏的
                    <Button
                      asChild
                      className="ml-1 h-6 px-2 text-xs"
                      size="sm"
                      variant="ghost"
                    >
                      <Link to="/agent-config">Agent 配置</Link>
                    </Button>
                    页面统一维护。
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button disabled={isPending} onClick={onCreateJob}>
                    创建任务
                  </Button>
                  {message ? (
                    <p className="text-muted-foreground text-sm">{message}</p>
                  ) : null}
                </div>
              </div>
            </TabsContent>

            <TabsContent className="overflow-auto p-4" value="queue">
              {jobs.length === 0 ? (
                <div className="rounded-lg border border-border/70 border-dashed px-4 py-10 text-center text-muted-foreground text-sm">
                  暂无任务。
                </div>
              ) : (
                <div className="space-y-4">
                  {jobsByState.map((group) => {
                    const meta = JOB_STATE_META[group.state];
                    return (
                      <section
                        className={`rounded-xl border p-3 ${meta.sectionClass}`}
                        key={group.state}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex rounded-full border px-2 py-0.5 font-medium text-xs ${meta.badgeClass}`}
                            >
                              {meta.statusLabel}
                            </span>
                            <h3 className="font-medium text-sm">
                              {meta.sectionTitle}
                            </h3>
                          </div>
                          <span className="text-muted-foreground text-xs">
                            {group.jobs.length} 个
                          </span>
                        </div>

                        {group.jobs.length > 0 ? (
                          <div className="mt-3 space-y-2">
                            {group.jobs.map((job) => (
                              <article
                                className={`rounded-lg border p-3 ${meta.cardBgClass} ${
                                  selectedJobId === job.jobId
                                    ? "ring-1 ring-primary/60"
                                    : ""
                                }`}
                                key={job.jobId}
                              >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div>
                                    <p className="font-medium text-sm">
                                      {job.jobId.slice(0, 12)}...
                                    </p>
                                    <p className="mt-1 text-muted-foreground text-xs">
                                      阶段：{job.stage} · 队列位：
                                      {job.queuePosition}
                                    </p>
                            <p className="text-muted-foreground text-xs">
                                      更新：
                                      {new Date(job.updatedAt).toLocaleString()}
                                    </p>
                                    {job.errors.length > 0 ? (
                                      <p className="mt-1 line-clamp-2 text-rose-700 text-xs">
                                        错误原因：{job.errors[job.errors.length - 1].message}
                                      </p>
                                    ) : null}
                                  </div>
                                  <div className="min-w-28 text-right">
                                    <p className="font-mono text-sm">
                                      {job.progress}%
                                    </p>
                                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                                      <div
                                        className={`h-full transition-all ${meta.cardBarClass}`}
                                        style={{
                                          width: `${Math.min(
                                            100,
                                            Math.max(0, job.progress)
                                          )}%`,
                                        }}
                                      />
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-3 flex flex-wrap gap-2">
                                  <Button
                                    onClick={() =>
                                      onSelectJob(job.jobId, "detail")
                                    }
                                    size="sm"
                                    variant="outline"
                                  >
                                    查看详情
                                  </Button>
                                  <Button
                                    onClick={() =>
                                      onSelectJob(job.jobId, "events")
                                    }
                                    size="sm"
                                    variant="outline"
                                  >
                                    查看事件
                                  </Button>
                                  <Button
                                    onClick={() => onCancel(job.jobId)}
                                    size="sm"
                                    variant="outline"
                                  >
                                    取消
                                  </Button>
                                  <Button
                                    onClick={() => onRetry(job.jobId)}
                                    size="sm"
                                    variant="outline"
                                  >
                                    重试
                                  </Button>
                                </div>
                              </article>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-3 rounded-md border border-dashed border-border/60 px-3 py-4 text-center text-muted-foreground text-xs">
                            当前没有{meta.statusLabel}任务。
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent className="overflow-auto p-4" value="detail">
              {selectedJob ? (
                <div className="space-y-3">
                  <section className="rounded-xl border border-border/70 bg-muted/20 p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-medium text-sm">任务进度概览</h3>
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 font-medium text-xs ${
                          JOB_STATE_META[selectedJob.state].badgeClass
                        }`}
                      >
                        {JOB_STATE_META[selectedJob.state].statusLabel}
                      </span>
                    </div>
                    <div className="mb-3">
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          当前阶段：{selectedJob.stage} · 当前工具：
                          {selectedJob.currentTool ?? "-"}
                        </span>
                        <span className="font-medium">
                          {selectedJob.progress}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full transition-all ${
                            JOB_STATE_META[selectedJob.state].cardBarClass
                          }`}
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(0, selectedJob.progress)
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
                      <p className="text-muted-foreground">
                        任务ID：{selectedJob.jobId}
                      </p>
                      <p className="text-muted-foreground">
                        队列位：{selectedJob.queuePosition}
                      </p>
                      <p className="text-muted-foreground">
                        创建时间：
                        {new Date(selectedJob.createdAt).toLocaleString()}
                      </p>
                      <p className="text-muted-foreground">
                        更新时间：
                        {new Date(selectedJob.updatedAt).toLocaleString()}
                      </p>
                      <p className="break-all text-muted-foreground md:col-span-2">
                        输出视频：{selectedJob.artifacts?.videoPath ?? "-"}
                      </p>
                      <p className="break-all text-muted-foreground md:col-span-2">
                        Manifest：{selectedJob.artifacts?.manifestPath ?? "-"}
                      </p>
                      <p className="break-all text-muted-foreground md:col-span-2">
                        流程语音：{generatedVoiceAudioPath ?? "-"}
                      </p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 border-border/60 border-t pt-3">
                      <Button
                        disabled={!canRetrySelectedJob}
                        onClick={() => onRetry(selectedJob.jobId)}
                        size="sm"
                        variant="outline"
                      >
                        重试任务
                      </Button>
                      <Button
                        disabled={!canCancelSelectedJob}
                        onClick={() => onCancel(selectedJob.jobId)}
                        size="sm"
                        variant="outline"
                      >
                        取消任务
                      </Button>
                      <Button
                        onClick={() => onSelectJob(selectedJob.jobId, "events")}
                        size="sm"
                        variant="outline"
                      >
                        查看完整事件流
                      </Button>
                    </div>
                    {selectedJob.errors.length > 0 ? (
                      <div className="mt-3 rounded-md border border-rose-300/70 bg-rose-50/60 p-3">
                        <p className="font-medium text-rose-800 text-xs">
                          错误原因（{selectedJob.errors.length}）
                        </p>
                        <ul className="mt-2 space-y-1">
                          {selectedJob.errors.map((error, index) => (
                            <li
                              className="break-all text-rose-900 text-xs"
                              key={`${error.code}-${index}`}
                            >
                              [{error.code}] {error.message}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {selectedJob.warnings.length > 0 ? (
                      <div className="mt-3 rounded-md border border-amber-300/70 bg-amber-50/60 p-3">
                        <p className="font-medium text-amber-800 text-xs">
                          过程告警（{selectedJob.warnings.length}）
                        </p>
                        <ul className="mt-2 space-y-1">
                          {selectedJob.warnings.map((warning, index) => (
                            <li
                              className="break-all text-amber-900 text-xs"
                              key={`${warning.code}-${index}`}
                            >
                              [{warning.code}] {warning.message}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </section>

                  <section className="rounded-xl border border-border/70 bg-muted/20 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="font-medium text-sm">每一步详细产出</h3>
                      <span className="text-muted-foreground text-xs">
                        {stepOutputs?.steps.length ?? 0} 个阶段
                      </span>
                    </div>

                    {stageOutputs.length > 0 ? (
                      <Tabs
                        className="flex min-h-0 flex-col gap-3"
                        onValueChange={setActiveOutputStage}
                        value={activeOutputStage || stageOutputs[0]?.stage}
                      >
                        <div className="overflow-x-auto">
                          <TabsList className="inline-flex min-w-max gap-1">
                            {stageOutputs.map((step: StageOutputRow) => (
                              <TabsTrigger key={step.stage} value={step.stage}>
                                {step.title}
                              </TabsTrigger>
                            ))}
                          </TabsList>
                        </div>

                        {stageOutputs.map((step: StageOutputRow) => (
                          <TabsContent
                            className="mt-0 rounded-lg border border-border/60 bg-background/50 p-3"
                            key={step.stage}
                            value={step.stage}
                          >
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <p className="font-medium text-sm">
                                {step.title}
                                {step.stage === selectedJob.stage
                                  ? "（当前）"
                                  : ""}
                              </p>
                              <span className="text-muted-foreground text-xs">
                                {step.exists ? "已产出" : "待产出"}
                              </span>
                            </div>
                            <div className="mb-2 grid grid-cols-1 gap-1 rounded-md border border-border/50 bg-muted/30 p-2 text-xs md:grid-cols-2">
                              <p className="break-all text-muted-foreground">
                                阶段ID：{step.stage}
                              </p>
                              <p className="text-muted-foreground">
                                来源：{step.source}
                              </p>
                              <p className="break-all text-muted-foreground md:col-span-2">
                                产出文件：{step.outputPath}
                              </p>
                            </div>

                            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-border/50 bg-muted/40 p-2 text-xs leading-relaxed">
                              {step.content}
                            </pre>

                            {step.stage === "voice_clone" ? (
                              <div className="mt-3 space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
                                <div className="space-y-1 rounded-md border border-border/50 bg-background/50 p-2">
                                  <p className="text-muted-foreground text-xs">
                                    流程生成语音（API）：{" "}
                                    {generatedVoiceAudioPath ?? "未生成"}
                                  </p>
                                  {generatedVoiceAudioUrl ? (
                                    <audio
                                      className="w-full"
                                      controls
                                      preload="metadata"
                                      src={generatedVoiceAudioUrl}
                                    />
                                  ) : null}
                                </div>
                                {selectedJob.request.voiceId ? (
                                  <>
                                    <label className="field-label">
                                      <span>试听文本</span>
                                      <textarea
                                        className="field-input min-h-20"
                                        onChange={(event) =>
                                          setVoicePreviewText(
                                            event.target.value
                                          )
                                        }
                                        value={voicePreviewText}
                                      />
                                    </label>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Button
                                        disabled={isGeneratingVoicePreview}
                                        onClick={() =>
                                          onGenerateJobVoicePreview(
                                            selectedJob.request
                                              .voiceId as string
                                          )
                                        }
                                        size="sm"
                                        type="button"
                                      >
                                        {isGeneratingVoicePreview
                                          ? "生成中..."
                                          : "生成试听（缓存）"}
                                      </Button>
                                      {voicePreviewUpdatedAt ? (
                                        <span className="text-muted-foreground text-xs">
                                          缓存时间：
                                          {new Date(
                                            voicePreviewUpdatedAt
                                          ).toLocaleString()}
                                        </span>
                                      ) : (
                                        <span className="text-muted-foreground text-xs">
                                          当前暂无缓存试听
                                        </span>
                                      )}
                                    </div>
                                    {voicePreviewError ? (
                                      <p className="text-destructive text-xs">
                                        {voicePreviewError}
                                      </p>
                                    ) : null}
                                    {voicePreviewUrl ? (
                                      <audio
                                        className="w-full"
                                        controls
                                        preload="metadata"
                                        src={voicePreviewUrl}
                                      />
                                    ) : null}
                                  </>
                                ) : (
                                  <p className="text-muted-foreground text-xs">
                                    本任务未设置 voiceId，无法生成语音试听。
                                  </p>
                                )}
                              </div>
                            ) : null}
                          </TabsContent>
                        ))}
                      </Tabs>
                    ) : (
                      <div className="rounded-md border border-border/70 border-dashed px-3 py-6 text-center text-muted-foreground text-xs">
                        任务刚创建时可能还没有阶段产出，稍后会自动刷新。
                      </div>
                    )}
                  </section>
                </div>
              ) : (
                <div className="rounded-lg border border-border/70 border-dashed px-4 py-10 text-center text-muted-foreground text-sm">
                  请先在“任务队列”页签中选择任务。
                </div>
              )}
            </TabsContent>

            <TabsContent className="overflow-auto p-4" value="events">
              {events.length > 0 ? (
                <ul className="space-y-1 text-sm">
                  {events.map((event) => (
                    <li
                      className="rounded-md border border-border/70 bg-muted/25 px-2 py-1.5"
                      key={event.id}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-muted-foreground">
                          {new Date(event.createdAt).toLocaleTimeString()}
                        </span>
                        <span>{event.type}</span>
                        {event.stage ? (
                          <span className="rounded bg-background/60 px-1.5 py-0.5 text-xs">
                            阶段 {event.stage}
                          </span>
                        ) : null}
                        {typeof event.progress === "number" ? (
                          <span className="rounded bg-background/60 px-1.5 py-0.5 text-xs">
                            进度 {event.progress}%
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1">{event.message}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-lg border border-border/70 border-dashed px-4 py-10 text-center text-muted-foreground text-sm">
                  {selectedJobId
                    ? "当前任务暂无事件。"
                    : "请先选择任务后再查看事件。"}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </section>
    </div>
  );
}

export const Route = createFileRoute("/jobs")({
  component: JobsPage,
});
