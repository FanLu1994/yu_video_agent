import { createFileRoute } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { listProviders } from "@/actions/provider";
import { createVoiceClone, listVoiceProfiles } from "@/actions/voice-clone";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface VoiceCloneFormState {
  cloneAudioPath: string;
  model: string;
  promptAudioPath: string;
  promptText: string;
  providerId: string;
  sampleText: string;
  voiceId: string;
}

type VoicesTab = "create" | "archive";

function tryReadElectronFilePath(input: HTMLInputElement) {
  const file = input.files?.[0];
  if (!file) {
    return "";
  }

  const withPath = file as File & { path?: string };
  return withPath.path ?? "";
}

const DEFAULT_SAMPLE_TEXT =
  "这是用于音色克隆试听的示例文本。系统会用它生成一段试听语音。";

function VoiceClonePage() {
  const [providers, setProviders] = useState<
    Awaited<ReturnType<typeof listProviders>>
  >([]);
  const [voices, setVoices] = useState<
    Awaited<ReturnType<typeof listVoiceProfiles>>
  >([]);
  const [form, setForm] = useState<VoiceCloneFormState>({
    providerId: "minimax",
    voiceId: "",
    cloneAudioPath: "",
    promptAudioPath: "",
    promptText: "",
    sampleText: DEFAULT_SAMPLE_TEXT,
    model: "speech-2.8-hd",
  });
  const [activeTab, setActiveTab] = useState<VoicesTab>("create");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const availableProviders = useMemo(
    () => providers.filter((provider) => provider.enabled),
    [providers]
  );

  useEffect(() => {
    const selectedProvider = availableProviders.find(
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
  }, [availableProviders, form.providerId]);

  const refreshAll = useCallback(async () => {
    const [providerRows, voiceRows] = await Promise.all([
      listProviders(),
      listVoiceProfiles(),
    ]);
    setProviders(providerRows);
    setVoices(voiceRows);

    const minimaxProvider = providerRows.find(
      (provider) => provider.id === "minimax"
    );
    if (minimaxProvider) {
      setForm((prev) =>
        prev.providerId ? prev : { ...prev, providerId: "minimax" }
      );
    }
  }, []);

  useEffect(() => {
    startTransition(() => {
      refreshAll().catch((error) => {
        setMessage(
          error instanceof Error ? error.message : "加载音色列表失败。"
        );
      });
    });
  }, [refreshAll]);

  async function onClone() {
    if (
      !(
        form.providerId &&
        form.voiceId &&
        form.cloneAudioPath &&
        form.sampleText &&
        form.model
      )
    ) {
      setMessage("请填写 providerId、voiceId、克隆音频路径、试听文本、模型。");
      return;
    }

    try {
      await createVoiceClone({
        providerId: form.providerId,
        voiceId: form.voiceId,
        cloneAudioPath: form.cloneAudioPath,
        promptAudioPath: form.promptAudioPath || undefined,
        promptText: form.promptText || undefined,
        sampleText: form.sampleText,
        model: form.model,
      });

      setMessage("音色克隆成功。");
      setForm((prev) => ({
        ...prev,
        voiceId: "",
        promptAudioPath: "",
        promptText: "",
      }));
      await refreshAll();
      setActiveTab("archive");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "音色克隆失败。");
    }
  }

  return (
    <div className="app-page">
      <section className="app-panel min-h-0 xl:col-span-12">
        <header className="app-panel-header">
          <div>
            <h1 className="font-semibold text-base">音色克隆工作区</h1>
            <p className="text-muted-foreground text-xs">
              通过页签切换“克隆创建”和“音色档案”。
            </p>
          </div>
          <Button onClick={refreshAll} variant="outline">
            刷新档案
          </Button>
        </header>

        <div className="app-panel-body !p-0">
          <Tabs
            className="flex h-full min-h-0 flex-col"
            onValueChange={(value) => setActiveTab(value as VoicesTab)}
            value={activeTab}
          >
            <div className="border-border/70 border-b px-4 py-2">
              <TabsList>
                <TabsTrigger value="create">克隆创建</TabsTrigger>
                <TabsTrigger value="archive">音色档案</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent className="overflow-auto p-4" value="create">
              <div className="space-y-4">
                <div className="field-grid">
                  <label className="field-label">
                    <span>模型服务</span>
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
                      {availableProviders.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.displayName} ({provider.id})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">
                    <span>模型</span>
                    <input
                      className="field-input"
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          model: event.target.value,
                        }))
                      }
                      placeholder="speech-2.8-hd"
                      value={form.model}
                    />
                  </label>
                  <label className="field-label md:col-span-2">
                    <span>音色 ID</span>
                    <input
                      className="field-input"
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          voiceId: event.target.value,
                        }))
                      }
                      placeholder="my_voice_001"
                      value={form.voiceId}
                    />
                  </label>
                  <label className="field-label">
                    <span>克隆音频</span>
                    <input
                      accept=".mp3,.m4a,.wav"
                      className="field-input"
                      onChange={(event) => {
                        const path = tryReadElectronFilePath(
                          event.currentTarget
                        );
                        setForm((prev) => ({ ...prev, cloneAudioPath: path }));
                      }}
                      type="file"
                    />
                    <code className="mono-hint">
                      {form.cloneAudioPath || "未选择文件"}
                    </code>
                    <input
                      className="field-input"
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          cloneAudioPath: event.target.value,
                        }))
                      }
                      placeholder="或手动粘贴绝对路径"
                      value={form.cloneAudioPath}
                    />
                  </label>
                  <label className="field-label">
                    <span>参考音频（可选）</span>
                    <input
                      accept=".mp3,.m4a,.wav"
                      className="field-input"
                      onChange={(event) => {
                        const path = tryReadElectronFilePath(
                          event.currentTarget
                        );
                        setForm((prev) => ({ ...prev, promptAudioPath: path }));
                      }}
                      type="file"
                    />
                    <code className="mono-hint">
                      {form.promptAudioPath || "未选择文件"}
                    </code>
                    <input
                      className="field-input"
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          promptAudioPath: event.target.value,
                        }))
                      }
                      placeholder="或手动粘贴绝对路径"
                      value={form.promptAudioPath}
                    />
                  </label>
                  <label className="field-label md:col-span-2">
                    <span>参考文本（可选）</span>
                    <input
                      className="field-input"
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          promptText: event.target.value,
                        }))
                      }
                      value={form.promptText}
                    />
                  </label>
                  <label className="field-label md:col-span-2">
                    <span>试听文本</span>
                    <textarea
                      className="field-input min-h-24"
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          sampleText: event.target.value,
                        }))
                      }
                      value={form.sampleText}
                    />
                  </label>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button disabled={isPending} onClick={onClone}>
                    开始克隆
                  </Button>
                  <Button
                    onClick={() => {
                      setForm((prev) => ({
                        ...prev,
                        voiceId: "",
                        cloneAudioPath: "",
                        promptAudioPath: "",
                        promptText: "",
                      }));
                    }}
                    variant="outline"
                  >
                    清空输入
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent className="overflow-auto p-4" value="archive">
              <div className="space-y-2">
                {voices.map((voice) => (
                  <article
                    className="rounded-lg border border-border/70 bg-muted/20 p-3"
                    key={voice.voiceId}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-sm">
                          {voice.voiceId}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          服务：{voice.providerId} · 状态：{voice.status}
                        </p>
                        <p className="mt-1 text-muted-foreground text-xs">
                          创建：{new Date(voice.createdAt).toLocaleString()}
                        </p>
                      </div>
                      {voice.previewAudioUrl ? (
                        <a
                          className="rounded-md border border-border/80 px-2 py-1 text-xs transition hover:bg-muted/60"
                          href={voice.previewAudioUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          打开试听
                        </a>
                      ) : null}
                    </div>
                    <p className="mt-2 text-muted-foreground text-xs">源音频</p>
                    <code className="mono-hint mt-1 block break-all">
                      {voice.sourceAudioPath}
                    </code>
                  </article>
                ))}
                {voices.length === 0 ? (
                  <div className="rounded-lg border border-border/70 border-dashed px-4 py-10 text-center text-muted-foreground text-sm">
                    暂无音色档案。
                  </div>
                ) : null}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {message ? (
          <div className="border-border/70 border-t px-4 py-2 text-muted-foreground text-sm">
            {message}
          </div>
        ) : null}
      </section>
    </div>
  );
}

export const Route = createFileRoute("/voices")({
  component: VoiceClonePage,
});
