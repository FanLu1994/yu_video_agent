import { mkdir } from "node:fs/promises";
import path from "node:path";
import { app } from "electron";

const DATA_DIR_NAME = "video-agent";

function getFallbackDataRoot() {
  return path.resolve(process.cwd(), ".video-agent-data");
}

export function getDataRootPath() {
  try {
    if (app.isReady()) {
      return path.join(app.getPath("userData"), DATA_DIR_NAME);
    }
  } catch {
    return getFallbackDataRoot();
  }

  return getFallbackDataRoot();
}

export async function ensureRuntimeDirectories() {
  const root = getDataRootPath();
  await mkdir(root, { recursive: true });
  await mkdir(path.join(root, "db"), { recursive: true });
  await mkdir(path.join(root, "secure"), { recursive: true });
  await mkdir(path.join(root, "voice"), { recursive: true });
  await mkdir(path.join(root, "output"), { recursive: true });

  return root;
}
