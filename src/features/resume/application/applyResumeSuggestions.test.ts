import { describe, expect, it, vi } from "vitest";
import type { NewResume, Resume, ResumeSuggestionItem, ResumeSuggestionSet } from "@/features/resume/domain/types";
import type { ResumeRepository } from "@/features/resume/domain/ResumeRepository";
import type { ResumeSuggestionProvider } from "@/features/resume/domain/ResumeSuggestionProvider";
import type { ResumeSuggestionRepository } from "@/features/resume/domain/ResumeSuggestionRepository";
import type { SkillDictionaryEntry } from "@/shared/domain/skills";
import { applyResumeSuggestions, type ApplyResumeSuggestionsDeps } from "./applyResumeSuggestions";
import { DEFAULT_SUGGESTION_CHUNK_CHARS } from "./suggestResumeImprovements";

const dictionary: SkillDictionaryEntry[] = [{ canonical: "React", aliases: ["react"] }];

function makeResume(overrides: Partial<Resume> = {}): Resume {
  return {
    id: "resume-1",
    filePath: "resumes/resume-1.pdf",
    parsedText: "Experienced engineer skilled in React",
    skills: ["React"],
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

function makeSuggestionSet(overrides: Partial<ResumeSuggestionSet> = {}): ResumeSuggestionSet {
  return {
    id: "set-1",
    resumeId: "resume-1",
    targetRole: "Software Engineer",
    suggestions: [makeItem("s1"), makeItem("s2")],
    model: "gemini-2.5-flash",
    createdAt: "2026-01-01T00:00:00Z",
    appliedAsResumeId: null,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<ApplyResumeSuggestionsDeps> = {}): ApplyResumeSuggestionsDeps {
  const rewrite = vi.fn().mockResolvedValue("Rewritten resume text mentioning React");
  const provider: ResumeSuggestionProvider = { suggest: vi.fn(), rewrite };

  const suggestionRepository: ResumeSuggestionRepository = {
    create: vi.fn(),
    getById: vi.fn().mockResolvedValue(makeSuggestionSet()),
    markApplied: vi.fn().mockResolvedValue(undefined),
  };

  const resumeRepository: ResumeRepository = {
    getActive: vi.fn(),
    listVersions: vi.fn(),
    findByContentHash: vi.fn(),
    create: vi.fn().mockImplementation((input: NewResume) =>
      Promise.resolve(makeResume({ id: "resume-2", version: 2, parsedText: input.parsedText, contentHash: input.contentHash })),
    ),
    updateSkills: vi.fn(),
  };

  return {
    provider,
    suggestionRepository,
    resumeRepository,
    skillsDictionary: dictionary,
    ...overrides,
  };
}

describe("applyResumeSuggestions", () => {
  it("rewrites the resume, creates a new version, and never overwrites the original", async () => {
    const deps = makeDeps();
    const resume = makeResume();

    const result = await applyResumeSuggestions(resume, "set-1", ["s1"], deps);

    expect(result.id).toBe("resume-2");
    expect(result.version).toBe(2);
    expect(result.contentHash).toBeNull();
    expect(vi.mocked(deps.resumeRepository.create)).toHaveBeenCalledWith({
      filePath: "resumes/resume-1.pdf",
      parsedText: "Rewritten resume text mentioning React",
      skills: ["React"],
      contentHash: null,
    });
  });

  it("passes only the chosen suggestions to the provider", async () => {
    const deps = makeDeps();

    await applyResumeSuggestions(makeResume(), "set-1", ["s2"], deps);

    expect(deps.provider.rewrite).toHaveBeenCalledWith({
      resumeText: "Experienced engineer skilled in React",
      chosen: [makeItem("s2")],
    });
  });

  it("marks the suggestion set applied with the new resume's id", async () => {
    const deps = makeDeps();

    const result = await applyResumeSuggestions(makeResume(), "set-1", ["s1"], deps);

    expect(deps.suggestionRepository.markApplied).toHaveBeenCalledWith("set-1", result.id);
  });

  it("throws when the suggestion set does not exist", async () => {
    const deps = makeDeps({
      suggestionRepository: {
        create: vi.fn(),
        getById: vi.fn().mockResolvedValue(null),
        markApplied: vi.fn(),
      },
    });

    await expect(applyResumeSuggestions(makeResume(), "missing", ["s1"], deps)).rejects.toThrow("Suggestion set not found");
    expect(deps.resumeRepository.create).not.toHaveBeenCalled();
  });

  it("throws when the suggestion set was generated against a different resume version", async () => {
    const deps = makeDeps({
      suggestionRepository: {
        create: vi.fn(),
        getById: vi.fn().mockResolvedValue(makeSuggestionSet({ resumeId: "resume-OLD" })),
        markApplied: vi.fn(),
      },
    });

    await expect(applyResumeSuggestions(makeResume(), "set-1", ["s1"], deps)).rejects.toThrow(
      "different resume version",
    );
    expect(deps.resumeRepository.create).not.toHaveBeenCalled();
  });

  it("throws when no suggestion ids are chosen", async () => {
    const deps = makeDeps();

    await expect(applyResumeSuggestions(makeResume(), "set-1", [], deps)).rejects.toThrow(
      "Select at least one suggestion",
    );
    expect(deps.resumeRepository.create).not.toHaveBeenCalled();
  });

  it("chunks a long resume and rewrites every chunk, concatenating in order", async () => {
    const longText = "a".repeat(DEFAULT_SUGGESTION_CHUNK_CHARS + 500);
    const resume = makeResume({ parsedText: longText });
    const rewrite = vi.fn().mockResolvedValueOnce("first rewritten").mockResolvedValueOnce("second rewritten");
    const deps = makeDeps({ provider: { suggest: vi.fn(), rewrite } });

    await applyResumeSuggestions(resume, "set-1", ["s1"], deps);

    expect(rewrite).toHaveBeenCalledTimes(2);
    expect(vi.mocked(deps.resumeRepository.create)).toHaveBeenCalledWith(
      expect.objectContaining({ parsedText: "first rewritten\n\nsecond rewritten" }),
    );
  });

  it("propagates a provider failure and never creates a resume version", async () => {
    const rewrite = vi.fn().mockRejectedValue(new Error("llm down"));
    const deps = makeDeps({ provider: { suggest: vi.fn(), rewrite } });

    await expect(applyResumeSuggestions(makeResume(), "set-1", ["s1"], deps)).rejects.toThrow("llm down");
    expect(deps.resumeRepository.create).not.toHaveBeenCalled();
  });
});
