import { type ReactNode, useEffect, useState } from "react";
import { getPlatform } from "@/actions/app";
import { closeWindow, maximizeWindow, minimizeWindow } from "@/actions/window";

interface DragWindowRegionProps {
  title?: ReactNode;
}

export default function DragWindowRegion({ title }: DragWindowRegionProps) {
  const [platform, setPlatform] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    getPlatform()
      .then((value) => {
        if (!active) {
          return;
        }

        setPlatform(value);
      })
      .catch((error) => {
        console.error("Failed to detect platform", error);
      });

    return () => {
      active = false;
    };
  }, []);

  const isMacOS = platform === "darwin";

  return (
    <div className="flex w-full items-stretch justify-between">
      <div className="draglayer flex min-w-0 flex-1 items-center">
        {title && !isMacOS && (
          <div className="flex min-w-0 flex-1 select-none whitespace-nowrap px-3 py-2 text-xs">
            {title}
          </div>
        )}
        {isMacOS && (
          <div className="flex h-9 flex-1">
            {/* Maintain the same height but do not display content */}
          </div>
        )}
      </div>
      {!isMacOS && <WindowButtons />}
    </div>
  );
}

function WindowButtons() {
  const buttonClass =
    "no-drag flex h-9 w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/55 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60";

  return (
    <div className="no-drag flex">
      <button
        aria-label="最小化窗口"
        className={buttonClass}
        onClick={minimizeWindow}
        title="最小化"
        type="button"
      >
        <svg
          aria-hidden="true"
          height="12"
          role="img"
          viewBox="0 0 12 12"
          width="12"
        >
          <rect fill="currentColor" height="1" width="10" x="1" y="6" />
        </svg>
      </button>
      <button
        aria-label="最大化窗口"
        className={buttonClass}
        onClick={maximizeWindow}
        title="最大化"
        type="button"
      >
        <svg
          aria-hidden="true"
          height="12"
          role="img"
          viewBox="0 0 12 12"
          width="12"
        >
          <rect
            fill="none"
            height="9"
            stroke="currentColor"
            width="9"
            x="1.5"
            y="1.5"
          />
        </svg>
      </button>
      <button
        aria-label="关闭窗口"
        className={`${buttonClass} hover:bg-destructive/20 hover:text-destructive`}
        onClick={closeWindow}
        title="关闭"
        type="button"
      >
        <svg
          aria-hidden="true"
          height="12"
          role="img"
          viewBox="0 0 12 12"
          width="12"
        >
          <polygon
            fill="currentColor"
            fillRule="evenodd"
            points="11 1.576 6.583 6 11 10.424 10.424 11 6 6.583 1.576 11 1 10.424 5.417 6 1 1.576 1.576 1 6 5.417 10.424 1"
          />
        </svg>
      </button>
    </div>
  );
}
