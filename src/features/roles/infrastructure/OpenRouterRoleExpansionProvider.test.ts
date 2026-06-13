import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenRouterRoleExpansionProvider } from "./OpenRouterRoleExpansionProvider";

function chatResponse(content: unknown): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("OpenRouterRoleExpansionProvider", () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_MODEL = "test-model";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_MODEL;
  });

  it("returns the related roles from a well-formed response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      chatResponse({ relatedRoles: ["Backend Engineer", "Platform Engineer"] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterRoleExpansionProvider();
    const result = await provider.expand("Software Engineer");

    expect(result).toEqual(["Backend Engineer", "Platform Engineer"]);

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.messages[1].content).toContain("Software Engineer");
  });

  it("filters out non-string entries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse({ relatedRoles: ["Backend Engineer", 42, null] }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterRoleExpansionProvider();
    const result = await provider.expand("Software Engineer");

    expect(result).toEqual(["Backend Engineer"]);
  });

  it("throws when relatedRoles is missing from the response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterRoleExpansionProvider();

    await expect(provider.expand("Software Engineer")).rejects.toThrow(
      "OpenRouter role expansion response missing relatedRoles array",
    );
  });
});
