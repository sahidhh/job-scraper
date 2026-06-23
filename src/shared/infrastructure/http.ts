// Shared fetch helper (scrapers.md §4): one retry with a short fixed
// backoff, for network errors, 5xx responses, and 429 (rate limit)
// responses. Other 4xx responses are returned as-is (not retried) so
// callers can log-and-skip immediately.
export interface FetchWithRetryOptions {
  retries?: number; // default 1
  retryDelayMs?: number; // default 2000
}

function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 429;
}

export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  options: FetchWithRetryOptions = {},
): Promise<Response> {
  const retries = options.retries ?? 1;
  const retryDelayMs = options.retryDelayMs ?? 2000;

  let attempt = 0;
  while (true) {
    try {
      const response = await fetch(url, init);
      if (!isRetryableStatus(response.status) || attempt >= retries) {
        return response;
      }
    } catch (error) {
      if (attempt >= retries) {
        throw error;
      }
    }
    attempt += 1;
    await delay(retryDelayMs);
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
