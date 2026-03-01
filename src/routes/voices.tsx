import { createFileRoute } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { listProviders } from "@/actions/provider";
import { pickAudioFile } from "@/actions/shell";
import {
  createVoiceClone,
  getCachedPreviewVoice,
  listVoiceProfiles,
  synthesizePreviewVoice,
} from "@/actions/voice-clone";
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

type ProviderRow = Awaited<ReturnType<typeof listProviders>>[number];
type VoiceProfileRow = Awaited<ReturnType<typeof listVoiceProfiles>>[number];
type VoicesTab = "create" | "archive";

interface VoicePreviewState {
  text: string;
  previewUrl: string | null;
  isLoading: boolean;
  error: string | null;
}

const DEFAULT_SAMPLE_TEXT =
  "这是用于音色克隆试听的示例文本。系统会用它生成一段试听语音。";
const EMPTY_VTT_TRACK = "data:text/vtt;charset=utf-8,WEBVTT%0A%0A";

interface NormalizedVoiceCloneInput {
  cloneAudioPath: string;
  model: string;
  promptAudioPath: string;
  promptText: string;
  providerId: string;
  sampleText: string;
  voiceId: string;
}

function buildAutoVoiceId() {
  const timestamp = Date.now().toString(36);
  const randomSuffix = Math.floor(Math.random() * 36 ** 4)
    .toString(36)
    .padStart(4, "0");
  return `voice${timestamp}${randomSuffix}`;
}

function normalizeVoiceCloneInput(
  form: VoiceCloneFormState,
  selectedProvider?: ProviderRow
): NormalizedVoiceCloneInput {
  return {
    providerId: form.providerId.trim() || selectedProvider?.id?.trim() || "",
    voiceId: form.voiceId.trim(),
    cloneAudioPath: form.cloneAudioPath.trim(),
    promptAudioPath: form.promptAudioPath.trim(),
    promptText: form.promptText.trim(),
    sampleText: form.sampleText.trim() || DEFAULT_SAMPLE_TEXT,
    model: form.model.trim() || selectedProvider?.model?.trim() || "",
  };
}

function getMissingRequiredFields(input: NormalizedVoiceCloneInput) {
  const missingFields: string[] = [];

  if (!input.providerId) {
    missingFields.push("模型服务");
  }
  if (!input.cloneAudioPath) {
    missingFields.push("克隆音频路径");
  }
  if (!input.sampleText) {
    missingFields.push("试听文本");
  }
  if (!input.model) {
    missingFields.push("模型");
  }

  return missingFields;
}

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
  const [isCloning, setIsCloning] = useState(false);
  const [latestPreview, setLatestPreview] = useState<VoiceProfileRow | null>(
    null
  );
  const [isPending, startTransition] = useTransition();

  // Per-voice preview state
  const [voicePreviewStates, setVoicePreviewStates] = useState<
    Record<string, VoicePreviewState>
  >({});

  const availableProviders = useMemo(
    () => providers.filter((provider) => provider.enabled),
    [providers]
  );

  const selectedProvider = useMemo(
    () =>
      availableProviders.find((provider) => provider.id === form.providerId),
    [availableProviders, form.providerId]
  );

  useEffect(() => {
    if (!selectedProvider) {
      return;
    }
    const providerModel = selectedProvider.model?.trim() ?? "";
    if (!providerModel) {
      return;
    }

    setForm((prev) =>
      prev.model === providerModel ? prev : { ...prev, model: providerModel }
    );
  }, [selectedProvider]);

  const refreshAll = useCallback(async () => {
    const [providerRows, voiceRows] = await Promise.all([
      listProviders(),
      listVoiceProfiles(),
    ]);
    setProviders(providerRows);
    setVoices(voiceRows);

    // 加载缓存的试听信息
    const cachedPreviews: Record<string, VoicePreviewState> = {};
    await Promise.all(
      voiceRows.map(async (voice) => {
        try {
          const cached = await getCachedPreviewVoice(voice.voiceId);
          if (cached) {
            cachedPreviews[voice.voiceId] = {
              text: cached.previewText || "",
              previewUrl: cached.previewAudioUrl || null,
              isLoading: false,
              error: null,
            };
          }
        } catch {
          // 忽略错误，继续处理其他 voice
        }
      })
    );
    setVoicePreviewStates(cachedPreviews);

    const enabledProviders = providerRows.filter(
      (provider) => provider.enabled
    );
    const fallbackProvider =
      enabledProviders.find((provider) => provider.id === "minimax") ??
      enabledProviders[0];

    setForm((prev) => {
      const selectedProvider = enabledProviders.find(
        (provider) => provider.id === prev.providerId
      );
      if (selectedProvider) {
        return prev;
      }
      if (!fallbackProvider) {
        return prev;
      }
      return {
        ...prev,
        providerId: fallbackProvider.id,
        model: fallbackProvider.model,
      };
    });
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

  async function onPickCloneAudioPath() {
    try {
      const selected = await pickAudioFile("选择克隆音频文件");
      if (!selected) {
        return;
      }

      setForm((prev) => ({ ...prev, cloneAudioPath: selected }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "选择音频文件失败。");
    }
  }

  async function onPickPromptAudioPath() {
    try {
      const selected = await pickAudioFile("选择参考音频文件");
      if (!selected) {
        return;
      }

      setForm((prev) => ({ ...prev, promptAudioPath: selected }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "选择音频文件失败。");
    }
  }

  async function onClone() {
    const input = normalizeVoiceCloneInput(form, selectedProvider);
    const voiceId = input.voiceId || buildAutoVoiceId();
    const missingFields = getMissingRequiredFields(input);

    if (missingFields.length > 0) {
      setMessage(`请填写：${missingFields.join("、")}。`);
      return;
    }

    if (
      (input.promptAudioPath && !input.promptText) ||
      (!input.promptAudioPath && input.promptText)
    ) {
      setMessage("参考音频和参考文本需要同时填写，或同时留空。");
      return;
    }

    setIsCloning(true);
    try {
      const createdVoice = await createVoiceClone({
        providerId: input.providerId,
        voiceId,
        cloneAudioPath: input.cloneAudioPath,
        promptAudioPath: input.promptAudioPath || undefined,
        promptText: input.promptText || undefined,
        sampleText: input.sampleText,
        model: input.model,
      });

      setLatestPreview(createdVoice);
      setMessage(`音色克隆成功，voiceId：${voiceId}。`);
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
    } finally {
      setIsCloning(false);
    }
  }

  async function onGeneratePreview(voiceId: string) {
    const state = voicePreviewStates[voiceId];
    if (!state || !state.text.trim()) {
      setVoicePreviewStates((prev) => ({
        ...prev,
        [voiceId]: {
          ...prev[voiceId],
          error: "请输入试听文本",
        },
      }));
      return;
    }

    setVoicePreviewStates((prev) => ({
      ...prev,
      [voiceId]: {
        ...prev[voiceId],
        isLoading: true,
        error: null,
        previewUrl: null,
      },
    }));

    try {
      const result = await synthesizePreviewVoice({
        voiceId,
        text: state.text.trim(),
      });
      setVoicePreviewStates((prev) => ({
        ...prev,
        [voiceId]: {
          ...prev[voiceId],
          isLoading: false,
          previewUrl: result.previewAudioUrl,
        },
      }));
    } catch (error) {
      setVoicePreviewStates((prev) => ({
        ...prev,
        [voiceId]: {
          ...prev[voiceId],
          isLoading: false,
          error: error instanceof Error ? error.message : "生成试听失败",
        },
      }));
    }
  }

  function updatePreviewText(voiceId: string, text: string) {
    setVoicePreviewStates((prev) => ({
      ...prev,
      [voiceId]: {
        ...prev[voiceId],
        text,
        error: null,
      },
    }));
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
          <Button
            disabled={isPending || isCloning}
            onClick={() => {
              startTransition(() => {
                refreshAll().catch((error) => {
                  setMessage(
                    error instanceof Error
                      ? error.message
                      : "加载音色列表失败。"
                  );
                });
              });
            }}
            variant="outline"
          >
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
                    <span>音色 ID（可选）</span>
                    <input
                      className="field-input"
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          voiceId: event.target.value,
                        }))
                      }
                      placeholder="留空自动生成，例如 voicem7x9k2ab12cd"
                      value={form.voiceId}
                    />
                  </label>
                  <label className="field-label md:col-span-2">
                    <span>克隆音频</span>
                    <div className="flex gap-2">
                      <input
                        className="field-input"
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            cloneAudioPath: event.target.value,
                          }))
                        }
                        placeholder="选择文件，或粘贴绝对路径"
                        value={form.cloneAudioPath}
                      />
                      <Button
                        disabled={isPending || isCloning}
                        onClick={onPickCloneAudioPath}
                        type="button"
                        variant="outline"
                      >
                        选择文件
                      </Button>
                    </div>
                    <code className="mono-hint">
                      {form.cloneAudioPath || "未选择文件"}
                    </code>
                  </label>
                  <label className="field-label md:col-span-2">
                    <span>参考音频（可选）</span>
                    <div className="flex gap-2">
                      <input
                        className="field-input"
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            promptAudioPath: event.target.value,
                          }))
                        }
                        placeholder="选择文件，或粘贴绝对路径"
                        value={form.promptAudioPath}
                      />
                      <Button
                        disabled={isPending || isCloning}
                        onClick={onPickPromptAudioPath}
                        type="button"
                        variant="outline"
                      >
                        选择文件
                      </Button>
                    </div>
                    <code className="mono-hint">
                      {form.promptAudioPath || "未选择文件"}
                    </code>
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
                  <Button disabled={isPending || isCloning} onClick={onClone}>
                    开始克隆
                  </Button>
                  <Button
                    disabled={isPending || isCloning}
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

                {latestPreview?.previewAudioUrl ? (
                  <section className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    <p className="font-medium text-sm">
                      最新试听：{latestPreview.voiceId}
                    </p>
                    <audio
                      className="mt-2 w-full"
                      controls
                      preload="none"
                      src={latestPreview.previewAudioUrl}
                    >
                      <track
                        default
                        kind="captions"
                        label="字幕占位"
                        src={EMPTY_VTT_TRACK}
                        srcLang="zh"
                      />
                    </audio>
                  </section>
                ) : null}
              </div>
            </TabsContent>

            <TabsContent className="overflow-auto p-4" value="archive">
              <div className="space-y-2">
                {voices.map((voice) => {
                  const previewState = voicePreviewStates[voice.voiceId];
                  return (
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

                      {/* 试听输入区域 */}
                      <div className="mt-3 space-y-2">
                        <label className="block">
                          <span className="flex items-center justify-between text-muted-foreground text-xs">
                            <span>自定义试听文本</span>
                            <span className="text-amber-600 dark:text-amber-500">
                              ⚠️ 生成试听将产生 API 费用
                            </span>
                          </span>
                          <div className="mt-1 flex gap-2">
                            <input
                              className="field-input flex-1"
                              onChange={(e) =>
                                updatePreviewText(voice.voiceId, e.target.value)
                              }
                              placeholder="输入要生成试听的文本..."
                              value={previewState?.text ?? ""}
                            />
                            <Button
                              disabled={
                                isPending ||
                                previewState?.isLoading ||
                                !previewState?.text?.trim()
                              }
                              onClick={() => onGeneratePreview(voice.voiceId)}
                              type="button"
                              variant="outline"
                            >
                              {previewState?.isLoading ? "生成中..." : "生成试听"}
                            </Button>
                          </div>
                        </label>

                        {previewState?.error ? (
                          <p className="text-destructive text-xs">
                            {previewState.error}
                          </p>
                        ) : null}

                        {previewState?.previewUrl ? (
                          <div className="rounded-md border border-border/60 bg-muted/30 p-2">
                            <div className="flex items-center justify-between">
                              <p className="text-muted-foreground text-xs">
                                新生成的试听
                              </p>
                              <Button
                                disabled={isPending}
                                onClick={() => onGeneratePreview(voice.voiceId)}
                                size="sm"
                                type="button"
                                variant="ghost"
                              >
                                刷新
                              </Button>
                            </div>
                            <audio
                              className="mt-1 w-full"
                              controls
                              preload="none"
                              src={previewState.previewUrl}
                            >
                              <track
                                default
                                kind="captions"
                                label="字幕占位"
                                src={EMPTY_VTT_TRACK}
                                srcLang="zh"
                              />
                            </audio>
                          </div>
                        ) : null}
                      </div>

                      {voice.previewAudioUrl ? (
                        <div className="mt-3 rounded-md border border-border/60 bg-muted/30 p-2">
                          <div className="flex items-center justify-between">
                            <p className="text-muted-foreground text-xs">
                              创建时试听
                            </p>
                            <Button
                              disabled={isPending || previewState?.isLoading}
                              onClick={() => {
                                updatePreviewText(
                                  voice.voiceId,
                                  previewState?.text || DEFAULT_SAMPLE_TEXT
                                );
                                onGeneratePreview(voice.voiceId);
                              }}
                              size="sm"
                              type="button"
                              variant="ghost"
                            >
                              刷新
                            </Button>
                          </div>
                          <audio
                            className="mt-1 w-full"
                            controls
                            preload="none"
                            src={voice.previewAudioUrl}
                          >
                            <track
                              default
                              kind="captions"
                              label="字幕占位"
                              src={EMPTY_VTT_TRACK}
                              srcLang="zh"
                            />
                          </audio>
                        </div>
                      ) : (
                        <p className="mt-3 text-amber-700 text-xs">
                          该档案暂无可用试听地址（接口未返回试听音频 URL）。
                        </p>
                      )}
                    </article>
                  );
                })}
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
