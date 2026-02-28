import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useTransition } from "react";
import { listProviders } from "@/actions/provider";
import { createVoiceClone, listVoiceProfiles } from "@/actions/voice-clone";
import NavigationMenu from "@/components/navigation-menu";
import { Button } from "@/components/ui/button";

interface VoiceCloneFormState {
  providerId: string;
  voiceId: string;
  cloneAudioPath: string;
  promptAudioPath: string;
  promptText: string;
  sampleText: string;
  model: string;
}

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

  async function refreshAll() {
    const [providerRows, voiceRows] = await Promise.all([
      listProviders(),
      listVoiceProfiles(),
    ]);
    setProviders(providerRows);
    setVoices(voiceRows);

    const minimaxProvider = providerRows.find((provider) => provider.id === "minimax");
    if (minimaxProvider && !form.providerId) {
      setForm((prev) => ({ ...prev, providerId: "minimax" }));
    }
  }

  useEffect(() => {
    startTransition(() => {
      refreshAll().catch((error) => {
        setMessage(error instanceof Error ? error.message : "加载音色列表失败。");
      });
    });
  }, []);

  async function onClone() {
    if (!form.providerId || !form.voiceId || !form.cloneAudioPath || !form.sampleText || !form.model) {
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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "音色克隆失败。");
    }
  }

  return (
    <>
      <NavigationMenu />
      <div className="h-full overflow-auto p-3">
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
          <section className="rounded-lg border border-border bg-card p-4">
            <h1 className="mb-3 font-semibold text-lg">MiniMax 音色克隆</h1>
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
                  {availableProviders.map((provider) => (
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
                  placeholder="speech-2.8-hd"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm md:col-span-2">
                <span>音色 ID</span>
                <input
                  className="rounded-md border border-input bg-background px-2 py-1"
                  value={form.voiceId}
                  onChange={(event) => setForm((prev) => ({ ...prev, voiceId: event.target.value }))}
                  placeholder="my_voice_001"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span>克隆音频</span>
                <input
                  accept=".mp3,.m4a,.wav"
                  className="rounded-md border border-input bg-background px-2 py-1"
                  type="file"
                  onChange={(event) => {
                    const path = tryReadElectronFilePath(event.currentTarget);
                    setForm((prev) => ({ ...prev, cloneAudioPath: path }));
                  }}
                />
                <code className="text-muted-foreground text-xs">
                  {form.cloneAudioPath || "未选择文件"}
                </code>
                <input
                  className="rounded-md border border-input bg-background px-2 py-1"
                  value={form.cloneAudioPath}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, cloneAudioPath: event.target.value }))
                  }
                  placeholder="或手动粘贴绝对路径"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span>参考音频（可选）</span>
                <input
                  accept=".mp3,.m4a,.wav"
                  className="rounded-md border border-input bg-background px-2 py-1"
                  type="file"
                  onChange={(event) => {
                    const path = tryReadElectronFilePath(event.currentTarget);
                    setForm((prev) => ({ ...prev, promptAudioPath: path }));
                  }}
                />
                <code className="text-muted-foreground text-xs">
                  {form.promptAudioPath || "未选择文件"}
                </code>
                <input
                  className="rounded-md border border-input bg-background px-2 py-1"
                  value={form.promptAudioPath}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, promptAudioPath: event.target.value }))
                  }
                  placeholder="或手动粘贴绝对路径"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm md:col-span-2">
                <span>参考文本（可选）</span>
                <input
                  className="rounded-md border border-input bg-background px-2 py-1"
                  value={form.promptText}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, promptText: event.target.value }))
                  }
                />
              </label>
              <label className="flex flex-col gap-1 text-sm md:col-span-2">
                <span>试听文本</span>
                <textarea
                  className="min-h-20 rounded-md border border-input bg-background px-2 py-1"
                  value={form.sampleText}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, sampleText: event.target.value }))
                  }
                />
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <Button disabled={isPending} onClick={onClone}>
                开始克隆
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setForm((prev) => ({
                    ...prev,
                    voiceId: "",
                    cloneAudioPath: "",
                    promptAudioPath: "",
                    promptText: "",
                  }));
                }}
              >
                清空输入
              </Button>
            </div>
            {message ? <p className="mt-3 text-muted-foreground text-sm">{message}</p> : null}
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-3 font-semibold text-base">音色档案</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2 text-left">音色 ID</th>
                    <th className="px-2 py-2 text-left">服务</th>
                    <th className="px-2 py-2 text-left">状态</th>
                    <th className="px-2 py-2 text-left">源音频</th>
                    <th className="px-2 py-2 text-left">试听链接</th>
                    <th className="px-2 py-2 text-left">创建时间</th>
                  </tr>
                </thead>
                <tbody>
                  {voices.map((voice) => (
                    <tr key={voice.voiceId} className="border-b border-border/60">
                      <td className="px-2 py-2">{voice.voiceId}</td>
                      <td className="px-2 py-2">{voice.providerId}</td>
                      <td className="px-2 py-2">{voice.status}</td>
                      <td className="px-2 py-2">
                        <code className="text-xs">{voice.sourceAudioPath}</code>
                      </td>
                      <td className="px-2 py-2">
                        {voice.previewAudioUrl ? (
                          <a
                            className="text-primary underline"
                            href={voice.previewAudioUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            打开
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-2 py-2">{new Date(voice.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                  {voices.length === 0 ? (
                    <tr>
                      <td className="px-2 py-6 text-center text-muted-foreground" colSpan={6}>
                        暂无音色档案。
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

export const Route = createFileRoute("/voices")({
  component: VoiceClonePage,
});
