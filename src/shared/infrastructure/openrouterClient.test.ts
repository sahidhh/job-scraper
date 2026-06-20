import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenRouterError, callOpenRouterJson } from "./openrouterClient";

function chatResponse(content: unknown, status = 200): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("callOpenRouterJson", () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_MODEL = "test-model";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_MODEL;
    delete process.env.OPENROUTER_MAX_TOKENS;
  });

  it("posts the model, messages, max_tokens, and a strict JSON schema, returning the parsed content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse({ relatedRoles: ["a", "b"] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await callOpenRouterJson({
      messages: [{ role: "user", content: "hello" }],
      schemaName: "role_expansion",
      schema: { type: "object" },
    });

    expect(result).toEqual({ relatedRoles: ["a", "b"] });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.headers).toMatchObject({ Authorization: "Bearer test-key" });

    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("test-model");
    expect(body.messages).toEqual([{ role: "user", content: "hello" }]);
    expect(body.max_tokens).toBe(300);
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "role_expansion", strict: true, schema: { type: "object" } },
    });
  });

  it("sends max_tokens: 300 by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse({ score: 0.8, reasoning: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    await callOpenRouterJson({ messages: [], schemaName: "x", schema: {} });

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.max_tokens).toBe(300);
  });

  it("sends OPENROUTER_MAX_TOKENS when the env var is set", async () => {
    process.env.OPENROUTER_MAX_TOKENS = "150";
    const fetchMock = vi.fn().mockResolvedValue(chatResponse({ score: 0.5, reasoning: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    await callOpenRouterJson({ messages: [], schemaName: "x", schema: {} });

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.max_tokens).toBe(150);
  });

  it("throws OpenRouterError with reason quota_exceeded on 402", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("insufficient credits", { status: 402 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const err = await callOpenRouterJson({ messages: [], schemaName: "x", schema: {} }).catch((e) => e);

    expect(err).toBeInstanceOf(OpenRouterError);
    expect((err as OpenRouterError).reason).toBe("quota_exceeded");
    expect(err.message).toContain("402");
  });

  it("throws OpenRouterError with reason provider_rate_limit on 429", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 429 }))
      .mockResolvedValue(new Response(null, { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    const err = await callOpenRouterJson({ messages: [], schemaName: "x", schema: {} }).catch((e) => e);

    expect(err).toBeInstanceOf(OpenRouterError);
    expect((err as OpenRouterError).reason).toBe("provider_rate_limit");
  });

  it("throws OpenRouterError with reason provider_error when all retries return 5xx", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const err = await callOpenRouterJson({ messages: [], schemaName: "x", schema: {} }).catch((e) => e);

    expect(err).toBeInstanceOf(OpenRouterError);
    expect((err as OpenRouterError).reason).toBe("provider_error");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws OpenRouterError with reason malformed_response when content is missing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: {} }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const err = await callOpenRouterJson({ messages: [], schemaName: "x", schema: {} }).catch((e) => e);

    expect(err).toBeInstanceOf(OpenRouterError);
    expect((err as OpenRouterError).reason).toBe("malformed_response");
  });

  it("retries once on a 5xx response and succeeds on the second attempt", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(chatResponse({ score: 0.5, reasoning: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await callOpenRouterJson({ messages: [], schemaName: "x", schema: {} });

    expect(result).toEqual({ score: 0.5, reasoning: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
