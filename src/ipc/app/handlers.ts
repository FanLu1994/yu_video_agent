import { os } from "@orpc/server";
import { app } from "electron";
import { stat } from "node:fs/promises";
import path from "node:path";
import { runLoggedIpcHandler } from "../logging";

export const currentPlatfom = os.handler(() => {
  return runLoggedIpcHandler("app.currentPlatform", undefined, () => {
    return process.platform;
  });
});

export const appVersion = os.handler(() => {
  return runLoggedIpcHandler("app.appVersion", undefined, () => {
    return app.getVersion();
  });
});

type RuntimeDependencyStatus = "ok" | "missing";
type RuntimeDependencyId = "node" | "remotion";

interface RuntimeDependencyCheckItem {
  detail: string;
  id: RuntimeDependencyId;
  installHint: string;
  label: string;
  status: RuntimeDependencyStatus;
}

async function runVersionCommand(command: string, args: string[]) {
  try {
    if (command === "node" && args[0] === "--version") {
      return { ok: true, detail: process.version };
    }
  } catch {
    // continue fallback
  }

  return { ok: false, detail: "无法检测 Node 版本" };
}

async function resolveRemotionEntrypoint() {
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
      return { ok: true, detail: `entrypoint: ${candidate}` };
    } catch {
      // continue
    }
  }

  return {
    ok: false,
    detail: `entrypoint 缺失（已检查 ${candidates.length} 个路径）`,
  };
}

async function detectRemotionRuntime() {
  try {
    await Promise.all([import("@remotion/renderer"), import("@remotion/bundler")]);
  } catch (error) {
    return {
      ok: false,
      detail:
        error instanceof Error
          ? `Remotion 运行时加载失败：${error.message}`
          : "Remotion 运行时加载失败",
    };
  }

  return resolveRemotionEntrypoint();
}

export const runtimeDependencies = os.handler(async () => {
  return runLoggedIpcHandler("app.runtimeDependencies", undefined, async () => {
    const [nodeResult, remotionResult] = await Promise.all([
      runVersionCommand("node", ["--version"]),
      detectRemotionRuntime(),
    ]);

    const items: RuntimeDependencyCheckItem[] = [
      {
        id: "node",
        label: "Node.js",
        status: nodeResult.ok ? "ok" : "missing",
        detail: nodeResult.detail,
        installHint:
          "安装 Node.js LTS，并确保 `node --version` 在终端可用。",
      },
      {
        id: "remotion",
        label: "Remotion Runtime",
        status: remotionResult.ok ? "ok" : "missing",
        detail: remotionResult.detail,
        installHint:
          "确保应用内置 Remotion 运行时与 remotion entrypoint 资源（打包时需包含 src/remotion）。",
      },
    ];

    return {
      checkedAt: new Date().toISOString(),
      overallReady: items.every((item) => item.status === "ok"),
      items,
    };
  });
});
