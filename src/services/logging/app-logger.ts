import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { getDataRootPath } from "@/services/storage/runtime-paths";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogMeta {
  [key: string]: unknown;
}

interface LogRecord {
  level: LogLevel;
  message: string;
  meta?: LogMeta;
  processType: string;
  ts: string;
}

const ERROR_NAME_KEY = "name";
const ERROR_STACK_KEY = "stack";
const ERROR_MESSAGE_KEY = "message";
const MAX_SERIALIZED_LENGTH = 16_000;

function normalizeUnknown(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      [ERROR_NAME_KEY]: value.name,
      [ERROR_MESSAGE_KEY]: value.message,
      [ERROR_STACK_KEY]: value.stack,
    };
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "function") {
    return `[function ${value.name || "anonymous"}]`;
  }

  return value;
}

function safeSerialize(value: unknown) {
  try {
    const serialized = JSON.stringify(value, (_key, currentValue) =>
      normalizeUnknown(currentValue)
    );
    if (!serialized) {
      return undefined;
    }
    if (serialized.length <= MAX_SERIALIZED_LENGTH) {
      return JSON.parse(serialized) as unknown;
    }

    return {
      truncated: true,
      preview: `${serialized.slice(0, MAX_SERIALIZED_LENGTH)}...`,
    };
  } catch (error) {
    return {
      serializationError: true,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function currentProcessType() {
  if (typeof process.type === "string" && process.type.length > 0) {
    return process.type;
  }

  return "browser";
}

export function getLogDirectoryPath() {
  return path.join(getDataRootPath(), "logs");
}

export function getCurrentLogFilePath() {
  const datePart = new Date().toISOString().slice(0, 10);
  return path.join(getLogDirectoryPath(), `app-${datePart}.log`);
}

class AppLogger {
  private writeQueue: Promise<void> = Promise.resolve();

  private enqueueWrite(line: string) {
    this.writeQueue = this.writeQueue
      .then(async () => {
        const filePath = getCurrentLogFilePath();
        await mkdir(path.dirname(filePath), { recursive: true });
        await appendFile(filePath, `${line}\n`, "utf-8");
      })
      .catch((error) => {
        console.error("Failed to write application log", error);
      });
  }

  private write(level: LogLevel, message: string, meta?: LogMeta) {
    const record: LogRecord = {
      ts: new Date().toISOString(),
      level,
      message,
      processType: currentProcessType(),
    };

    if (meta) {
      const serializedMeta = safeSerialize(meta);
      if (serializedMeta && typeof serializedMeta === "object") {
        record.meta = serializedMeta as LogMeta;
      }
    }

    this.enqueueWrite(JSON.stringify(record));
  }

  debug(message: string, meta?: LogMeta) {
    this.write("debug", message, meta);
  }

  info(message: string, meta?: LogMeta) {
    this.write("info", message, meta);
  }

  warn(message: string, meta?: LogMeta) {
    this.write("warn", message, meta);
  }

  error(message: string, meta?: LogMeta) {
    this.write("error", message, meta);
  }
}

export const appLogger = new AppLogger();
