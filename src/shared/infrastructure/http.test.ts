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
});
