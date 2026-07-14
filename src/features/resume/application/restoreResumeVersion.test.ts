import { describe, expect, it, vi } from "vitest";
import type { ResumeRepository } from "@/features/resume/domain/ResumeRepository";
import type { Resume } from "@/features/resume/domain/types";
import { DomainValidationError } from "@/shared/domain/errors";
import { restoreResumeVersion } from "./restoreResumeVersion";

function makeResume(overrides: Partial<Resume> = {}): Resume {
  return {
    id: "resume-1",
    filePath: "resumes/r1.pdf",
    parsedText: "Experienced with React and Node.js development",
    skills: ["React", "Node.js"],
    uploadedAt: "2026-01-01T00:00:00Z",
    isActive: true,
    version: 1,
    contentHash: "hash-1",
    ...overrides,
  };
}

function makeResumeRepository(versions: Resume[]): ResumeRepository {
  return {
    getActive: vi.fn(),
    findByContentHash: vi.fn(),
    listVersions: vi.fn().mockResolvedValue(versions),
    create: vi.fn().mockImplementation(
      (input): Promise<Resume> =>
        Promise.resolve({
          id: "resume-3",
          filePath: input.filePath,
          parsedText: input.parsedText,
          skills: input.skills,
          uploadedAt: "2026-01-03T00:00:00Z",
          isActive: true,
          version: 3,
          contentHash: input.contentHash,
        }),
    ),
    updateSkills: vi.fn(),
  };
}

describe("restoreResumeVersion", () => {
  it("creates a new active version seeded with the target version's exact content", async () => {
    const target = makeResume({
      id: "resume-1",
      version: 1,
      isActive: false,
      parsedText: "Old resume text",
      skills: ["React"],
      filePath: "resumes/old.pdf",
      contentHash: "hash-old",
    });
    const active = makeResume({ id: "resume-2", version: 2, isActive: true });
    const resumeRepository = makeResumeRepository([active, target]);

    const result = await restoreResumeVersion("resume-1", { resumeRepository });

    expect(resumeRepository.create).toHaveBeenCalledWith({
      filePath: "resumes/old.pdf",
      parsedText: "Old resume text",
      skills: ["React"],
      contentHash: "hash-old",
    });
    expect(result.id).toBe("resume-3");
    expect(result.isActive).toBe(true);
  });

  it("preserves a null content_hash (e.g. restoring an AI-applied version)", async () => {
    const target = makeResume({ id: "resume-1", isActive: false, contentHash: null });
    const active = makeResume({ id: "resume-2", isActive: true });
    const resumeRepository = makeResumeRepository([active, target]);

    await restoreResumeVersion("resume-1", { resumeRepository });

    expect(resumeRepository.create).toHaveBeenCalledWith(expect.objectContaining({ contentHash: null }));
  });

  it("throws DomainValidationError when the version does not exist", async () => {
    const resumeRepository = makeResumeRepository([makeResume({ id: "resume-2", isActive: true })]);

    await expect(restoreResumeVersion("missing", { resumeRepository })).rejects.toThrow(DomainValidationError);
    expect(resumeRepository.create).not.toHaveBeenCalled();
  });

  it("throws DomainValidationError when the target version is already active", async () => {
    const resumeRepository = makeResumeRepository([makeResume({ id: "resume-1", isActive: true })]);

    await expect(restoreResumeVersion("resume-1", { resumeRepository })).rejects.toThrow(
      "already the active resume version",
    );
    expect(resumeRepository.create).not.toHaveBeenCalled();
  });
});
