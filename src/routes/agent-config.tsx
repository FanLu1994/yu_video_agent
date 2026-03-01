import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState, useTransition } from "react";
import { getAgentConfig, saveAgentConfig } from "@/actions/agent-config";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface AgentConfigFormState {
  accentColor: string;
  backgroundEndColor: string;
  backgroundStartColor: string;
  durationSecMax: string;
  durationSecMin: string;
  fps: string;
  height: string;
  maxOutputTokens: string;
  maxResearchSources: string;
  scriptPrompt: string;
  systemPrompt: string;
  temperature: string;
  theme: "aurora" | "sunset" | "ocean";
  topicPrompt: string;
  width: string;
}

const DEFAULT_AGENT_CONFIG_FORM: AgentConfigFormState = {
  systemPrompt:
    "你是资深短视频编导与事实校对助手。请严格基于用户提供的文件与网页内容产出结果，避免编造。输出中文，表达清晰、口语化、适合配音。若信息不足，请保守表达并减少结论强度。",
  topicPrompt:
    "请基于输入资料生成 1 条视频标题：\n1) 长度 14-22 个中文字符\n2) 不使用夸张词、感叹号\n3) 尽量包含核心对象与动作\n4) 仅输出标题本身，不要任何解释或前后缀。",
  scriptPrompt:
    "请输出可直接用于 16:9 解说短视频的旁白脚本：\n1) 共 6 句，每句 18-32 字\n2) 结构：开场钩子 -> 背景事实 -> 关键拆解 -> 结论建议\n3) 每句独立成行，不加编号，不加 Markdown\n4) 只引用资料中可验证信息，避免绝对化措辞。",
  maxResearchSources: "6",
  temperature: "0.5",
  maxOutputTokens: "1400",
  theme: "aurora",
  width: "1920",
  height: "1080",
  fps: "30",
  accentColor: "",
  backgroundStartColor: "",
  backgroundEndColor: "",
  durationSecMin: "45",
  durationSecMax: "90",
};

function AgentConfigPage() {
  const [form, setForm] = useState<AgentConfigFormState>(DEFAULT_AGENT_CONFIG_FORM);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    const config = await getAgentConfig();
    setForm({
      systemPrompt: config.prompts.systemPrompt,
      topicPrompt: config.prompts.topicPrompt,
      scriptPrompt: config.prompts.scriptPrompt,
      maxResearchSources: String(config.runtimeConfig.maxResearchSources),
      temperature: String(config.runtimeConfig.temperature),
      maxOutputTokens: String(config.runtimeConfig.maxOutputTokens),
      theme: config.remotionConfig.theme,
      width: String(config.remotionConfig.width),
      height: String(config.remotionConfig.height),
      fps: String(config.remotionConfig.fps),
      accentColor: config.remotionConfig.accentColor ?? "",
      backgroundStartColor: config.remotionConfig.backgroundStartColor ?? "",
      backgroundEndColor: config.remotionConfig.backgroundEndColor ?? "",
      durationSecMin: String(config.videoSpec.durationSecMin),
      durationSecMax: String(config.videoSpec.durationSecMax),
    });
  }, []);

  useEffect(() => {
    startTransition(() => {
      refresh().catch((error) => {
        setMessage(error instanceof Error ? error.message : "加载 Agent 配置失败。");
      });
    });
  }, [refresh]);

  async function onSave() {
    const toInt = (value: string) => Number.parseInt(value, 10);
    const toNumber = (value: string) => Number(value);
    const isHexColor = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value);
    const normalizeColor = (value: string) => {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : "";
    };

    const maxResearchSources = toInt(form.maxResearchSources);
    const temperature = toNumber(form.temperature);
    const maxOutputTokens = toInt(form.maxOutputTokens);
    const width = toInt(form.width);
    const height = toInt(form.height);
    const fps = toInt(form.fps);
    const durationSecMin = toInt(form.durationSecMin);
    const durationSecMax = toInt(form.durationSecMax);
    const accentColor = normalizeColor(form.accentColor);
    const backgroundStartColor = normalizeColor(form.backgroundStartColor);
    const backgroundEndColor = normalizeColor(form.backgroundEndColor);

    if (
      !Number.isFinite(maxResearchSources) ||
      !Number.isFinite(temperature) ||
      !Number.isFinite(maxOutputTokens) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      !Number.isFinite(fps) ||
      !Number.isFinite(durationSecMin) ||
      !Number.isFinite(durationSecMax)
    ) {
      setMessage("请检查数值字段，包含了无效输入。");
      return;
    }

    if (durationSecMin > durationSecMax) {
      setMessage("时长区间无效：最小值不能大于最大值。");
      return;
    }

    for (const color of [accentColor, backgroundStartColor, backgroundEndColor]) {
      if (color && !isHexColor(color)) {
        setMessage("颜色格式必须是 #RRGGBB，或留空。");
        return;
      }
    }

    try {
      await saveAgentConfig({
        prompts: {
          systemPrompt: form.systemPrompt,
          topicPrompt: form.topicPrompt,
          scriptPrompt: form.scriptPrompt,
        },
        runtimeConfig: {
          maxResearchSources,
          temperature,
          maxOutputTokens,
        },
        remotionConfig: {
          theme: form.theme,
          width,
          height,
          fps,
          accentColor,
          backgroundStartColor,
          backgroundEndColor,
        },
        videoSpec: {
          aspect: "16:9",
          resolution: "1920x1080",
          durationSecMin,
          durationSecMax,
        },
      });
      setMessage("Agent 配置已保存。新建任务会自动使用这份配置。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存 Agent 配置失败。");
    }
  }

  async function onResetDefaults() {
    const defaults = DEFAULT_AGENT_CONFIG_FORM;
    setForm(defaults);
    try {
      await saveAgentConfig({
        prompts: {
          systemPrompt: defaults.systemPrompt,
          topicPrompt: defaults.topicPrompt,
          scriptPrompt: defaults.scriptPrompt,
        },
        runtimeConfig: {
          maxResearchSources: Number.parseInt(defaults.maxResearchSources, 10),
          temperature: Number(defaults.temperature),
          maxOutputTokens: Number.parseInt(defaults.maxOutputTokens, 10),
        },
        remotionConfig: {
          theme: defaults.theme,
          width: Number.parseInt(defaults.width, 10),
          height: Number.parseInt(defaults.height, 10),
          fps: Number.parseInt(defaults.fps, 10),
          accentColor: defaults.accentColor,
          backgroundStartColor: defaults.backgroundStartColor,
          backgroundEndColor: defaults.backgroundEndColor,
        },
        videoSpec: {
          aspect: "16:9",
          resolution: "1920x1080",
          durationSecMin: Number.parseInt(defaults.durationSecMin, 10),
          durationSecMax: Number.parseInt(defaults.durationSecMax, 10),
        },
      });
      setMessage("已恢复默认值并保存。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "恢复默认值失败。");
    }
  }

  return (
    <div className="app-page">
      <section className="app-panel min-h-0 xl:col-span-12">
        <header className="app-panel-header">
          <div>
            <h1 className="font-semibold text-base">Agent 配置</h1>
            <p className="text-muted-foreground text-xs">
              这里维护全局 Prompt、Runtime 与 Remotion 参数。新建任务将自动读取。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button disabled={isPending} onClick={onResetDefaults} variant="outline">
              恢复默认值
            </Button>
            <Button disabled={isPending} onClick={onSave}>
              保存配置
            </Button>
          </div>
        </header>

        <div className="app-panel-body overflow-auto p-4">
          <Tabs className="space-y-4" defaultValue="basic">
            <TabsList>
              <TabsTrigger value="basic">基础</TabsTrigger>
              <TabsTrigger value="advanced">高级</TabsTrigger>
            </TabsList>

            <TabsContent className="space-y-4" value="basic">
              <section className="rounded-xl border border-border/70 bg-muted/20 p-3">
                <p className="font-medium text-sm">Prompt</p>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="field-label">
                    <span>System Prompt</span>
                    <textarea
                      className="field-input min-h-24"
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          systemPrompt: event.target.value,
                        }))
                      }
                      value={form.systemPrompt}
                    />
                  </label>
                  <label className="field-label">
                    <span>Topic Prompt</span>
                    <textarea
                      className="field-input min-h-24"
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          topicPrompt: event.target.value,
                        }))
                      }
                      value={form.topicPrompt}
                    />
                  </label>
                </div>
                <label className="field-label mt-3">
                  <span>Script Prompt</span>
                  <textarea
                    className="field-input min-h-24"
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        scriptPrompt: event.target.value,
                      }))
                    }
                    value={form.scriptPrompt}
                  />
                </label>
              </section>

              <section className="rounded-xl border border-border/70 bg-muted/20 p-3">
                <p className="font-medium text-sm">主题与时长</p>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <label className="field-label">
                    <span>Theme</span>
                    <select
                      className="field-input"
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          theme: event.target.value as AgentConfigFormState["theme"],
                        }))
                      }
                      value={form.theme}
                    >
                      <option value="aurora">aurora</option>
                      <option value="sunset">sunset</option>
                      <option value="ocean">ocean</option>
                    </select>
                  </label>
                  <label className="field-label">
                    <span>最小时长（秒）</span>
                    <input
                      className="field-input"
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          durationSecMin: event.target.value,
                        }))
                      }
                      value={form.durationSecMin}
                    />
                  </label>
                  <label className="field-label">
                    <span>最大时长（秒）</span>
                    <input
                      className="field-input"
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          durationSecMax: event.target.value,
                        }))
                      }
                      value={form.durationSecMax}
                    />
                  </label>
                </div>
              </section>
            </TabsContent>

            <TabsContent className="space-y-4" value="advanced">
              <section className="rounded-xl border border-border/70 bg-muted/20 p-3">
                <p className="font-medium text-sm">Runtime</p>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <label className="field-label">
                    <span>Max Research Sources</span>
                    <input
                      className="field-input"
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          maxResearchSources: event.target.value,
                        }))
                      }
                      value={form.maxResearchSources}
                    />
                  </label>
                  <label className="field-label">
                    <span>Temperature</span>
                    <input
                      className="field-input"
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          temperature: event.target.value,
                        }))
                      }
                      value={form.temperature}
                    />
                  </label>
                  <label className="field-label">
                    <span>Max Output Tokens</span>
                    <input
                      className="field-input"
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          maxOutputTokens: event.target.value,
                        }))
                      }
                      value={form.maxOutputTokens}
                    />
                  </label>
                </div>
              </section>

              <section className="rounded-xl border border-border/70 bg-muted/20 p-3">
                <p className="font-medium text-sm">Remotion 渲染参数</p>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <label className="field-label">
                    <span>Width</span>
                    <input
                      className="field-input"
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          width: event.target.value,
                        }))
                      }
                      value={form.width}
                    />
                  </label>
                  <label className="field-label">
                    <span>Height</span>
                    <input
                      className="field-input"
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          height: event.target.value,
                        }))
                      }
                      value={form.height}
                    />
                  </label>
                  <label className="field-label">
                    <span>FPS</span>
                    <input
                      className="field-input"
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          fps: event.target.value,
                        }))
                      }
                      value={form.fps}
                    />
                  </label>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <label className="field-label">
                    <span>Accent Color（#RRGGBB）</span>
                    <input
                      className="field-input"
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          accentColor: event.target.value,
                        }))
                      }
                      placeholder="#38bdf8"
                      value={form.accentColor}
                    />
                  </label>
                  <label className="field-label">
                    <span>Bg Start Color（#RRGGBB）</span>
                    <input
                      className="field-input"
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          backgroundStartColor: event.target.value,
                        }))
                      }
                      placeholder="#0f172a"
                      value={form.backgroundStartColor}
                    />
                  </label>
                  <label className="field-label">
                    <span>Bg End Color（#RRGGBB）</span>
                    <input
                      className="field-input"
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          backgroundEndColor: event.target.value,
                        }))
                      }
                      placeholder="#1e293b"
                      value={form.backgroundEndColor}
                    />
                  </label>
                </div>
              </section>
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

export const Route = createFileRoute("/agent-config")({
  component: AgentConfigPage,
});
