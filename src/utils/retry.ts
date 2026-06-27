import { logger } from "./logger";

export interface RetryOptions {
  retries?: number;
  /** Base delay in ms; actual delay grows exponentially: base * 2^attempt */
  baseDelayMs?: number;
  label?: string;
}

/**
 * Runs `fn`, retrying on failure with exponential backoff.
 * Throws the last error if all attempts are exhausted.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { retries = 3, baseDelayMs = 500, label = "operation" } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isLastAttempt = attempt === retries;
      const message = err instanceof Error ? err.message : String(err);

      if (isLastAttempt) {
        logger.error(`${label} failed after ${retries + 1} attempt(s)`, {
          error: message,
        });
        break;
      }

      const delay = baseDelayMs * Math.pow(2, attempt);
      logger.warn(`${label} failed, retrying`, {
        attempt: attempt + 1,
        maxAttempts: retries + 1,
        delayMs: delay,
        error: message,
      });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
