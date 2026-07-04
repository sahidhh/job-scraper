import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "./http";

function makeResponse(status: number): Response {
  return new Response(null, { status });
}

describe("fetchWithRetry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the response on success without retrying", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchWithRetry("https://example.com");

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry 4xx responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(404));
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchWithRetry("https://example.com");

    expect(response.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries once on a 5xx response and returns the retry's result", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(503))
      .mockResolvedValueOnce(makeResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchWithRetry("https://example.com", undefined, { retryDelayMs: 1 });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries once on a 429 response and returns the retry's result", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(429))
      .mockResolvedValueOnce(makeResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchWithRetry("https://example.com", undefined, { retryDelayMs: 1 });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns the last 5xx response once retries are exhausted", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(500));
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchWithRetry("https://example.com", undefined, { retries: 1, retryDelayMs: 1 });

    expect(response.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries once on a network error and returns the retry's result", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("network down")).mockResolvedValueOnce(makeResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchWithRetry("https://example.com", undefined, { retryDelayMs: 1 });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting retries on a persistent network error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchWithRetry("https://example.com", undefined, { retries: 1, retryDelayMs: 1 })).rejects.toThrow(
      "network down",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives the retry a fresh AbortSignal instead of reusing the first attempt's already-aborted one", async () => {
    // Regression test: with timeoutMs, each attempt used to share one
    // AbortController created by the caller -- once aborted (timeout), the
    // "retry" reused the same already-aborted signal and failed instantly
    // instead of getting a real second attempt.
    const signals: (AbortSignal | undefined)[] = [];
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      signals.push(init?.signal ?? undefined);
      if (signals.length === 1) {
        // Simulate the first attempt's own timeout aborting its signal.
        return Promise.reject(new DOMException("aborted", "AbortError"));
      }
      return Promise.resolve(makeResponse(200));
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchWithRetry("https://example.com", undefined, { retryDelayMs: 1, timeoutMs: 1000 });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(signals[0]).not.toBe(signals[1]);
    expect(signals[1]?.aborted).toBe(false);
  });
});
