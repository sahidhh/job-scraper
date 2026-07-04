import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenRouterError, callOpenRouterJson } from "./openrouterClient";

function chatResponse(
  content: unknown,
  status = 200,
  usage?: { prompt_tokens?: number; completion_tokens?: number },
): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }], usage }),
    { status, headers: { "Content-Type": "application/json" } },
  );
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

    const { payload } = await callOpenRouterJson({
      messages: [{ role: "user", content: "hello" }],
      schemaName: "role_expansion",
      schema: { type: "object" },
    });

    expect(payload).toEqual({ relatedRoles: ["a", "b"] });

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

    const { payload } = await callOpenRouterJson({ messages: [], schemaName: "x", schema: {} });
    expect(payload).toBeDefined();

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.max_tokens).toBe(300);
  });

  it("sends OPENROUTER_MAX_TOKENS when the env var is set", async () => {
    process.env.OPENROUTER_MAX_TOKENS = "150";
    const fetchMock = vi.fn().mockResolvedValue(chatResponse({ score: 0.5, reasoning: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    const { payload } = await callOpenRouterJson({ messages: [], schemaName: "x", schema: {} });
    expect(payload).toBeDefined();

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

  it("throws OpenRouterError with reason malformed_response (not unknown) when content is not valid JSON", async () => {
    // Regression test: a JSON.parse failure used to fall through to the
    // generic catch block and get classified as "unknown" instead of
    // "malformed_response".
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "not json {" } }], usage: { prompt_tokens: 100, completion_tokens: 20 } }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const err = await callOpenRouterJson({ messages: [], schemaName: "x", schema: {} }).catch((e) => e);

    expect(err).toBeInstanceOf(OpenRouterError);
    expect((err as OpenRouterError).reason).toBe("malformed_response");
  });

  it("attaches already-billed token usage to the thrown error when content is missing or invalid", async () => {
    // Regression test: usage was computed before the malformed-response
    // throw but discarded, undercounting real (billed) token spend.
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: {} }], usage: { prompt_tokens: 500, completion_tokens: 0 } }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const err = await callOpenRouterJson({ messages: [], schemaName: "x", schema: {} }).catch((e) => e);

    expect(err).toBeInstanceOf(OpenRouterError);
    expect((err as OpenRouterError).usage).toEqual({ promptTokens: 500, completionTokens: 0 });
  });

  it("retries once on a 5xx response and succeeds on the second attempt", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(chatResponse({ score: 0.5, reasoning: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    const { payload } = await callOpenRouterJson({ messages: [], schemaName: "x", schema: {} });

    expect(payload).toEqual({ score: 0.5, reasoning: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns token usage when the response includes usage", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(chatResponse({ score: 0.7, reasoning: "good" }, 200, { prompt_tokens: 1200, completion_tokens: 80 }));
    vi.stubGlobal("fetch", fetchMock);

    const { usage } = await callOpenRouterJson({ messages: [], schemaName: "x", schema: {} });

    expect(usage.promptTokens).toBe(1200);
    expect(usage.completionTokens).toBe(80);
  });

  it("returns null token usage when the response omits usage", async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse({ score: 0.5, reasoning: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    const { usage } = await callOpenRouterJson({ messages: [], schemaName: "x", schema: {} });

    expect(usage.promptTokens).toBeNull();
    expect(usage.completionTokens).toBeNull();
  });
});
