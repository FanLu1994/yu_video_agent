import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { getDataRootPath } from "@/services/storage/runtime-paths";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogMeta {
  [key: string]: unknown;
}

const ERROR_NAME_KEY = "name";
const ERROR_STACK_KEY = "stack";
const ERROR_MESSAGE_KEY = "message";
const MAX_SERIALIZED_LENGTH = 16_000;
const MAX_META_DEPTH = 4;
const QUOTED_VALUE_PATTERN = /\s|=|"/;

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

function formatTimestamp(date: Date) {
  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 23)} UTC`;
}

function sanitizeLogText(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\r", "\\r")
    .replaceAll("\n", "\\n");
}

function formatLogValue(value: unknown): string {
  if (typeof value === "undefined") {
    return "undefined";
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "string") {
    const sanitized = sanitizeLogText(value);
    return QUOTED_VALUE_PATTERN.test(sanitized)
      ? `"${sanitized.replaceAll('"', '\\"')}"`
      : sanitized;
  }

  return String(value);
}

function flattenMetaEntries(
  key: string,
  value: unknown,
  entries: string[],
  depth: number
) {
  if (depth >= MAX_META_DEPTH) {
    entries.push(`${key}=<depth-limit>`);
    return;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      entries.push(`${key}=[]`);
      return;
    }
    for (let index = 0; index < value.length; index += 1) {
      flattenMetaEntries(`${key}[${index}]`, value[index], entries, depth + 1);
    }
    return;
  }

  if (value && typeof value === "object") {
    const objectEntries = Object.entries(value as Record<string, unknown>);
    if (objectEntries.length === 0) {
      entries.push(`${key}={}`);
      return;
    }
    for (const [childKey, childValue] of objectEntries) {
      flattenMetaEntries(`${key}.${childKey}`, childValue, entries, depth + 1);
    }
    return;
  }

  entries.push(`${key}=${formatLogValue(value)}`);
}

function formatMeta(meta: LogMeta | undefined) {
  if (!meta) {
    return "";
  }

  const normalizedMeta = safeSerialize(meta);
  if (!normalizedMeta || typeof normalizedMeta !== "object") {
    return "";
  }

  const entries: string[] = [];
  for (const [key, value] of Object.entries(
    normalizedMeta as Record<string, unknown>
  )) {
    flattenMetaEntries(key, value, entries, 0);
  }

  return entries.join(" ");
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
    const timestamp = formatTimestamp(new Date());
    const levelLabel = level.toUpperCase();
    const processType = currentProcessType();
    const metaText = formatMeta(meta);
    const baseLine = `${timestamp} [${levelLabel}] [${processType}] ${sanitizeLogText(message)}`;
    const line = metaText ? `${baseLine} | ${metaText}` : baseLine;

    this.enqueueWrite(line);
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
