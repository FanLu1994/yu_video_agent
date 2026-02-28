import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useTransition } from "react";
import { getAppVersion } from "@/actions/app";
import { Button } from "@/components/ui/button";

function HomePage() {
  const [appVersion, setAppVersion] = useState("0.0.0");
  const [, startGetAppVersion] = useTransition();

  useEffect(
    () => startGetAppVersion(() => getAppVersion().then(setAppVersion)),
    []
  );

  return (
    <div className="app-page">
      <section className="app-panel min-h-0 xl:col-span-8">
        <header className="app-panel-header">
          <div>
            <h1 className="font-semibold text-lg">视频 Agent 控制台</h1>
            <p className="text-muted-foreground text-sm">
              Electron 运行时 v{appVersion}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/jobs">打开任务队列</Link>
          </Button>
        </header>
        <div className="app-panel-body">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <article className="rounded-xl border border-border/70 bg-muted/25 p-4">
              <p className="font-medium text-sm">模型配置</p>
              <p className="mt-2 text-muted-foreground text-sm">
                维护模型服务、连通性和密钥存储。
              </p>
              <Button asChild className="mt-3" size="sm" variant="outline">
                <Link to="/providers">进入模型配置</Link>
              </Button>
            </article>
            <article className="rounded-xl border border-border/70 bg-muted/25 p-4">
              <p className="font-medium text-sm">音色克隆</p>
              <p className="mt-2 text-muted-foreground text-sm">
                调用 MiniMax API 生成并管理克隆音色。
              </p>
              <Button asChild className="mt-3" size="sm" variant="outline">
                <Link to="/voices">进入音色克隆</Link>
              </Button>
            </article>
            <article className="rounded-xl border border-border/70 bg-muted/25 p-4 md:col-span-2">
              <p className="font-medium text-sm">任务队列</p>
              <p className="mt-2 text-muted-foreground text-sm">
                创建任务、查看执行阶段、跟踪日志与错误信息。
              </p>
              <Button asChild className="mt-3" size="sm" variant="outline">
                <Link to="/jobs">进入任务队列</Link>
              </Button>
            </article>
          </div>
        </div>
      </section>

      <section className="app-panel min-h-0 xl:col-span-4">
        <header className="app-panel-header">
          <h2 className="font-semibold text-base">使用建议</h2>
        </header>
        <div className="app-panel-body space-y-3 text-sm">
          <div className="rounded-lg border border-border/70 bg-muted/25 p-3">
            <p className="font-medium">步骤 1</p>
            <p className="mt-1 text-muted-foreground">
              先在模型配置中保存 `minimax` 服务，并执行一次测试。
            </p>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/25 p-3">
            <p className="font-medium">步骤 2</p>
            <p className="mt-1 text-muted-foreground">
              在音色克隆页导入样本音频，完成克隆并确认音色状态。
            </p>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/25 p-3">
            <p className="font-medium">步骤 3</p>
            <p className="mt-1 text-muted-foreground">
              在任务队列创建任务并在右侧详情面板查看执行进度。
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

export const Route = createFileRoute("/")({
  component: HomePage,
});
