import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useTransition } from "react";
import { deleteProviderConfig, listProviders, saveProviderConfig, testProviderConnection } from "@/actions/provider";
import NavigationMenu from "@/components/navigation-menu";
import { Button } from "@/components/ui/button";

type ProviderKind =
  | "openai-compatible"
  | "anthropic"
  | "google"
  | "domestic-compatible"
  | "minimax";

interface ProviderFormState {
  id: string;
  kind: ProviderKind;
  displayName: string;
  baseUrl: string;
  model: string;
  enabled: boolean;
  timeoutMs: string;
  retryAttempts: string;
  retryBackoffMs: string;
  apiKey: string;
}

interface ProviderPreset {
  key: string;
  label: string;
  description: string;
  form: Omit<ProviderFormState, "apiKey">;
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
  const [presetKey, setPresetKey] = useState(PROVIDER_PRESETS[0].key);
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

  async function refresh() {
    const rows = await listProviders();
    setProviders(rows);
  }

  useEffect(() => {
    startTransition(() => {
      refresh().catch((error) => {
        setMessage(error instanceof Error ? error.message : "加载模型配置失败。");
      });
    });
  }, []);

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
      timeoutMs: String(provider.timeoutMs ?? 30000),
      retryAttempts: String(provider.retry?.maxAttempts ?? 2),
      retryBackoffMs: String(provider.retry?.backoffMs ?? 1000),
      apiKey: "",
    });
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
    if (!form.id || !form.displayName || !form.model) {
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
    <>
      <NavigationMenu />
      <div className="h-full overflow-auto p-3">
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h1 className="font-semibold text-lg">模型配置</h1>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setForm(DEFAULT_FORM);
                    setMessage("表单已重置。");
                  }}
                >
                  重置
                </Button>
              </div>
            </div>
            <div className="mb-4 rounded-md border border-border bg-muted/30 p-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                  <span>常用预设</span>
                  <select
                    className="rounded-md border border-input bg-background px-2 py-1"
                    value={presetKey}
                    onChange={(event) => setPresetKey(event.target.value)}
                  >
                    {PROVIDER_PRESETS.map((preset) => (
                      <option key={preset.key} value={preset.key}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  className="md:mt-5"
                  variant="outline"
                  onClick={applyPresetToForm}
                >
                  套用预设
                </Button>
              </div>
              <p className="mt-2 text-muted-foreground text-xs">
                {selectedPreset?.description ?? "选择后可一键填充。"}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span>模型 ID</span>
                <input
                  className="rounded-md border border-input bg-background px-2 py-1"
                  value={form.id}
                  onChange={(event) => setForm((prev) => ({ ...prev, id: event.target.value.trim() }))}
                  placeholder="openai-main"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span>显示名称</span>
                <input
                  className="rounded-md border border-input bg-background px-2 py-1"
                  value={form.displayName}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, displayName: event.target.value }))
                  }
                  placeholder="示例：OpenAI 主线路"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span>类型</span>
                <select
                  className="rounded-md border border-input bg-background px-2 py-1"
                  value={form.kind}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, kind: event.target.value as ProviderKind }))
                  }
                >
                  <option value="openai-compatible">OpenAI 兼容</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="google">Google</option>
                  <option value="domestic-compatible">国内兼容网关</option>
                  <option value="minimax">MiniMax</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span>模型</span>
                <input
                  className="rounded-md border border-input bg-background px-2 py-1"
                  value={form.model}
                  onChange={(event) => setForm((prev) => ({ ...prev, model: event.target.value }))}
                  placeholder="gpt-4o-mini"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm md:col-span-2">
                <span>Base URL（可选）</span>
                <input
                  className="rounded-md border border-input bg-background px-2 py-1"
                  value={form.baseUrl}
                  onChange={(event) => setForm((prev) => ({ ...prev, baseUrl: event.target.value }))}
                  placeholder="https://api.openai.com/v1"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span>超时（ms）</span>
                <input
                  className="rounded-md border border-input bg-background px-2 py-1"
                  value={form.timeoutMs}
                  onChange={(event) => setForm((prev) => ({ ...prev, timeoutMs: event.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span>重试次数</span>
                <input
                  className="rounded-md border border-input bg-background px-2 py-1"
                  value={form.retryAttempts}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, retryAttempts: event.target.value }))
                  }
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span>重试间隔（ms）</span>
                <input
                  className="rounded-md border border-input bg-background px-2 py-1"
                  value={form.retryBackoffMs}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, retryBackoffMs: event.target.value }))
                  }
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  checked={form.enabled}
                  onChange={(event) => setForm((prev) => ({ ...prev, enabled: event.target.checked }))}
                  type="checkbox"
                />
                启用
              </label>
              <label className="flex flex-col gap-1 text-sm md:col-span-2">
                <span>API Key（可选，保存时加密）</span>
                <input
                  className="rounded-md border border-input bg-background px-2 py-1"
                  type="password"
                  value={form.apiKey}
                  onChange={(event) => setForm((prev) => ({ ...prev, apiKey: event.target.value }))}
                  placeholder="sk-..."
                />
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <Button disabled={isPending} onClick={onSave}>
                保存模型配置
              </Button>
              {selectedProvider ? (
                <Button
                  disabled={isPending}
                  variant="outline"
                  onClick={() => onTest(selectedProvider.id)}
                >
                  测试当前配置
                </Button>
              ) : null}
            </div>
            {message ? <p className="mt-3 text-muted-foreground text-sm">{message}</p> : null}
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-3 font-semibold text-base">已保存的模型配置</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2 text-left">ID</th>
                    <th className="px-2 py-2 text-left">类型</th>
                    <th className="px-2 py-2 text-left">模型</th>
                    <th className="px-2 py-2 text-left">启用</th>
                    <th className="px-2 py-2 text-left">更新时间</th>
                    <th className="px-2 py-2 text-left">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {providers.map((provider) => (
                    <tr key={provider.id} className="border-b border-border/60">
                      <td className="px-2 py-2">{provider.id}</td>
                      <td className="px-2 py-2">{provider.kind}</td>
                      <td className="px-2 py-2">{provider.model}</td>
                      <td className="px-2 py-2">{provider.enabled ? "是" : "否"}</td>
                      <td className="px-2 py-2">{new Date(provider.updatedAt).toLocaleString()}</td>
                      <td className="px-2 py-2">
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => applyProviderToForm(provider.id)}>
                            编辑
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => onTest(provider.id)}>
                            测试
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => onDelete(provider.id)}>
                            删除
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {providers.length === 0 ? (
                    <tr>
                      <td className="px-2 py-6 text-center text-muted-foreground" colSpan={6}>
                        暂无模型配置。
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

export const Route = createFileRoute("/providers")({
  component: ProvidersPage,
});
