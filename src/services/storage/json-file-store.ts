import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureRuntimeDirectories, getDataRootPath } from "./runtime-paths";

export class JsonFileStore<T> {
  private readonly filePath: string;
  private updateQueue: Promise<void> = Promise.resolve();
  private cachedValue: T | null = null;
  private cacheLoaded = false;

  constructor(
    fileName: string,
    private readonly defaultValue: T
  ) {
    this.filePath = path.join(getDataRootPath(), "db", fileName);
  }

  private cloneValue(value: T): T {
    return structuredClone(value);
  }

  private async readFromDisk(): Promise<T> {
    await ensureRuntimeDirectories();

    try {
      const raw = await readFile(this.filePath, "utf-8");
      return JSON.parse(raw) as T;
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: string }).code)
          : "";
      if (code === "ENOENT") {
        return this.cloneValue(this.defaultValue);
      }

      return this.defaultValue;
    }
  }

  private async writeToDisk(value: T): Promise<void> {
    await ensureRuntimeDirectories();
    const parentDir = path.dirname(this.filePath);
    await mkdir(parentDir, { recursive: true });

    // Atomic replace to avoid partial-read JSON corruption during concurrent IPC reads.
    const tempFilePath = `${this.filePath}.tmp-${process.pid}-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`;
    await writeFile(tempFilePath, JSON.stringify(value, null, 2), "utf-8");
    await rename(tempFilePath, this.filePath);
  }

  private async ensureCacheLoaded() {
    if (this.cacheLoaded && this.cachedValue) {
      return;
    }

    this.cachedValue = await this.readFromDisk();
    this.cacheLoaded = true;
  }

  async read(): Promise<T> {
    await this.updateQueue;
    await this.ensureCacheLoaded();
    return this.cloneValue(this.cachedValue as T);
  }

  async write(value: T): Promise<void> {
    this.updateQueue = this.updateQueue.then(async () => {
      const next = this.cloneValue(value);
      await this.writeToDisk(next);
      this.cachedValue = next;
      this.cacheLoaded = true;
    });

    await this.updateQueue;
  }

  async update(updater: (prev: T) => T): Promise<T> {
    let updated: T = this.cloneValue(this.defaultValue);

    this.updateQueue = this.updateQueue.then(async () => {
      await this.ensureCacheLoaded();
      const prev = this.cloneValue(this.cachedValue as T);
      const next = updater(prev);
      await this.writeToDisk(next);
      this.cachedValue = this.cloneValue(next);
      this.cacheLoaded = true;
      updated = this.cloneValue(next);
    });

    await this.updateQueue;
    return updated;
  }
}
