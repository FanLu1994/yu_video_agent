import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useTransition } from "react";
import { getAppVersion } from "@/actions/app";
import NavigationMenu from "@/components/navigation-menu";
import { Button } from "@/components/ui/button";

function HomePage() {
  const [appVersion, setAppVersion] = useState("0.0.0");
  const [, startGetAppVersion] = useTransition();

  useEffect(
    () => startGetAppVersion(() => getAppVersion().then(setAppVersion)),
    []
  );

  return (
    <>
      <NavigationMenu />
      <div className="h-full overflow-auto p-3">
        <div className="mx-auto flex max-w-5xl flex-col gap-4">
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-semibold text-xl">视频 Agent 控制台</h1>
                <p className="text-muted-foreground text-sm">
                  Electron 运行时 v{appVersion}
                </p>
              </div>
              <Button asChild variant="outline">
                <Link to="/jobs">打开任务队列</Link>
              </Button>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <article className="rounded-lg border border-border bg-card p-4">
              <h2 className="font-medium">1. 模型配置</h2>
              <p className="mt-2 text-muted-foreground text-sm">
                配置模型服务与 API Key，做连通性测试。
              </p>
              <Button asChild className="mt-3" size="sm" variant="outline">
                <Link to="/providers">进入模型配置</Link>
              </Button>
            </article>

            <article className="rounded-lg border border-border bg-card p-4">
              <h2 className="font-medium">2. 音色克隆</h2>
              <p className="mt-2 text-muted-foreground text-sm">
                调用 MiniMax 音色克隆并保存 voice profile。
              </p>
              <Button asChild className="mt-3" size="sm" variant="outline">
                <Link to="/voices">进入音色克隆</Link>
              </Button>
            </article>

            <article className="rounded-lg border border-border bg-card p-4">
              <h2 className="font-medium">3. 任务队列</h2>
              <p className="mt-2 text-muted-foreground text-sm">
                创建任务、查看队列与事件流，执行 Agent 管道。
              </p>
              <Button asChild className="mt-3" size="sm" variant="outline">
                <Link to="/jobs">进入任务队列</Link>
              </Button>
            </article>
          </section>
        </div>
      </div>
    </>
  );
}

export const Route = createFileRoute("/")({
  component: HomePage,
});
