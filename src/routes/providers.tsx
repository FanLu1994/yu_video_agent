import { createFileRoute } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  deleteProviderConfig,
  listProviders,
  saveProviderConfig,
  testProviderConnection,
} from "@/actions/provider";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ProviderKind =
  | "openai-compatible"
  | "anthropic"
  | "google"
  | "domestic-compatible"
  | "minimax";

type ProvidersTab = "edit" | "saved";

interface ProviderFormState {
  apiKey: string;
  baseUrl: string;
  displayName: string;
  enabled: boolean;
  id: string;
  kind: ProviderKind;
  model: string;
  retryAttempts: string;
  retryBackoffMs: string;
  timeoutMs: string;
}

interface ProviderPreset {
  description: string;
  form: Omit<ProviderFormState, "apiKey">;
  key: string;
  label: string;
}

const DEFAULT_FORM: ProviderFormState = {
  id: "",
  kind: "openai-compatible",
  displayName: "",
  baseUrl: "",
  model: "",
  enabled: true,
  timeoutMs: "30000",
  retryAttempts: "2",
  retryBackoffMs: "1000",
  apiKey: "",
};

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    key: "openai-main",
    label: "OpenAI 官方",
    description: "适合直接接 OpenAI API。",
    form: {
      id: "openai-main",
      kind: "openai-compatible",
      displayName: "OpenAI 主线路",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      enabled: true,
      timeoutMs: "30000",
      retryAttempts: "2",
      retryBackoffMs: "1000",
    },
  },
  {
    key: "anthropic-main",
    label: "Anthropic 官方",
    description: "适合 Claude 系列模型。",
    form: {
      id: "anthropic-main",
      kind: "anthropic",
      displayName: "Anthropic 主线路",
      baseUrl: "https://api.anthropic.com/v1",
      model: "claude-sonnet-4-20250514",
      enabled: true,
      timeoutMs: "30000",
      retryAttempts: "2",
      retryBackoffMs: "1000",
    },
  },
  {
    key: "deepseek-main",
    label: "DeepSeek 官方",
    description: "常用的国内模型服务（OpenAI 兼容）。",
    form: {
      id: "deepseek-main",
      kind: "domestic-compatible",
      displayName: "DeepSeek 主线路",
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-chat",
      enabled: true,
      timeoutMs: "30000",
      retryAttempts: "2",
      retryBackoffMs: "1000",
    },
  },
  {
    key: "ollama-local",
    label: "Ollama 本地",
    description: "本地私有模型，默认走 OpenAI 兼容接口。",
    form: {
      id: "ollama-local",
      kind: "openai-compatible",
      displayName: "Ollama 本地服务",
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "qwen2.5:7b-instruct",
      enabled: true,
      timeoutMs: "45000",
      retryAttempts: "1",
      retryBackoffMs: "500",
    },
  },
  {
    key: "minimax-voice",
    label: "MiniMax 音色克隆",
    description: "用于音色克隆链路（speech 模型）。",
    form: {
      id: "minimax",
      kind: "minimax",
      displayName: "MiniMax",
      baseUrl: "https://api.minimaxi.com/v1",
      model: "speech-2.8-hd",
      enabled: true,
      timeoutMs: "30000",
      retryAttempts: "2",
      retryBackoffMs: "1000",
    },
  },
];

function ProvidersPage() {
  const [providers, setProviders] = useState<
    Awaited<ReturnType<typeof listProviders>>
  >([]);
  const [form, setForm] = useState<ProviderFormState>(DEFAULT_FORM);
  const [activeTab, setActiveTab] = useState<ProvidersTab>("edit");
  const [presetKey, setPresetKey] = useState(PROVIDER_PRESETS[0].key);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const selectedProvider = useMemo(
    () => providers.find((item) => item.id === form.id),
    [form.id, providers]
  );

  const selectedPreset = useMemo(
    () => PROVIDER_PRESETS.find((item) => item.key === presetKey),
    [presetKey]
  );

  const refresh = useCallback(async () => {
    const rows = await listProviders();
    setProviders(rows);
  }, []);

  useEffect(() => {
    startTransition(() => {
      refresh().catch((error) => {
        setMessage(
          error instanceof Error ? error.message : "加载模型配置失败。"
        );
      });
    });
  }, [refresh]);

  function applyProviderToForm(providerId: string) {
    const provider = providers.find((item) => item.id === providerId);
    if (!provider) {
      return;
    }

    setForm({
      id: provider.id,
      kind: provider.kind,
      displayName: provider.displayName,
      baseUrl: provider.baseUrl ?? "",
      model: provider.model,
      enabled: provider.enabled,
      timeoutMs: String(provider.timeoutMs ?? 30_000),
      retryAttempts: String(provider.retry?.maxAttempts ?? 2),
      retryBackoffMs: String(provider.retry?.backoffMs ?? 1000),
      apiKey: "",
    });
    setActiveTab("edit");
  }

  function applyPresetToForm() {
    const preset = PROVIDER_PRESETS.find((item) => item.key === presetKey);
    if (!preset) {
      return;
    }

    setForm({
      ...preset.form,
      apiKey: "",
    });
    setMessage(`已套用预设：${preset.label}。你仍可继续手动修改各字段。`);
  }

  async function onSave() {
    if (!(form.id && form.displayName && form.model)) {
      setMessage("请填写 ID、显示名称、模型。");
      return;
    }

    try {
      const timeoutMs = Number(form.timeoutMs);
      const retryAttempts = Number(form.retryAttempts);
      const retryBackoffMs = Number(form.retryBackoffMs);

      await saveProviderConfig({
        id: form.id,
        kind: form.kind,
        displayName: form.displayName,
        baseUrl: form.baseUrl || undefined,
        model: form.model,
        enabled: form.enabled,
        timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : undefined,
        retry:
          Number.isFinite(retryAttempts) && Number.isFinite(retryBackoffMs)
            ? {
                maxAttempts: retryAttempts,
                backoffMs: retryBackoffMs,
              }
            : undefined,
        apiKey: form.apiKey || undefined,
      });

      setMessage("模型配置已保存。");
      setForm((prev) => ({ ...prev, apiKey: "" }));
      await refresh();
      setActiveTab("saved");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败。");
    }
  }

  async function onDelete(providerId: string) {
    try {
      await deleteProviderConfig(providerId);
      setMessage(`已删除模型配置 '${providerId}'。`);
      if (form.id === providerId) {
        setForm(DEFAULT_FORM);
      }
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除失败。");
    }
  }

  async function onTest(providerId: string) {
    try {
      const result = await testProviderConnection(providerId);
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "连通性测试失败。");
    }
  }

  return (
    <div className="app-page">
      <section className="app-panel min-h-0 xl:col-span-12">
        <header className="app-panel-header">
          <div>
            <h1 className="font-semibold text-base">模型配置工作区</h1>
            <p className="text-muted-foreground text-xs">
              通过页签切换“配置编辑”和“已保存配置”。
            </p>
          </div>
          <Button
            onClick={() => {
              setForm(DEFAULT_FORM);
              setShowAdvanced(false);
              setMessage("表单已重置。");
            }}
            variant="outline"
          >
            重置
          </Button>
        </header>

        <div className="app-panel-body !p-0">
          <Tabs
            className="flex h-full min-h-0 flex-col"
            onValueChange={(value) => setActiveTab(value as ProvidersTab)}
            value={activeTab}
          >
            <div className="border-border/70 border-b px-4 py-2">
              <TabsList>
                <TabsTrigger value="edit">配置编辑</TabsTrigger>
                <TabsTrigger value="saved">已保存配置</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent className="overflow-auto p-4" value="edit">
              <div className="space-y-4">
                <section className="rounded-xl border border-border/70 bg-muted/25 p-3">
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
                    <label className="field-label min-w-0 flex-1">
                      <span>常用预设</span>
                      <select
                        className="field-input"
                        onChange={(event) => setPresetKey(event.target.value)}
                        value={presetKey}
                      >
                        {PROVIDER_PRESETS.map((preset) => (
                          <option key={preset.key} value={preset.key}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button onClick={applyPresetToForm} variant="outline">
                      套用预设
                    </Button>
                  </div>
                  <p className="mt-2 text-muted-foreground text-xs">
                    {selectedPreset?.description ?? "选择后可一键填充。"}
                  </p>
                </section>

                <section className="field-grid">
                  <label className="field-label">
                    <span>模型 ID</span>
                    <input
                      className="field-input"
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          id: event.target.value.trim(),
                        }))
                      }
                      placeholder="openai-main"
                      value={form.id}
                    />
                  </label>
                  <label className="field-label">
                    <span>显示名称</span>
                    <input
                      className="field-input"
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          displayName: event.target.value,
                        }))
                      }
                      placeholder="示例：OpenAI 主线路"
                      value={form.displayName}
                    />
                  </label>
                  <label className="field-label">
                    <span>类型</span>
                    <select
                      className="field-input"
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          kind: event.target.value as ProviderKind,
                        }))
                      }
                      value={form.kind}
                    >
                      <option value="openai-compatible">OpenAI 兼容</option>
                      <option value="anthropic">Anthropic</option>
                      <option value="google">Google</option>
                      <option value="domestic-compatible">国内兼容网关</option>
                      <option value="minimax">MiniMax</option>
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
                      placeholder="gpt-4o-mini"
                      value={form.model}
                    />
                  </label>
                  <label className="field-label md:col-span-2">
                    <span>Base URL（可选）</span>
                    <input
                      className="field-input"
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          baseUrl: event.target.value,
                        }))
                      }
                      placeholder="https://api.openai.com/v1"
                      value={form.baseUrl}
                    />
                  </label>
                  <label className="field-label md:col-span-2">
                    <span>API Key（可选，保存时加密）</span>
                    <input
                      className="field-input"
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          apiKey: event.target.value,
                        }))
                      }
                      placeholder="sk-..."
                      type="password"
                      value={form.apiKey}
                    />
                  </label>
                </section>

                <section className="rounded-xl border border-border/70 bg-muted/20 p-3">
                  <button
                    className="cursor-pointer font-medium text-sm transition hover:text-foreground/85"
                    onClick={() => setShowAdvanced((prev) => !prev)}
                    type="button"
                  >
                    {showAdvanced ? "收起高级选项" : "展开高级选项"}
                  </button>

                  {showAdvanced ? (
                    <div className="field-grid mt-3">
                      <label className="field-label">
                        <span>超时（ms）</span>
                        <input
                          className="field-input"
                          onChange={(event) =>
                            setForm((prev) => ({
                              ...prev,
                              timeoutMs: event.target.value,
                            }))
                          }
                          value={form.timeoutMs}
                        />
                      </label>
                      <label className="field-label">
                        <span>重试次数</span>
                        <input
                          className="field-input"
                          onChange={(event) =>
                            setForm((prev) => ({
                              ...prev,
                              retryAttempts: event.target.value,
                            }))
                          }
                          value={form.retryAttempts}
                        />
                      </label>
                      <label className="field-label">
                        <span>重试间隔（ms）</span>
                        <input
                          className="field-input"
                          onChange={(event) =>
                            setForm((prev) => ({
                              ...prev,
                              retryBackoffMs: event.target.value,
                            }))
                          }
                          value={form.retryBackoffMs}
                        />
                      </label>
                      <div className="field-label justify-end">
                        <span>状态</span>
                        <label className="inline-flex items-center gap-2 rounded-md border border-border/70 bg-card px-3 py-2 text-sm">
                          <input
                            checked={form.enabled}
                            onChange={(event) =>
                              setForm((prev) => ({
                                ...prev,
                                enabled: event.target.checked,
                              }))
                            }
                            type="checkbox"
                          />
                          启用
                        </label>
                      </div>
                    </div>
                  ) : null}
                </section>

                <div className="flex flex-wrap gap-2">
                  <Button disabled={isPending} onClick={onSave}>
                    保存模型配置
                  </Button>
                  {selectedProvider ? (
                    <Button
                      disabled={isPending}
                      onClick={() => onTest(selectedProvider.id)}
                      variant="outline"
                    >
                      测试当前配置
                    </Button>
                  ) : null}
                </div>
              </div>
            </TabsContent>

            <TabsContent className="overflow-auto p-4" value="saved">
              <div className="space-y-2">
                {providers.map((provider) => (
                  <article
                    className="rounded-lg border border-border/70 bg-muted/20 p-3"
                    key={provider.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-sm">
                          {provider.displayName}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {provider.id} · {provider.kind}
                        </p>
                        <p className="mt-1 text-xs">模型：{provider.model}</p>
                        <p className="text-muted-foreground text-xs">
                          更新：{new Date(provider.updatedAt).toLocaleString()}
                        </p>
                      </div>
                      <span className="rounded-full border border-border/80 px-2 py-0.5 text-xs">
                        {provider.enabled ? "已启用" : "已停用"}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        onClick={() => applyProviderToForm(provider.id)}
                        size="sm"
                        variant="outline"
                      >
                        编辑
                      </Button>
                      <Button
                        onClick={() => onTest(provider.id)}
                        size="sm"
                        variant="outline"
                      >
                        测试
                      </Button>
                      <Button
                        onClick={() => onDelete(provider.id)}
                        size="sm"
                        variant="destructive"
                      >
                        删除
                      </Button>
                    </div>
                  </article>
                ))}
                {providers.length === 0 ? (
                  <div className="rounded-lg border border-border/70 border-dashed px-4 py-10 text-center text-muted-foreground text-sm">
                    暂无模型配置。
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

export const Route = createFileRoute("/providers")({
  component: ProvidersPage,
});
