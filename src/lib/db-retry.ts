import "server-only";

import { db } from "@/lib/db";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "";
}

export function isTransientDatabaseError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();

  return (
    message.includes("can't reach database server") ||
    message.includes("error in postgresql connection") ||
    message.includes("kind: closed") ||
    message.includes("connection closed") ||
    message.includes("failed to fetch") ||
    message.includes("connection") ||
    message.includes("socket") ||
    message.includes("timeout") ||
    message.includes("econnreset") ||
    message.includes("econnrefused")
  );
}

export async function withDatabaseRetry<T>(
  operation: () => Promise<T>,
  options?: {
    retries?: number;
    initialDelayMs?: number;
  },
): Promise<T> {
  const retries = options?.retries ?? 4;
  const initialDelayMs = options?.initialDelayMs ?? 300;

  let attempt = 0;
  let lastError: unknown;

  while (attempt <= retries) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === retries || !isTransientDatabaseError(error)) {
        throw error;
      }

      try {
        await db.$disconnect();
      } catch {
        // Best effort only. Retry should still proceed.
      }

      try {
        await db.$connect();
      } catch {
        // Best effort only. Retry should still proceed.
      }

      const delay = initialDelayMs * 2 ** attempt;
      await sleep(delay);
      attempt += 1;
    }
  }

  throw lastError;
}
