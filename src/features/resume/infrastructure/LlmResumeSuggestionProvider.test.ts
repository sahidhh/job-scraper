import { afterEach, describe, expect, it, vi } from "vitest";
import { completeLlm } from "@/shared/infrastructure/llmClient";
import { LlmResumeSuggestionProvider } from "./LlmResumeSuggestionProvider";

vi.mock("@/shared/infrastructure/llmClient", () => ({
  completeLlm: vi.fn(),
}));

describe("LlmResumeSuggestionProvider", () => {
  afterEach(() => {
    vi.mocked(completeLlm).mockReset();
  });

  describe("suggest", () => {
    it("parses a JSON array response into suggestion items with sequential ids", async () => {
      vi.mocked(completeLlm).mockResolvedValue({
        text: JSON.stringify([
          { category: "Impact", title: "Add metrics", detail: "Quantify your bullet points" },
          { category: "Skills", title: "Add Kubernetes", detail: "You mention Docker but not k8s" },
        ]),
        provider: "gemini",
        model: "gemini-2.5-flash",
      });
      const provider = new LlmResumeSuggestionProvider();

      const result = await provider.suggest({ resumeText: "Engineer with Docker experience", targetRole: "SRE" });

      expect(result.model).toBe("gemini-2.5-flash");
      expect(result.items).toEqual([
        { id: "s1", category: "Impact", title: "Add metrics", detail: "Quantify your bullet points" },
        { id: "s2", category: "Skills", title: "Add Kubernetes", detail: "You mention Docker but not k8s" },
      ]);
    });

    it("strips markdown code fences before parsing", async () => {
      vi.mocked(completeLlm).mockResolvedValue({
        text: '```json\n[{"category": "Clarity", "title": "T", "detail": "D"}]\n```',
        provider: "gemini",
        model: "gemini-2.5-flash",
      });
      const provider = new LlmResumeSuggestionProvider();

      const result = await provider.suggest({ resumeText: "text", targetRole: "" });

      expect(result.items).toEqual([{ id: "s1", category: "Clarity", title: "T", detail: "D" }]);
    });

    it("falls back to Clarity for an unrecognized category", async () => {
      vi.mocked(completeLlm).mockResolvedValue({
        text: JSON.stringify([{ category: "Nonsense", title: "T", detail: "D" }]),
        provider: "gemini",
        model: "gemini-2.5-flash",
      });
      const provider = new LlmResumeSuggestionProvider();

      const result = await provider.suggest({ resumeText: "text", targetRole: "" });

      expect(result.items[0]!.category).toBe("Clarity");
    });

    it("throws when the response is not a JSON array", async () => {
      vi.mocked(completeLlm).mockResolvedValue({
        text: "not json at all",
        provider: "gemini",
        model: "gemini-2.5-flash",
      });
      const provider = new LlmResumeSuggestionProvider();

      await expect(provider.suggest({ resumeText: "text", targetRole: "" })).rejects.toThrow(
        "not a JSON array",
      );
    });

    it("includes the target role in the prompt when provided", async () => {
      vi.mocked(completeLlm).mockResolvedValue({ text: "[]", provider: "gemini", model: "gemini-2.5-flash" });
      const provider = new LlmResumeSuggestionProvider();

      await provider.suggest({ resumeText: "Resume body", targetRole: "Staff Engineer" });

      const call = vi.mocked(completeLlm).mock.calls[0]![0];
      expect(call.user).toContain("Target role: Staff Engineer");
      expect(call.user).toContain("Resume body");
      expect(call.jsonMode).toBe(true);
    });
  });

  describe("rewrite", () => {
    it("sends the chosen suggestions and resume text, returning the trimmed rewrite", async () => {
      vi.mocked(completeLlm).mockResolvedValue({
        text: "  Rewritten resume text  ",
        provider: "gemini",
        model: "gemini-2.5-flash",
      });
      const provider = new LlmResumeSuggestionProvider();

      const result = await provider.rewrite({
        resumeText: "Original resume",
        chosen: [{ id: "s1", category: "Impact", title: "Add metrics", detail: "Quantify bullets" }],
      });

      expect(result).toBe("Rewritten resume text");
      const call = vi.mocked(completeLlm).mock.calls[0]![0];
      expect(call.user).toContain("- Add metrics: Quantify bullets");
      expect(call.user).toContain("Original resume");
      expect(call.jsonMode).toBeUndefined();
    });

    it("propagates a completeLlm failure", async () => {
      vi.mocked(completeLlm).mockRejectedValue(new Error("llm down"));
      const provider = new LlmResumeSuggestionProvider();

      await expect(
        provider.rewrite({ resumeText: "text", chosen: [{ id: "s1", category: "Impact", title: "T", detail: "D" }] }),
      ).rejects.toThrow("llm down");
    });
  });
});
