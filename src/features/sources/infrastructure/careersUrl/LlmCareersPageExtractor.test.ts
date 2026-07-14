import { afterEach, describe, expect, it, vi } from "vitest";
import { completeLlm } from "@/shared/infrastructure/llmClient";
import { LlmCareersPageExtractor } from "./LlmCareersPageExtractor";

vi.mock("@/shared/infrastructure/llmClient", () => ({
  completeLlm: vi.fn(),
}));

describe("LlmCareersPageExtractor", () => {
  afterEach(() => {
    vi.mocked(completeLlm).mockReset();
  });

  it("parses a JSON array response into extracted jobs", async () => {
    vi.mocked(completeLlm).mockResolvedValue({
      text: JSON.stringify([
        { title: "Backend Engineer", location: "Remote", description: "Build APIs.", url: "https://acme.com/jobs/1" },
      ]),
      provider: "gemini",
      model: "gemini-2.5-flash",
    });
    const extractor = new LlmCareersPageExtractor();

    const result = await extractor.extract("https://acme.com/careers", "Backend Engineer - Remote");

    expect(result).toEqual([
      { title: "Backend Engineer", location: "Remote", description: "Build APIs.", url: "https://acme.com/jobs/1" },
    ]);
  });

  it("strips markdown code fences before parsing", async () => {
    vi.mocked(completeLlm).mockResolvedValue({
      text: '```json\n[{"title":"Engineer","location":"","description":"","url":""}]\n```',
      provider: "gemini",
      model: "gemini-2.5-flash",
    });
    const extractor = new LlmCareersPageExtractor();

    const result = await extractor.extract("https://acme.com/careers", "text");

    expect(result).toEqual([{ title: "Engineer", location: "", description: "", url: "" }]);
  });

  it("defaults missing fields to empty strings", async () => {
    vi.mocked(completeLlm).mockResolvedValue({
      text: JSON.stringify([{ title: "Engineer" }]),
      provider: "gemini",
      model: "gemini-2.5-flash",
    });
    const extractor = new LlmCareersPageExtractor();

    const result = await extractor.extract("https://acme.com/careers", "text");

    expect(result).toEqual([{ title: "Engineer", location: "", description: "", url: "" }]);
  });

  it("returns [] (does not throw) when the response is not a JSON array", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(completeLlm).mockResolvedValue({ text: "not json", provider: "gemini", model: "gemini-2.5-flash" });
    const extractor = new LlmCareersPageExtractor();

    const result = await extractor.extract("https://acme.com/careers", "text");

    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("unparseable response"));
    warnSpy.mockRestore();
  });

  it("returns [] when the page has no jobs", async () => {
    vi.mocked(completeLlm).mockResolvedValue({ text: "[]", provider: "gemini", model: "gemini-2.5-flash" });
    const extractor = new LlmCareersPageExtractor();

    const result = await extractor.extract("https://acme.com/careers", "About us...");

    expect(result).toEqual([]);
  });

  it("caps results at MAX_JOBS_PER_CHUNK", async () => {
    const manyJobs = Array.from({ length: 20 }, (_, i) => ({ title: `Job ${i}`, location: "", description: "", url: "" }));
    vi.mocked(completeLlm).mockResolvedValue({ text: JSON.stringify(manyJobs), provider: "gemini", model: "gemini-2.5-flash" });
    const extractor = new LlmCareersPageExtractor();

    const result = await extractor.extract("https://acme.com/careers", "text");

    expect(result).toHaveLength(15);
  });

  it("requests JSON mode and includes the page URL and text in the prompt", async () => {
    vi.mocked(completeLlm).mockResolvedValue({ text: "[]", provider: "gemini", model: "gemini-2.5-flash" });
    const extractor = new LlmCareersPageExtractor();

    await extractor.extract("https://acme.com/careers", "Some page text");

    const call = vi.mocked(completeLlm).mock.calls[0]![0];
    expect(call.jsonMode).toBe(true);
    expect(call.user).toContain("https://acme.com/careers");
    expect(call.user).toContain("Some page text");
  });

  it("propagates a completeLlm failure", async () => {
    vi.mocked(completeLlm).mockRejectedValue(new Error("llm down"));
    const extractor = new LlmCareersPageExtractor();

    await expect(extractor.extract("https://acme.com/careers", "text")).rejects.toThrow("llm down");
  });
});
