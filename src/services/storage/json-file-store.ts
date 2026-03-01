import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureRuntimeDirectories, getDataRootPath } from "./runtime-paths";

export class JsonFileStore<T> {
  private readonly filePath: string;

  constructor(
    fileName: string,
    private readonly defaultValue: T
  ) {
    this.filePath = path.join(getDataRootPath(), "db", fileName);
  }

  async read(): Promise<T> {
    await ensureRuntimeDirectories();

    try {
      const raw = await readFile(this.filePath, "utf-8");
      return JSON.parse(raw) as T;
    } catch {
      return this.defaultValue;
    }
  }

  async write(value: T): Promise<void> {
    await ensureRuntimeDirectories();
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(value, null, 2), "utf-8");
  }

  async update(updater: (prev: T) => T): Promise<T> {
    const prev = await this.read();
    const next = updater(prev);
    await this.write(next);
    return next;
  }
}
