import { afterEach, describe, expect, it, vi } from "vitest";
import { completeLlm } from "@/shared/infrastructure/llmClient";
import { LlmApplicationDraftProvider } from "./LlmApplicationDraftProvider";

vi.mock("@/shared/infrastructure/llmClient", () => ({
  completeLlm: vi.fn(),
}));

const input = {
  kind: "email" as const,
  jobTitle: "Software Engineer",
  companyName: "Acme",
  locationRaw: "Bangalore",
  description: "Build things.",
  resumeText: "Experienced engineer with Python and Kubernetes.",
};

describe("LlmApplicationDraftProvider", () => {
  afterEach(() => {
    vi.mocked(completeLlm).mockReset();
  });

  it("parses a JSON object response into subject/body", async () => {
    vi.mocked(completeLlm).mockResolvedValue({
      text: JSON.stringify({ subject: "Application for Software Engineer", body: "Dear team," }),
      provider: "gemini",
      model: "gemini-2.5-flash",
    });
    const provider = new LlmApplicationDraftProvider();

    const result = await provider.draft(input);

    expect(result).toEqual({ subject: "Application for Software Engineer", body: "Dear team,", model: "gemini-2.5-flash" });
  });

  it("strips markdown code fences before parsing", async () => {
    vi.mocked(completeLlm).mockResolvedValue({
      text: '```json\n{"subject": "S", "body": "B"}\n```',
      provider: "gemini",
      model: "gemini-2.5-flash",
    });
    const provider = new LlmApplicationDraftProvider();

    const result = await provider.draft(input);

    expect(result).toEqual({ subject: "S", body: "B", model: "gemini-2.5-flash" });
  });

  it("throws when the response is not a JSON object", async () => {
    vi.mocked(completeLlm).mockResolvedValue({ text: "not json", provider: "gemini", model: "gemini-2.5-flash" });
    const provider = new LlmApplicationDraftProvider();

    await expect(provider.draft(input)).rejects.toThrow("not a JSON object");
  });

  it("includes job and resume context in the prompt, and requests JSON mode", async () => {
    vi.mocked(completeLlm).mockResolvedValue({ text: '{"subject":"","body":""}', provider: "gemini", model: "gemini-2.5-flash" });
    const provider = new LlmApplicationDraftProvider();

    await provider.draft(input);

    const call = vi.mocked(completeLlm).mock.calls[0]![0];
    expect(call.user).toContain("Software Engineer at Acme");
    expect(call.user).toContain("Build things.");
    expect(call.user).toContain("Experienced engineer with Python and Kubernetes.");
    expect(call.jsonMode).toBe(true);
  });

  it("propagates a completeLlm failure", async () => {
    vi.mocked(completeLlm).mockRejectedValue(new Error("llm down"));
    const provider = new LlmApplicationDraftProvider();

    await expect(provider.draft(input)).rejects.toThrow("llm down");
  });
});
