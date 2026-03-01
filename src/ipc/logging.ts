import { appLogger } from "@/services/logging/app-logger";

const TRUNCATED_INPUT_LENGTH = 2000;

function summarizeInput(input: unknown) {
  if (typeof input === "undefined") {
    return undefined;
  }

  try {
    const json = JSON.stringify(input);
    if (!json) {
      return undefined;
    }
    if (json.length <= TRUNCATED_INPUT_LENGTH) {
      return JSON.parse(json) as unknown;
    }

    return {
      truncated: true,
      preview: `${json.slice(0, TRUNCATED_INPUT_LENGTH)}...`,
    };
  } catch (error) {
    return {
      parseError: true,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runLoggedIpcHandler<T>(
  method: string,
  input: unknown,
  handler: () => Promise<T> | T
): Promise<T> {
  const startedAt = Date.now();
  const normalizedInput = summarizeInput(input);
  appLogger.debug("IPC request", {
    method,
    input: normalizedInput,
  });

  try {
    const result = await handler();
    appLogger.debug("IPC success", {
      method,
      durationMs: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    appLogger.error("IPC failure", {
      method,
      durationMs: Date.now() - startedAt,
      input: normalizedInput,
      error,
    });
    throw error;
  }
}
