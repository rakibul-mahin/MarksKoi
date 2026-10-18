/**
 * Retries an async operation with exponential backoff and full jitter. Only errors the caller
 * marks as retryable are retried; everything else surfaces immediately.
 */
export type RetryOptions = {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  isRetryable: (err: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function backoffDelay(attempt: number, base: number, max: number, random: () => number): number {
  const ceiling = Math.min(max, base * 2 ** (attempt - 1));
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions): Promise<T> {
  const sleep = opts.sleep ?? defaultSleep;
  const random = opts.random ?? Math.random;
  let lastError: unknown;
  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (attempt === opts.attempts || !opts.isRetryable(err)) throw err;
      const delay = backoffDelay(attempt, opts.baseDelayMs, opts.maxDelayMs, random);
      opts.onRetry?.(err, attempt, delay);
      await sleep(delay);
    }
  }
  throw lastError;
}
