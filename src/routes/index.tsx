import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AudioLines,
  Bot,
  CirclePlus,
  Film,
  FolderOpen,
  HelpCircle,
  Layers3,
  Play,
  Sliders,
  SlidersHorizontal,
} from "lucide-react";
import {
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  createAgentJob,
  getAgentQueueSummary,
  listAgentJobs,
} from "@/actions/agent";
import { getAgentConfig } from "@/actions/agent-config";
import { getAppVersion } from "@/actions/app";
import { listProviders } from "@/actions/provider";
import { pickLocalFiles } from "@/actions/shell";
import { listVoiceProfiles } from "@/actions/voice-clone";
import {
  loadVoiceNameOverrides,
  resolveVoiceDisplayName,
} from "@/actions/voice-display-name";
import { Button } from "@/components/ui/button";
import { RemotionBestPracticesPanel } from "@/components/remotion-best-practices-panel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

const DEFAULT_FORM: JobFormState = {
  providerId: "",
  model: "",
  voiceProviderId: "",
  voiceModel: "",
  voiceId: "",
  localFilesText: "",
  articleUrlsText: "",
};

function isSpeechModel(model: string) {
  return model.trim().startsWith("speech-");
}

function HomePage() {
  const [_appVersion, setAppVersion] = useState("0.0.0");
  const [, startGetAppVersion] = useTransition();

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
  const [queueSummary, setQueueSummary] = useState<
    Awaited<ReturnType<typeof getAgentQueueSummary>> | undefined
  >(undefined);
  const [form, setForm] = useState<JobFormState>(DEFAULT_FORM);
  const [message, setMessage] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isDraggingLocalFiles, setIsDraggingLocalFiles] = useState(false);
  const [showUsageDialog, setShowUsageDialog] = useState(false);
  const [showNewTaskDialog, setShowNewTaskDialog] = useState(false);
  const [showRemotionGuideDialog, setShowRemotionGuideDialog] = useState(false);
  const [isPending, startTransition] = useTransition();

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

  useEffect(
    () => startGetAppVersion(() => getAppVersion().then(setAppVersion)),
    []
  );

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

  const refresh = useCallback(async () => {
    const [providerRows, config, voiceRows, jobRows, summary] = await Promise.all([
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
  }, []);

  useEffect(() => {
    startTransition(() => {
      refresh().catch((error) => {
        setMessage(error instanceof Error ? error.message : "加载失败。");
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
    if (!(form.providerId && form.model)) {
      setMessage("请填写 Agent 模型服务和 Agent 模型。");
      return;
    }

    if (form.voiceId && !(form.voiceProviderId && form.voiceModel)) {
      setMessage("选择音色时，请填写语音模型服务和语音模型。");
      return;
    }

    const localFiles = form.localFilesText
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);

    const articleUrls = form.articleUrlsText
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);

    if (localFiles.length === 0 && articleUrls.length === 0) {
      setMessage("请至少填写本地文件或文章URL。");
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

    setIsCreating(true);
    try {
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

      setMessage(`任务已创建：${created.jobId.slice(0, 12)}...`);
      setForm(DEFAULT_FORM);
      setShowNewTaskDialog(false);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "创建任务失败。");
    } finally {
      setIsCreating(false);
    }
  }

  function getJobStatusColor(state: string) {
    switch (state) {
      case "completed":
        return "text-emerald-600 dark:text-emerald-400";
      case "failed":
        return "text-destructive";
      case "running":
        return "text-primary";
      case "queued":
        return "text-muted-foreground";
      default:
        return "text-muted-foreground";
    }
  }

  function getJobStatusText(state: string) {
    switch (state) {
      case "completed":
        return "已完成";
      case "failed":
        return "失败";
      case "running":
        return "运行中";
      case "queued":
        return "排队中";
      default:
        return state;
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
            <h1 className="font-semibold text-lg">视频 Agent 工作台</h1>
            <p className="text-muted-foreground text-sm">
              快速创建任务 · 查看历史记录 · 跟踪执行进度
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                setMessage("");
                setShowNewTaskDialog(true);
              }}
              size="sm"
              variant={showNewTaskDialog ? "default" : "outline"}
            >
              <CirclePlus className="h-4 w-4" />
              新建任务
            </Button>
            <Button
              onClick={() => setShowUsageDialog(true)}
              size="sm"
              variant="outline"
            >
              <HelpCircle className="h-4 w-4" />
              使用指南
            </Button>
            <Button
              onClick={() => setShowRemotionGuideDialog(true)}
              size="sm"
              variant="outline"
            >
              <Film className="h-4 w-4" />
              Remotion 规范
            </Button>
          </div>
        </header>

        <div className="app-panel-body p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-medium text-sm">
              <Layers3 className="h-4 w-4" />
              历史任务
            </h3>
            {queueSummary ? (
              <div className="flex gap-3 text-muted-foreground text-xs">
                <span>排队 {queueSummary.counts.queued}</span>
                <span>运行 {queueSummary.counts.running}</span>
                <span>完成 {queueSummary.counts.completed}</span>
                <span>失败 {queueSummary.counts.failed}</span>
              </div>
            ) : null}
          </div>

          {message && !showNewTaskDialog ? (
            <div className="mb-3 rounded-md border border-border/80 bg-muted/30 px-3 py-2 text-muted-foreground text-xs">
              {message}
            </div>
          ) : null}

          <div className="space-y-2">
            {jobs.map((job) => (
              <article
                className="rounded-lg border border-border/70 bg-card/50 p-3 transition hover:bg-card/70"
                key={job.jobId}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium font-mono text-sm">
                        {job.jobId.slice(0, 12)}
                      </p>
                      <span
                        className={`font-medium text-xs ${getJobStatusColor(job.state)}`}
                      >
                        {getJobStatusText(job.state)}
                      </span>
                    </div>
                    <p className="mt-1 text-muted-foreground text-xs">
                      阶段：{job.stage}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {new Date(job.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="min-w-24 text-right">
                    <p className="font-mono text-sm">{job.progress}%</p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{
                          width: `${Math.min(100, Math.max(0, job.progress))}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="ghost">
                    <Link
                      state={{ selectedJobId: job.jobId } as never}
                      to="/jobs"
                    >
                      查看详情
                    </Link>
                  </Button>
                </div>
              </article>
            ))}

            {jobs.length === 0 ? (
              <div className="rounded-lg border border-border/70 border-dashed px-4 py-12 text-center">
                <Layers3 className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
                <p className="mb-2 text-muted-foreground text-sm">
                  暂无任务记录
                </p>
                <p className="mb-4 text-muted-foreground text-xs">
                  点击"新建任务"按钮创建您的第一个任务
                </p>
                <Button
                  onClick={() => {
                    setMessage("");
                    setShowNewTaskDialog(true);
                  }}
                  size="sm"
                  variant="outline"
                >
                  <CirclePlus className="h-4 w-4" />
                  新建任务
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        {/* 快捷操作区域 */}
        <div className="border-border/70 border-t px-4 py-2">
          <div className="flex flex-wrap gap-2 text-muted-foreground text-xs">
            <Button asChild size="sm" variant="ghost">
              <Link to="/providers">
                <SlidersHorizontal className="h-3 w-3" />
                模型配置
              </Link>
            </Button>
            <span>·</span>
            <Button asChild size="sm" variant="ghost">
              <Link to="/agent-config">
                <Sliders className="h-3 w-3" />
                Agent 配置
              </Link>
            </Button>
            <span>·</span>
            <Button asChild size="sm" variant="ghost">
              <Link to="/voices">
                <AudioLines className="h-3 w-3" />
                音色克隆
              </Link>
            </Button>
            <span>·</span>
            <Button asChild size="sm" variant="ghost">
              <Link to="/jobs">
                <Layers3 className="h-3 w-3" />
                任务队列
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* 新建任务弹窗 */}
      <Dialog onOpenChange={setShowNewTaskDialog} open={showNewTaskDialog}>
        <DialogContent
          className="max-h-[88vh] max-w-3xl overflow-auto border-border/80 p-0"
          onClose={() => {
            setShowNewTaskDialog(false);
          }}
        >
          <DialogHeader className="border-border/70 border-b bg-muted/20 pb-4">
            <DialogTitle className="flex items-center gap-2">
              <CirclePlus className="h-5 w-5" />
              新建任务
            </DialogTitle>
            <DialogDescription>
              填写内容来源并选择模型，系统会自动加入任务队列。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 p-6">
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
            </div>

            <label className="field-label">
              <span>音色（可选）</span>
              <select
                className="field-input"
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    voiceId: event.target.value,
                  }))
                }
                value={form.voiceId}
              >
                <option value="">不使用音色</option>
                {voices.map((voice) => (
                  <option key={voice.voiceId} value={voice.voiceId}>
                    {voice.displayName}
                  </option>
                ))}
              </select>
            </label>

            <div className="field-grid">
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
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="field-label">
                <div className="flex items-center justify-between gap-2">
                  <span>本地文件（每行一个，可拖拽）</span>
                  <Button
                    disabled={isCreating || isPending}
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
                  className={`field-input min-h-28 transition-colors ${
                    isDraggingLocalFiles ? "border-primary/70 bg-primary/5" : ""
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
                  className="field-input min-h-28"
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      articleUrlsText: event.target.value,
                    }))
                  }
                  placeholder={"https://example.com/a\nhttps://example.com/b"}
                  value={form.articleUrlsText}
                />
              </label>
            </div>

            <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-muted-foreground text-xs">
              Agent 的 Prompt / Runtime / Remotion 参数已迁移到侧边栏的
              <Button asChild className="ml-1 h-6 px-2 text-xs" size="sm" variant="ghost">
                <Link to="/agent-config">Agent 配置</Link>
              </Button>
              页面统一维护。
            </div>

            {message ? (
              <div className="rounded-md border border-border/80 bg-muted/30 px-3 py-2 text-muted-foreground text-xs">
                {message}
              </div>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2 border-border/70 border-t pt-4">
              <Button
                disabled={isCreating || isPending}
                onClick={() => {
                  setForm(DEFAULT_FORM);
                  setShowNewTaskDialog(false);
                  setMessage("");
                }}
                size="sm"
                variant="outline"
              >
                取消
              </Button>
              <Button
                disabled={isCreating || isPending}
                onClick={onCreateJob}
                size="sm"
              >
                {isCreating ? (
                  <>
                    <Play className="h-4 w-4" />
                    创建中...
                  </>
                ) : (
                  <>
                    <CirclePlus className="h-4 w-4" />
                    创建任务
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 使用指南弹窗 */}
      <Dialog onOpenChange={setShowUsageDialog} open={showUsageDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5" />
              使用指南
            </DialogTitle>
            <DialogDescription>
              快速了解如何使用视频 Agent 工作台
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="rounded-lg border border-border/70 bg-muted/25 p-3">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-card">
                  <SlidersHorizontal className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm">步骤 1：配置模型服务</p>
                  <p className="mt-1 text-muted-foreground text-xs">
                    进入模型配置页面，添加并测试您的模型服务（如 MiniMax）。
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border/70 bg-muted/25 p-3">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-card">
                  <AudioLines className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm">
                    步骤 2：创建音色（可选）
                  </p>
                  <p className="mt-1 text-muted-foreground text-xs">
                    如需语音输出，在音色克隆页导入样本音频，完成克隆。
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border/70 bg-muted/25 p-3">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-card">
                  <CirclePlus className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm">步骤 3：创建任务</p>
                  <p className="mt-1 text-muted-foreground text-xs">
                    点击"新建任务"按钮，填写本地文件或文章
                    URL，选择模型和音色（可选），然后创建任务。
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border/70 bg-muted/25 p-3">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-card">
                  <Layers3 className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm">步骤 4：跟踪进度</p>
                  <p className="mt-1 text-muted-foreground text-xs">
                    在历史任务列表中查看任务状态和进度，或点击"查看详情"进入任务队列页面查看更多信息。
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-start gap-3">
                <Bot className="mt-0.5 h-4 w-4 text-primary" />
                <div className="min-w-0">
                  <p className="font-medium text-sm">支持的内容来源</p>
                  <p className="mt-1 text-muted-foreground text-xs">
                    • 本地文件：支持 .md、.pdf、.txt 等格式，每行一个文件路径
                    <br />• 文章 URL：支持网页文章链接，Agent
                    会自动抓取并处理内容
                  </p>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={setShowRemotionGuideDialog}
        open={showRemotionGuideDialog}
      >
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Film className="h-5 w-5" />
              Remotion Best Practices（内嵌）
            </DialogTitle>
            <DialogDescription>
              内容来自 remotion-best-practices skill，已内置到应用用于生成视频时参考。
            </DialogDescription>
          </DialogHeader>
          <RemotionBestPracticesPanel />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const Route = createFileRoute("/")({
  component: HomePage,
});
