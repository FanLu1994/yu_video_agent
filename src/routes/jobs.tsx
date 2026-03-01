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
  getAgentQueueSummary,
  listAgentJobs,
  retryAgentJob,
} from "@/actions/agent";
import { getAgentConfig } from "@/actions/agent-config";
import { listProviders } from "@/actions/provider";
import { pickLocalFiles } from "@/actions/shell";
import { listVoiceProfiles } from "@/actions/voice-clone";
import {
  loadVoiceNameOverrides,
  resolveVoiceDisplayName,
} from "@/actions/voice-display-name";
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

function isSpeechModel(model: string) {
  return model.trim().startsWith("speech-");
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

    if (selectedJobId && activeTab === "events") {
      const jobEvents = await getAgentJobEvents(selectedJobId);
      setEvents(jobEvents);
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
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          voiceId: event.target.value,
                        }))
                      }
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
                    <Button asChild className="ml-1 h-6 px-2 text-xs" size="sm" variant="ghost">
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
              <div className="space-y-2">
                {jobs.map((job) => (
                  <article
                    className={`rounded-lg border p-3 ${
                      selectedJobId === job.jobId
                        ? "border-primary/50 bg-primary/10"
                        : "border-border/70 bg-muted/20"
                    }`}
                    key={job.jobId}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm">
                          {job.jobId.slice(0, 12)}...
                        </p>
                        <p className="mt-1 text-muted-foreground text-xs">
                          状态：{job.state} · 阶段：{job.stage} · 队列位：
                          {job.queuePosition}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          更新：{new Date(job.updatedAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="min-w-28 text-right">
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

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        onClick={() => onSelectJob(job.jobId, "detail")}
                        size="sm"
                        variant="outline"
                      >
                        查看详情
                      </Button>
                      <Button
                        onClick={() => onSelectJob(job.jobId, "events")}
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

                {jobs.length === 0 ? (
                  <div className="rounded-lg border border-border/70 border-dashed px-4 py-10 text-center text-muted-foreground text-sm">
                    暂无任务。
                  </div>
                ) : null}
              </div>
            </TabsContent>

            <TabsContent className="overflow-auto p-4" value="detail">
              {selectedJob ? (
                <div className="space-y-3">
                  <div className="rounded-md border border-border/70 bg-muted/20 p-3">
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-medium">进度</span>
                      <span>{selectedJob.progress}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{
                          width: `${Math.min(100, Math.max(0, selectedJob.progress))}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div className="rounded-md border border-border/70 bg-muted/20 p-3 text-sm">
                      <p className="text-muted-foreground">任务 ID</p>
                      <p className="break-all font-medium">
                        {selectedJob.jobId}
                      </p>
                    </div>
                    <div className="rounded-md border border-border/70 bg-muted/20 p-3 text-sm">
                      <p className="text-muted-foreground">当前状态</p>
                      <p className="font-medium">{selectedJob.state}</p>
                    </div>
                    <div className="rounded-md border border-border/70 bg-muted/20 p-3 text-sm">
                      <p className="text-muted-foreground">当前阶段</p>
                      <p className="font-medium">{selectedJob.stage}</p>
                    </div>
                    <div className="rounded-md border border-border/70 bg-muted/20 p-3 text-sm">
                      <p className="text-muted-foreground">当前工具</p>
                      <p className="font-medium">
                        {selectedJob.currentTool ?? "-"}
                      </p>
                    </div>
                    <div className="rounded-md border border-border/70 bg-muted/20 p-3 text-sm">
                      <p className="text-muted-foreground">创建时间</p>
                      <p className="font-medium">
                        {new Date(selectedJob.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-md border border-border/70 bg-muted/20 p-3 text-sm">
                      <p className="text-muted-foreground">更新时间</p>
                      <p className="font-medium">
                        {new Date(selectedJob.updatedAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-md border border-border/70 bg-muted/20 p-3 text-sm md:col-span-2">
                      <p className="text-muted-foreground">输出视频路径</p>
                      <p className="break-all font-medium">
                        {selectedJob.artifacts?.videoPath ?? "-"}
                      </p>
                    </div>
                    <div className="rounded-md border border-border/70 bg-muted/20 p-3 text-sm md:col-span-2">
                      <p className="text-muted-foreground">Manifest 路径</p>
                      <p className="break-all font-medium">
                        {selectedJob.artifacts?.manifestPath ?? "-"}
                      </p>
                    </div>
                  </div>
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
                      <span className="mr-2 text-muted-foreground">
                        {new Date(event.createdAt).toLocaleTimeString()}
                      </span>
                      <span className="mr-2">{event.type}</span>
                      <span>{event.message}</span>
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
