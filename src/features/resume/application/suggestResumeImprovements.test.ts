import { describe, expect, it, vi } from "vitest";
import type { Resume, ResumeSuggestionItem, ResumeSuggestionSet } from "@/features/resume/domain/types";
import type { ResumeSuggestionProvider } from "@/features/resume/domain/ResumeSuggestionProvider";
import type { ResumeSuggestionRepository } from "@/features/resume/domain/ResumeSuggestionRepository";
import { DEFAULT_SUGGESTION_CHUNK_CHARS, suggestResumeImprovements } from "./suggestResumeImprovements";

function makeResume(overrides: Partial<Resume> = {}): Resume {
  return {
    id: "resume-1",
    filePath: "resumes/resume-1.pdf",
    parsedText: "Experienced engineer skilled in React and Node.js",
    skills: ["React", "Node.js"],
    uploadedAt: "2026-01-01T00:00:00Z",
    isActive: true,
    version: 1,
    contentHash: "hash-1",
    ...overrides,
  };
}

function makeItem(id: string): ResumeSuggestionItem {
  return { id, category: "Impact", title: `title-${id}`, detail: `detail-${id}` };
}

function makeSet(overrides: Partial<ResumeSuggestionSet> = {}): ResumeSuggestionSet {
  return {
    id: "set-1",
    resumeId: "resume-1",
    targetRole: "Software Engineer",
    suggestions: [makeItem("s1")],
    model: "gemini-2.5-flash",
    createdAt: "2026-01-01T00:00:00Z",
    appliedAsResumeId: null,
    ...overrides,
  };
}

function makeRepository(overrides: Partial<ResumeSuggestionRepository> = {}): ResumeSuggestionRepository {
  return {
    create: vi.fn().mockResolvedValue(makeSet()),
    getById: vi.fn().mockResolvedValue(null),
    markApplied: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("suggestResumeImprovements", () => {
  it("calls the provider once (single chunk) and persists the merged set", async () => {
    const suggest = vi.fn().mockResolvedValue({ items: [makeItem("s1"), makeItem("s2")], model: "gemini-2.5-flash" });
    const provider: ResumeSuggestionProvider = { suggest, rewrite: vi.fn() };
    const repository = makeRepository();

    const result = await suggestResumeImprovements(makeResume(), "Software Engineer", { provider, repository });

    expect(suggest).toHaveBeenCalledTimes(1);
    expect(suggest).toHaveBeenCalledWith({
      resumeText: "Experienced engineer skilled in React and Node.js",
      targetRole: "Software Engineer",
    });
    expect(repository.create).toHaveBeenCalledWith({
      resumeId: "resume-1",
      targetRole: "Software Engineer",
      suggestions: [makeItem("s1"), makeItem("s2")],
      model: "gemini-2.5-flash",
    });
    expect(result).toEqual(makeSet());
  });

  it("chunks a long resume and merges suggestions from every chunk, renumbering ids", async () => {
    const longText = "a".repeat(DEFAULT_SUGGESTION_CHUNK_CHARS + 500);
    const resume = makeResume({ parsedText: longText });

    const suggest = vi
      .fn()
      .mockResolvedValueOnce({ items: [{ id: "s1", category: "Impact", title: "A", detail: "a" }], model: "m" })
      .mockResolvedValueOnce({ items: [{ id: "s1", category: "Skills", title: "B", detail: "b" }], model: "m" });
    const provider: ResumeSuggestionProvider = { suggest, rewrite: vi.fn() };
    const repository = makeRepository();

    await suggestResumeImprovements(resume, "", { provider, repository });

    expect(suggest).toHaveBeenCalledTimes(2);
    const persisted = vi.mocked(repository.create).mock.calls[0]![0];
    expect(persisted.suggestions).toEqual([
      { id: "s1", category: "Impact", title: "A", detail: "a" },
      { id: "s2", category: "Skills", title: "B", detail: "b" },
    ]);
  });

  it("propagates a provider failure instead of persisting a partial set", async () => {
    const suggest = vi.fn().mockRejectedValue(new Error("llm down"));
    const provider: ResumeSuggestionProvider = { suggest, rewrite: vi.fn() };
    const repository = makeRepository();

    await expect(suggestResumeImprovements(makeResume(), "", { provider, repository })).rejects.toThrow("llm down");
    expect(repository.create).not.toHaveBeenCalled();
  });
});
