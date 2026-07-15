import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LlmError, completeLlm } from "./llmClient";

function geminiResponse(text: string, status = 200): Response {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] }), {
    status,
  });
}

function anthropicResponse(text: string, status = 200): Response {
  return new Response(JSON.stringify({ content: [{ type: "text", text }] }), { status });
}

function openRouterResponse(
  content: string,
  status = 200,
  usage?: { prompt_tokens?: number; completion_tokens?: number },
): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }], usage }), { status });
}

describe("completeLlm", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_MODEL;
    delete process.env.GEMINI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
  });

  // AD-42: the default provider routes through the same OpenRouter client
  // and OPENROUTER_API_KEY that scoring already requires -- no
  // GEMINI_API_KEY needed unless the caller explicitly opts into
  // LLM_PROVIDER=gemini.
  describe("openrouter (default provider)", () => {
    beforeEach(() => {
      process.env.OPENROUTER_API_KEY = "openrouter-key";
    });

    it("posts system/user as chat messages to OpenRouter and returns the response text", async () => {
      const fetchMock = vi.fn().mockResolvedValue(openRouterResponse("hello back"));
      vi.stubGlobal("fetch", fetchMock);

      const result = await completeLlm({ system: "sys", user: "usr", maxTokens: 500 });

      expect(result).toEqual({ text: "hello back", provider: "openrouter", model: "google/gemini-2.5-flash" });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
      expect(init.headers).toMatchObject({ Authorization: "Bearer openrouter-key" });
      const body = JSON.parse(init.body as string);
      expect(body.model).toBe("google/gemini-2.5-flash");
      expect(body.messages).toEqual([
        { role: "system", content: "sys" },
        { role: "user", content: "usr" },
      ]);
      expect(body.max_tokens).toBe(500);
    });

    it("uses LLM_MODEL override when set", async () => {
      process.env.LLM_MODEL = "openrouter-custom";
      const fetchMock = vi.fn().mockResolvedValue(openRouterResponse("ok"));
      vi.stubGlobal("fetch", fetchMock);

      const result = await completeLlm({ system: "s", user: "u", maxTokens: 100 });
      expect(result.model).toBe("openrouter-custom");
    });

    it("requests json_object mode (not a strict schema) when jsonMode is true", async () => {
      const fetchMock = vi.fn().mockResolvedValue(openRouterResponse("{}"));
      vi.stubGlobal("fetch", fetchMock);

      await completeLlm({ system: "s", user: "u", maxTokens: 100, jsonMode: true });

      const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
      expect(body.response_format).toEqual({ type: "json_object" });
    });

    it("throws LlmError with reason quota_exceeded on 402 (OpenRouterError reason preserved)", async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response("insufficient credits", { status: 402 }));
      vi.stubGlobal("fetch", fetchMock);

      const err = await completeLlm({ system: "s", user: "u", maxTokens: 100 }).catch((e) => e);

      expect(err).toBeInstanceOf(LlmError);
      expect((err as LlmError).reason).toBe("quota_exceeded");
    });

    it("throws LlmError with reason malformed_response when no choices have content", async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: {} }] }), { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);

      const err = await completeLlm({ system: "s", user: "u", maxTokens: 100 }).catch((e) => e);

      expect(err).toBeInstanceOf(LlmError);
      expect((err as LlmError).reason).toBe("malformed_response");
    });
  });

  describe("gemini (LLM_PROVIDER=gemini)", () => {
    beforeEach(() => {
      process.env.LLM_PROVIDER = "gemini";
      process.env.GEMINI_API_KEY = "gemini-key";
    });

    it("posts system/user content and returns the response text", async () => {
      const fetchMock = vi.fn().mockResolvedValue(geminiResponse("hello back"));
      vi.stubGlobal("fetch", fetchMock);

      const result = await completeLlm({ system: "sys", user: "usr", maxTokens: 500 });

      expect(result).toEqual({ text: "hello back", provider: "gemini", model: "gemini-2.5-flash" });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
      expect(init.headers).toMatchObject({ "x-goog-api-key": "gemini-key" });
      const body = JSON.parse(init.body as string);
      expect(body.systemInstruction).toEqual({ parts: [{ text: "sys" }] });
      expect(body.contents).toEqual([{ role: "user", parts: [{ text: "usr" }] }]);
      expect(body.generationConfig.maxOutputTokens).toBe(500);
    });

    it("uses LLM_MODEL override when set", async () => {
      process.env.LLM_MODEL = "gemini-custom";
      const fetchMock = vi.fn().mockResolvedValue(geminiResponse("ok"));
      vi.stubGlobal("fetch", fetchMock);

      const result = await completeLlm({ system: "s", user: "u", maxTokens: 100 });
      expect(result.model).toBe("gemini-custom");
    });

    it("sets responseMimeType and disables thinking when jsonMode is true", async () => {
      const fetchMock = vi.fn().mockResolvedValue(geminiResponse("{}"));
      vi.stubGlobal("fetch", fetchMock);

      await completeLlm({ system: "s", user: "u", maxTokens: 100, jsonMode: true });

      const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
      expect(body.generationConfig.responseMimeType).toBe("application/json");
      expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
    });

    it("throws LlmError with reason provider_rate_limit on 429", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 429 }))
        .mockResolvedValue(new Response(null, { status: 429 }));
      vi.stubGlobal("fetch", fetchMock);

      const err = await completeLlm({ system: "s", user: "u", maxTokens: 100 }).catch((e) => e);

      expect(err).toBeInstanceOf(LlmError);
      expect((err as LlmError).reason).toBe("provider_rate_limit");
    });

    it("throws LlmError with reason malformed_response when no candidates have text", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ candidates: [{ finishReason: "SAFETY" }] }), { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);

      const err = await completeLlm({ system: "s", user: "u", maxTokens: 100 }).catch((e) => e);

      expect(err).toBeInstanceOf(LlmError);
      expect((err as LlmError).reason).toBe("malformed_response");
      expect(err.message).toContain("SAFETY");
    });
  });

  describe("anthropic", () => {
    beforeEach(() => {
      process.env.LLM_PROVIDER = "anthropic";
      process.env.ANTHROPIC_API_KEY = "anthropic-key";
    });

    it("posts system/messages and returns the response text", async () => {
      const fetchMock = vi.fn().mockResolvedValue(anthropicResponse("hi"));
      vi.stubGlobal("fetch", fetchMock);

      const result = await completeLlm({ system: "sys", user: "usr", maxTokens: 500 });

      expect(result).toEqual({ text: "hi", provider: "anthropic", model: "claude-haiku-4-5" });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.anthropic.com/v1/messages");
      expect(init.headers).toMatchObject({ "x-api-key": "anthropic-key", "anthropic-version": "2023-06-01" });
      const body = JSON.parse(init.body as string);
      expect(body.system).toBe("sys");
      expect(body.messages).toEqual([{ role: "user", content: "usr" }]);
      expect(body.max_tokens).toBe(500);
    });

    it("throws LlmError with reason provider_error on repeated 5xx", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 503 }))
        .mockResolvedValueOnce(new Response(null, { status: 503 }));
      vi.stubGlobal("fetch", fetchMock);

      const err = await completeLlm({ system: "s", user: "u", maxTokens: 100 }).catch((e) => e);

      expect(err).toBeInstanceOf(LlmError);
      expect((err as LlmError).reason).toBe("provider_error");
    });

    it("throws LlmError with reason malformed_response when content has no text blocks", async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ content: [] }), { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);

      const err = await completeLlm({ system: "s", user: "u", maxTokens: 100 }).catch((e) => e);

      expect(err).toBeInstanceOf(LlmError);
      expect((err as LlmError).reason).toBe("malformed_response");
    });
  });

  it("throws LlmError with reason timeout when the request aborts (default openrouter provider)", async () => {
    process.env.OPENROUTER_API_KEY = "openrouter-key";
    const fetchMock = vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError"));
    vi.stubGlobal("fetch", fetchMock);

    const err = await completeLlm({ system: "s", user: "u", maxTokens: 100 }).catch((e) => e);

    expect(err).toBeInstanceOf(LlmError);
    expect((err as LlmError).reason).toBe("timeout");
  });
});
