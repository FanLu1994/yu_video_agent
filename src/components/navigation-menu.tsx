import { Link, useLocation } from "@tanstack/react-router";
import {
  AudioLines,
  Bot,
  Gauge,
  Layers3,
  SlidersHorizontal,
} from "lucide-react";

const NAV_ITEMS = [
  {
    to: "/",
    label: "控制台",
    description: "总体概览",
    icon: Gauge,
  },
  {
    to: "/providers",
    label: "模型配置",
    description: "服务与密钥",
    icon: SlidersHorizontal,
  },
  {
    to: "/voices",
    label: "音色克隆",
    description: "MiniMax 音色",
    icon: AudioLines,
  },
  {
    to: "/jobs",
    label: "任务队列",
    description: "执行与事件",
    icon: Layers3,
  },
] as const;

export default function NavigationMenu() {
  const location = useLocation();

  return (
    <nav className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-3">
      <div className="rounded-2xl border border-border/70 bg-muted/30 p-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 bg-card text-primary">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <p className="font-semibold text-sm">视频 Agent</p>
            <p className="text-muted-foreground text-xs">桌面工作台</p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto pr-1">
        <p className="px-1 pb-2 font-medium text-[11px] text-muted-foreground/90 uppercase tracking-[0.12em]">
          Workspace
        </p>
        <div className="flex min-h-0 flex-col gap-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.to === "/"
                ? location.pathname === item.to
                : location.pathname.startsWith(item.to);

            return (
              <Link
                className={`group flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                  isActive
                    ? "border-primary/50 bg-primary/10 text-foreground shadow-[0_12px_24px_-20px_color-mix(in_oklab,var(--primary)_85%,transparent)]"
                    : "border-border/60 bg-card/55 text-muted-foreground hover:border-border hover:bg-muted/45 hover:text-foreground"
                }`}
                key={item.to}
                to={item.to}
              >
                <div
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition ${
                    isActive
                      ? "border-primary/45 bg-primary/15 text-primary"
                      : "border-border/70 bg-muted/25 text-muted-foreground group-hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm">{item.label}</p>
                  <p className="truncate text-xs">{item.description}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-border/70 bg-card/70 p-3 text-xs">
        <p className="font-medium">状态</p>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-muted-foreground">运行环境</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            开发模式
          </span>
        </div>
        <p className="mt-2 text-muted-foreground leading-relaxed">
          当前采用桌面应用分区布局，表单和列表均支持区域滚动。
        </p>
      </div>
    </nav>
  );
}
