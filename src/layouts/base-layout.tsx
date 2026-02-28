import type React from "react";
import DragWindowRegion from "@/components/drag-window-region";
import NavigationMenu from "@/components/navigation-menu";

export default function BaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative h-[100dvh] overflow-hidden bg-background">
      <div className="app-backdrop pointer-events-none absolute inset-0" />
      <div className="relative flex h-full min-h-0 flex-col">
        <div className="border-border/70 border-b bg-background/85 backdrop-blur-xl">
          <DragWindowRegion
            title={
              <div className="flex items-center gap-3">
                <div className="h-2.5 w-2.5 rounded-full bg-primary/80 shadow-[0_0_0_5px_color-mix(in_oklab,var(--primary)_18%,transparent)]" />
                <div className="leading-tight">
                  <p className="font-semibold text-foreground text-sm">
                    YU Video Agent
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Desktop Workflow Console
                  </p>
                </div>
              </div>
            }
          />
        </div>
        <main className="flex min-h-0 flex-1 overflow-hidden p-3">
          <div className="grid h-full min-h-0 w-full grid-cols-1 gap-3 overflow-hidden md:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)]">
            <aside className="min-h-0 overflow-hidden rounded-2xl border border-border/70 bg-card/88 shadow-[0_30px_45px_-34px_rgba(5,17,38,0.55)] backdrop-blur">
              <NavigationMenu />
            </aside>
            <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/92 shadow-[0_35px_55px_-36px_rgba(5,17,38,0.6)] backdrop-blur-sm">
              <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
