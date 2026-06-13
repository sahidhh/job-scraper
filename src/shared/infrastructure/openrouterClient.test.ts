import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callOpenRouterJson } from "./openrouterClient";

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
  });

  it("posts the model, messages, and a strict JSON schema, returning the parsed content", async () => {
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
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "role_expansion", strict: true, schema: { type: "object" } },
    });
  });

  it("throws when the response status is not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      callOpenRouterJson({ messages: [], schemaName: "x", schema: {} }),
    ).rejects.toThrow("OpenRouter request failed with status 404");
  });

  it("throws when the response has no message content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: {} }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      callOpenRouterJson({ messages: [], schemaName: "x", schema: {} }),
    ).rejects.toThrow("OpenRouter response missing message content");
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
