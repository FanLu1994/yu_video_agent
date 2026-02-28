import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  cancelAgentJob,
  createAgentJob,
  getAgentJobEvents,
  getAgentQueueSummary,
  listAgentJobs,
  retryAgentJob,
} from "@/actions/agent";
import { listProviders } from "@/actions/provider";
import { listVoiceProfiles } from "@/actions/voice-clone";
import NavigationMenu from "@/components/navigation-menu";
import { Button } from "@/components/ui/button";

interface JobFormState {
  providerId: string;
  model: string;
  voiceId: string;
  localFilesText: string;
  articleUrlsText: string;
}

function JobsPage() {
  const [providers, setProviders] = useState<
    Awaited<ReturnType<typeof listProviders>>
  >([]);
  const [voices, setVoices] = useState<
    Awaited<ReturnType<typeof listVoiceProfiles>>
  >([]);
  const [jobs, setJobs] = useState<Awaited<ReturnType<typeof listAgentJobs>>>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [events, setEvents] = useState<Awaited<ReturnType<typeof getAgentJobEvents>>>([]);
  const [queueSummary, setQueueSummary] = useState<
    Awaited<ReturnType<typeof getAgentQueueSummary>> | undefined
  >(undefined);
  const [form, setForm] = useState<JobFormState>({
    providerId: "minimax",
    model: "gpt-4o-mini",
    voiceId: "",
    localFilesText: "",
    articleUrlsText: "",
  });
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const enabledProviders = useMemo(
    () => providers.filter((provider) => provider.enabled),
    [providers]
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

  async function refresh() {
    const [providerRows, voiceRows, jobRows, summary] = await Promise.all([
      listProviders(),
      listVoiceProfiles(),
      listAgentJobs(),
      getAgentQueueSummary(),
    ]);
    setProviders(providerRows);
    setVoices(voiceRows);
    setJobs(jobRows);
    setQueueSummary(summary);

    if (selectedJobId) {
      const jobEvents = await getAgentJobEvents(selectedJobId);
      setEvents(jobEvents);
    }
  }

  useEffect(() => {
    startTransition(() => {
      refresh().catch((error) => {
        setMessage(error instanceof Error ? error.message : "加载任务失败。");
      });
    });

    const timer = window.setInterval(() => {
      refresh().catch(() => {});
    }, 2000);

    return () => {
      window.clearInterval(timer);
    };
  }, [selectedJobId]);

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

      if (!form.providerId || !form.model) {
        setMessage("请填写 providerId 和 model。");
        return;
      }

      const created = await createAgentJob({
        providerId: form.providerId,
        model: form.model,
        voiceId: form.voiceId || undefined,
        localFiles,
        articleUrls,
      });
      setSelectedJobId(created.jobId);
      setMessage(`任务已创建：${created.jobId}`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "创建任务失败。");
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

  return (
    <>
      <NavigationMenu />
      <div className="h-full overflow-auto p-3">
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
          <section className="rounded-lg border border-border bg-card p-4">
            <h1 className="mb-3 font-semibold text-lg">Agent 任务</h1>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span>模型服务</span>
                <select
                  className="rounded-md border border-input bg-background px-2 py-1"
                  value={form.providerId}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, providerId: event.target.value }))
                  }
                >
                  {enabledProviders.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.displayName} ({provider.id})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span>模型</span>
                <input
                  className="rounded-md border border-input bg-background px-2 py-1"
                  value={form.model}
                  onChange={(event) => setForm((prev) => ({ ...prev, model: event.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm md:col-span-2">
                <span>音色 ID（可选）</span>
                <select
                  className="rounded-md border border-input bg-background px-2 py-1"
                  value={form.voiceId}
                  onChange={(event) => setForm((prev) => ({ ...prev, voiceId: event.target.value }))}
                >
                  <option value="">（不使用）</option>
                  {voices.map((voice) => (
                    <option key={voice.voiceId} value={voice.voiceId}>
                      {voice.voiceId}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span>本地文件（每行一个）</span>
                <textarea
                  className="min-h-24 rounded-md border border-input bg-background px-2 py-1"
                  value={form.localFilesText}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, localFilesText: event.target.value }))
                  }
                  placeholder={"D:\\docs\\input1.md\nD:\\docs\\input2.pdf"}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span>文章 URL（每行一个）</span>
                <textarea
                  className="min-h-24 rounded-md border border-input bg-background px-2 py-1"
                  value={form.articleUrlsText}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, articleUrlsText: event.target.value }))
                  }
                  placeholder={"https://example.com/a\nhttps://example.com/b"}
                />
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <Button disabled={isPending} onClick={onCreateJob}>
                创建任务
              </Button>
            </div>
            {queueSummary ? (
              <p className="mt-3 text-muted-foreground text-sm">
                排队: {queueSummary.counts.queued} | 运行中: {queueSummary.counts.running} |
                已完成: {queueSummary.counts.completed} | 失败: {queueSummary.counts.failed}
              </p>
            ) : null}
            {message ? <p className="mt-2 text-muted-foreground text-sm">{message}</p> : null}
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-3 font-semibold text-base">任务列表</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2 text-left">任务 ID</th>
                    <th className="px-2 py-2 text-left">状态</th>
                    <th className="px-2 py-2 text-left">阶段</th>
                    <th className="px-2 py-2 text-left">进度</th>
                    <th className="px-2 py-2 text-left">队列位置</th>
                    <th className="px-2 py-2 text-left">更新时间</th>
                    <th className="px-2 py-2 text-left">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.jobId} className="border-b border-border/60">
                      <td className="px-2 py-2">
                        <button
                          className="text-left text-primary underline"
                          onClick={async () => {
                            setSelectedJobId(job.jobId);
                            const rows = await getAgentJobEvents(job.jobId);
                            setEvents(rows);
                          }}
                          type="button"
                        >
                          {job.jobId.slice(0, 8)}...
                        </button>
                      </td>
                      <td className="px-2 py-2">{job.state}</td>
                      <td className="px-2 py-2">{job.stage}</td>
                      <td className="px-2 py-2">{job.progress}%</td>
                      <td className="px-2 py-2">{job.queuePosition}</td>
                      <td className="px-2 py-2">{new Date(job.updatedAt).toLocaleString()}</td>
                      <td className="px-2 py-2">
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onCancel(job.jobId)}
                          >
                            取消
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onRetry(job.jobId)}
                          >
                            重试
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {jobs.length === 0 ? (
                    <tr>
                      <td className="px-2 py-6 text-center text-muted-foreground" colSpan={7}>
                        暂无任务。
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-3 font-semibold text-base">
              事件日志 {selectedJobId ? `(${selectedJobId.slice(0, 8)}...)` : ""}
            </h2>
            <div className="max-h-64 overflow-auto rounded-md border border-border p-2">
              {events.length > 0 ? (
                <ul className="space-y-1 text-sm">
                  {events.map((event) => (
                    <li key={event.id} className="rounded bg-muted/50 px-2 py-1">
                      <span className="mr-2 text-muted-foreground">
                        {new Date(event.createdAt).toLocaleTimeString()}
                      </span>
                      <span className="mr-2">{event.type}</span>
                      <span>{event.message}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">未选择任务或暂无事件。</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

export const Route = createFileRoute("/jobs")({
  component: JobsPage,
});
