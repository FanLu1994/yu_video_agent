import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
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
const REMOTION_CHROME_MODE = "headless-shell";

type RendererModule = typeof import("@remotion/renderer");
type RemotionBinaryType = "compositor" | "ffmpeg" | "ffprobe";

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

  private getBrowserPlatform() {
    if (process.platform === "win32") {
      return "win64";
    }

    if (process.platform === "darwin") {
      return process.arch === "arm64" ? "mac-arm64" : "mac-x64";
    }

    if (process.platform === "linux") {
      return process.arch === "arm64" ? "linux-arm64" : "linux64";
    }

    throw new Error(
      `Unsupported platform for Remotion browser download: ${process.platform}/${process.arch}`
    );
  }

  private resolveManagedBrowserExecutable(dataRoot: string) {
    const platform = this.getBrowserPlatform();
    const downloadsRoot = path.join(
      dataRoot,
      ".remotion",
      "chrome-headless-shell"
    );

    const executableName =
      process.platform === "win32"
        ? "chrome-headless-shell.exe"
        : platform === "linux-arm64"
          ? "headless_shell"
          : "chrome-headless-shell";

    return path.join(
      downloadsRoot,
      platform,
      `chrome-headless-shell-${platform}`,
      executableName
    );
  }

  private async ensureManagedBrowser(
    renderer: RendererModule,
    dataRoot: string
  ) {
    await mkdir(dataRoot, { recursive: true });
    const previousCwd = process.cwd();

    try {
      process.chdir(dataRoot);
      await renderer.ensureBrowser({
        chromeMode: REMOTION_CHROME_MODE,
        logLevel: "warn",
      });
    } finally {
      process.chdir(previousCwd);
    }

    const browserExecutable = this.resolveManagedBrowserExecutable(dataRoot);
    await stat(browserExecutable);
    return browserExecutable;
  }

  private async ensureRuntimeBinaries(
    renderer: RendererModule,
    binariesDirectory: string
  ) {
    await mkdir(binariesDirectory, { recursive: true });
    const binaryTypes: RemotionBinaryType[] = [
      "compositor",
      "ffmpeg",
      "ffprobe",
    ];

    for (const type of binaryTypes) {
      const sourcePath = await this.resolveBinarySourcePath(renderer, type);
      const targetPath = renderer.RenderInternals.getExecutablePath({
        type,
        indent: false,
        logLevel: "warn",
        binariesDirectory,
      });

      const shouldCopy = await this.shouldCopyBinary(sourcePath, targetPath);
      if (shouldCopy) {
        await copyFile(sourcePath, targetPath);
      }
    }
  }

  private getBinaryFileName(type: RemotionBinaryType) {
    if (process.platform === "win32") {
      if (type === "compositor") {
        return "remotion.exe";
      }

      return `${type}.exe`;
    }

    if (type === "compositor") {
      return "remotion";
    }

    return type;
  }

  private getPackagedBinarySourcePath(type: RemotionBinaryType) {
    try {
      if (!app.isPackaged) {
        return undefined;
      }

      const resourcesRoot = path.resolve(app.getAppPath(), "..");
      return path.join(
        resourcesRoot,
        "remotion-binaries",
        `${process.platform}-${process.arch}`,
        this.getBinaryFileName(type)
      );
    } catch {
      return undefined;
    }
  }

  private async resolveBinarySourcePath(
    renderer: RendererModule,
    type: RemotionBinaryType
  ) {
    const packagedBinaryPath = this.getPackagedBinarySourcePath(type);
    if (packagedBinaryPath) {
      try {
        await stat(packagedBinaryPath);
        return packagedBinaryPath;
      } catch {
        // Fallback to renderer-managed binary in development/runtime environments.
      }
    }

    return renderer.RenderInternals.getExecutablePath({
      type,
      indent: false,
      logLevel: "warn",
      binariesDirectory: null,
    });
  }

  private async shouldCopyBinary(sourcePath: string, targetPath: string) {
    const sourceStat = await stat(sourcePath);
    try {
      const targetStat = await stat(targetPath);
      return sourceStat.size !== targetStat.size;
    } catch {
      return true;
    }
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
    const dataRoot = getDataRootPath();
    const binariesDirectory = path.join(dataRoot, "remotion-binaries");
    await mkdir(path.dirname(videoPath), { recursive: true });

    await this.ensureRuntimeBinaries(renderer, binariesDirectory);
    const browserExecutable = await this.ensureManagedBrowser(
      renderer,
      dataRoot
    );

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
      chromeMode: REMOTION_CHROME_MODE,
      binariesDirectory,
      browserExecutable,
    });

    await renderer.renderMedia({
      codec: "h264",
      composition,
      serveUrl,
      outputLocation: videoPath,
      inputProps,
      logLevel: "warn",
      chromeMode: REMOTION_CHROME_MODE,
      binariesDirectory,
      browserExecutable,
      onProgress: (progress) => {
        const percent = Math.max(
          0,
          Math.min(100, Math.round(progress.progress * 100))
        );
        void onProgress?.(percent);
      },
    });

    return {
      compositionId: DEFAULT_COMPOSITION_ID,
      videoPath,
    };
  }
}
