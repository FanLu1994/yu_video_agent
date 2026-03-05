import { chmod, copyFile, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import { resolveRemotionTemplateById } from "@/constants";
import type { AgentCompositionInput } from "@/remotion/Root";
import { appLogger } from "@/services/logging/app-logger";
import { getDataRootPath } from "@/services/storage/runtime-paths";

export interface RenderAgentVideoInput {
  compositionId?: string;
  inputProps: AgentCompositionInput;
  jobId: string;
  onProgress?: (progressPercent: number) => void | Promise<void>;
  outputDir: string;
}

export interface RenderAgentVideoResult {
  compositionId: string;
  videoPath: string;
}

const REMOTION_CHROME_MODE = "headless-shell";
type RendererModule = typeof import("@remotion/renderer");
type RemotionBinaryType = "compositor" | "ffmpeg" | "ffprobe";

export class RemotionRenderService {
  private runtimePrepared = false;
  private runtimePreparePromise: Promise<void> | null = null;
  private bundleEntryPoint: string | null = null;
  private bundleServeUrl: string | null = null;
  private bundlePromise: Promise<string> | null = null;

  private async resolveEntryPoint() {
    const candidates = app.isPackaged
      ? [
          path.join(process.resourcesPath, "remotion", "index.ts"),
          path.join(process.resourcesPath, "remotion", "index.tsx"),
          path.join(process.resourcesPath, "remotion-src", "index.ts"),
          path.join(process.resourcesPath, "remotion-src", "index.tsx"),
        ]
      : [
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
      `Remotion entrypoint not found. Tried: ${candidates.join(", ")}`
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
    const sourceDirectories = new Set<string>();

    for (const type of binaryTypes) {
      const sourcePath = await this.resolveBinarySourcePath(renderer, type);
      sourceDirectories.add(path.dirname(sourcePath));
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

    if (process.platform === "win32") {
      await this.copyWindowsDllDependencies(
        Array.from(sourceDirectories),
        binariesDirectory
      );
    }

    if (process.platform !== "win32") {
      for (const type of binaryTypes) {
        const binaryPath = path.join(
          binariesDirectory,
          this.getBinaryFileName(type)
        );
        try {
          await chmod(binaryPath, 0o755);
        } catch (error) {
          appLogger.warn("Failed to set binary executable permission", {
            binaryPath,
            error,
          });
        }
      }
    }
  }

  private async copyWindowsDllDependencies(
    sourceDirectories: string[],
    binariesDirectory: string
  ) {
    const copiedDllNames = new Set<string>();

    for (const sourceDirectory of sourceDirectories) {
      const entries = await readdir(sourceDirectory);
      for (const entry of entries) {
        if (!entry.toLowerCase().endsWith(".dll")) {
          continue;
        }

        if (copiedDllNames.has(entry)) {
          continue;
        }

        const sourcePath = path.join(sourceDirectory, entry);
        const targetPath = path.join(binariesDirectory, entry);
        const shouldCopy = await this.shouldCopyBinary(sourcePath, targetPath);
        if (shouldCopy) {
          await copyFile(sourcePath, targetPath);
        }

        copiedDllNames.add(entry);
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

  private async resolveBinarySourcePath(
    renderer: RendererModule,
    type: RemotionBinaryType
  ) {
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

  private async ensureRuntimePrepared(
    renderer: RendererModule,
    dataRoot: string,
    binariesDirectory: string
  ) {
    if (this.runtimePrepared) {
      return;
    }

    if (!this.runtimePreparePromise) {
      this.runtimePreparePromise = (async () => {
        await this.ensureRuntimeBinaries(renderer, binariesDirectory);
        await this.ensureManagedBrowser(renderer, dataRoot);
        this.runtimePrepared = true;
      })().finally(() => {
        this.runtimePreparePromise = null;
      });
    }

    await this.runtimePreparePromise;
  }

  private async getOrCreateServeUrl(
    bundle: typeof import("@remotion/bundler").bundle,
    entryPoint: string,
    onProgress?: (progressPercent: number) => void | Promise<void>
  ) {
    if (this.bundleServeUrl && this.bundleEntryPoint === entryPoint) {
      return this.bundleServeUrl;
    }

    if (this.bundlePromise && this.bundleEntryPoint === entryPoint) {
      return this.bundlePromise;
    }

    this.bundleEntryPoint = entryPoint;
    this.bundlePromise = bundle({
      entryPoint,
      onProgress: (progress) => {
        // Bundle is a meaningful waiting period - expose it as early progress.
        void onProgress?.(Math.max(1, Math.min(30, Math.round(progress * 30))));
      },
      // Reuse cache for faster repeated renders in desktop app runtime.
      enableCaching: true,
    })
      .then((serveUrl) => {
        this.bundleServeUrl = serveUrl;
        return serveUrl;
      })
      .finally(() => {
        this.bundlePromise = null;
      });

    return this.bundlePromise;
  }

  private logPhaseStart(
    jobId: string,
    phase: "bundle" | "selectComposition" | "renderMedia",
    extra: Record<string, unknown> = {}
  ) {
    appLogger.info("Remotion phase started", {
      jobId,
      phase,
      ...extra,
    });
  }

  private summarizeAudioSrc(audioSrc: string | undefined) {
    if (!audioSrc) {
      return {
        kind: "none",
      };
    }

    if (audioSrc.startsWith("data:")) {
      return {
        kind: "data_url",
        length: audioSrc.length,
        preview: `${audioSrc.slice(0, 64)}...`,
      };
    }

    if (/^https?:\/\//i.test(audioSrc)) {
      return {
        kind: "http",
        url: audioSrc,
      };
    }

    if (audioSrc.startsWith("file://")) {
      return {
        kind: "file_url",
        url: audioSrc,
      };
    }

    return {
      kind: "path_or_relative",
      value: audioSrc,
    };
  }

  private logPhaseEnd(
    jobId: string,
    phase: "bundle" | "selectComposition" | "renderMedia",
    startedAt: number,
    extra: Record<string, unknown> = {}
  ) {
    appLogger.info("Remotion phase completed", {
      jobId,
      phase,
      durationMs: Date.now() - startedAt,
      ...extra,
    });
  }

  async renderAgentVideo({
    compositionId,
    inputProps,
    jobId,
    onProgress,
    outputDir,
  }: RenderAgentVideoInput): Promise<RenderAgentVideoResult> {
    const [{ bundle }, renderer] = await Promise.all([
      import("@remotion/bundler"),
      import("@remotion/renderer"),
    ]);

    appLogger.info("Remotion render started", {
      jobId,
      inputProps,
    });

    const entryPoint = await this.resolveEntryPoint();
    const videoPath = path.join(outputDir, "final", "video.mp4");
    const dataRoot = getDataRootPath();
    const binariesDirectory = path.join(dataRoot, "remotion-binaries");
    await mkdir(path.dirname(videoPath), { recursive: true });

    appLogger.info("Remotion render context resolved", {
      jobId,
      entryPoint,
      videoPath,
      dataRoot,
      binariesDirectory,
    });

    await this.ensureRuntimePrepared(renderer, dataRoot, binariesDirectory);
    const browserExecutable =
      process.env.REMOTION_BROWSER_EXECUTABLE?.trim() || undefined;

    appLogger.info("Remotion API bundle started", {
      jobId,
      browserExecutable: browserExecutable ?? "auto",
    });
    const fallbackTemplate = resolveRemotionTemplateById(undefined);
    const selectedCompositionId =
      compositionId || fallbackTemplate.compositionId;
    const bundleStartedAt = Date.now();
    this.logPhaseStart(jobId, "bundle", {
      entryPoint,
    });
    const serveUrl = await this.getOrCreateServeUrl(bundle, entryPoint, onProgress);
    this.logPhaseEnd(jobId, "bundle", bundleStartedAt, {
      entryPoint,
      serveUrl,
    });

    const selectCompositionStartedAt = Date.now();
    this.logPhaseStart(jobId, "selectComposition", {
      compositionId: selectedCompositionId,
    });
    const composition = await renderer.selectComposition({
      id: selectedCompositionId,
      serveUrl,
      inputProps,
      logLevel: "warn",
      chromeMode: REMOTION_CHROME_MODE,
      binariesDirectory,
      browserExecutable,
    });
    this.logPhaseEnd(jobId, "selectComposition", selectCompositionStartedAt, {
      compositionId: selectedCompositionId,
      durationInFrames: composition.durationInFrames,
      fps: composition.fps,
      width: composition.width,
      height: composition.height,
    });

    let lastLoggedPercent = -1;
    const renderMediaStartedAt = Date.now();
    this.logPhaseStart(jobId, "renderMedia", {
      compositionId: selectedCompositionId,
      outputLocation: videoPath,
      audioSrc: this.summarizeAudioSrc(inputProps.audioPath),
    });
    await renderer.renderMedia({
      codec: "h264",
      audioCodec: "aac",
      composition,
      serveUrl,
      outputLocation: videoPath,
      inputProps,
      logLevel: "warn",
      chromeMode: REMOTION_CHROME_MODE,
      binariesDirectory,
      browserExecutable,
      onProgress: ({ progress }) => {
        const percent = Math.max(0, Math.min(100, Math.round(progress * 100)));
        if (percent !== lastLoggedPercent && (percent % 10 === 0 || percent >= 95)) {
          lastLoggedPercent = percent;
          appLogger.info("Remotion API render progress", { jobId, percent });
          void onProgress?.(percent);
        }
      },
    });
    this.logPhaseEnd(jobId, "renderMedia", renderMediaStartedAt, {
      compositionId: selectedCompositionId,
      outputLocation: videoPath,
    });

    const fileStats = await stat(videoPath);
    if (fileStats.size === 0) {
      throw new Error(`Remotion rendered empty video file: ${videoPath}`);
    }

    appLogger.info("Remotion output file verified", {
      jobId,
      videoPath,
      sizeBytes: fileStats.size,
    });

    return {
      compositionId: selectedCompositionId,
      videoPath,
    };
  }
}
