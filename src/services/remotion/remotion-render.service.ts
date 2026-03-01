import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import type { AgentCompositionInput } from "@/remotion/Root";
import { getDataRootPath } from "@/services/storage/runtime-paths";

export interface RenderAgentVideoInput {
  inputProps: AgentCompositionInput;
  jobId: string;
  onProgress?: (progressPercent: number) => void | Promise<void>;
  outputDir: string;
}

export interface RenderAgentVideoResult {
  compositionId: string;
  videoPath: string;
}

const DEFAULT_COMPOSITION_ID = "AgentNarration";

export class RemotionRenderService {
  private async resolveEntryPoint() {
    const candidates = [
      path.resolve(process.cwd(), "src", "remotion", "index.ts"),
      path.resolve(process.cwd(), "src", "remotion", "index.tsx"),
    ];

    for (const candidate of candidates) {
      try {
        await stat(candidate);
        return candidate;
      } catch {
        // try next candidate
      }
    }

    throw new Error(
      "Remotion entrypoint not found. Expected src/remotion/index.ts or src/remotion/index.tsx."
    );
  }

  async renderAgentVideo({
    inputProps,
    onProgress,
    outputDir,
  }: RenderAgentVideoInput): Promise<RenderAgentVideoResult> {
    const [{ bundle }, renderer] = await Promise.all([
      import("@remotion/bundler"),
      import("@remotion/renderer"),
    ]);

    const entryPoint = await this.resolveEntryPoint();
    const videoPath = path.join(outputDir, "final", "video.mp4");
    const binariesDirectory = path.join(getDataRootPath(), "remotion-binaries");
    await mkdir(path.dirname(videoPath), { recursive: true });
    await mkdir(binariesDirectory, { recursive: true });

    await renderer.ensureBrowser({
      chromeMode: "headless-shell",
      logLevel: "warn",
    });

    const serveUrl = await bundle({
      entryPoint,
      onProgress: () => {
        // Keep bundling progress internal. Render progress is surfaced to users.
      },
    });

    const composition = await renderer.selectComposition({
      id: DEFAULT_COMPOSITION_ID,
      serveUrl,
      inputProps,
      logLevel: "warn",
      chromeMode: "headless-shell",
      binariesDirectory,
    });

    await renderer.renderMedia({
      codec: "h264",
      composition,
      serveUrl,
      outputLocation: videoPath,
      inputProps,
      logLevel: "warn",
      chromeMode: "headless-shell",
      binariesDirectory,
      onProgress: (progress) => {
        const percent = Math.max(0, Math.min(100, Math.round(progress.progress * 100)));
        void onProgress?.(percent);
      },
    });

    return {
      compositionId: DEFAULT_COMPOSITION_ID,
      videoPath,
    };
  }
}
