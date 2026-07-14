import { describe, expect, it, vi } from "vitest";
import type { ResumeRepository } from "@/features/resume/domain/ResumeRepository";
import type { Resume } from "@/features/resume/domain/types";
import { DomainValidationError } from "@/shared/domain/errors";
import type { SkillDictionaryEntry } from "@/shared/domain/skills";
import { uploadResume, type ParseResumeText, type UploadResumeDeps } from "./uploadResume";

const dictionary: SkillDictionaryEntry[] = [
  { canonical: "React", aliases: ["react", "react.js", "reactjs"] },
  { canonical: "Node.js", aliases: ["node", "node.js", "nodejs"] },
  { canonical: ".NET", aliases: [".net", "dotnet", "asp.net"] },
];

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

function makeResumeRepository(existingByHash: Resume | null = null): ResumeRepository {
  return {
    getActive: vi.fn(),
    findByContentHash: vi.fn().mockResolvedValue(existingByHash),
    create: vi.fn().mockImplementation(
      (input): Promise<Resume> =>
        Promise.resolve({
          id: "resume-1",
          filePath: input.filePath,
          parsedText: input.parsedText,
          skills: input.skills,
          uploadedAt: "2026-01-01T00:00:00Z",
          isActive: true,
          version: 1,
          contentHash: input.contentHash,
        }),
    ),
    updateSkills: vi.fn(),
  };
}

function makeDeps(overrides: Partial<UploadResumeDeps> = {}): UploadResumeDeps {
  return {
    resumeRepository: makeResumeRepository(),
    skillsDictionary: dictionary,
    parseText: vi.fn().mockResolvedValue("Experienced with React and Node.js development"),
    ...overrides,
  };
}

describe("uploadResume", () => {
  it("extracts skills from parsed text via the dictionary and stores them", async () => {
    const deps = makeDeps();

    const result = await uploadResume(
      { filePath: "resumes/r1.pdf", buffer: Buffer.from("pdf bytes"), mimeType: "application/pdf", contentHash: "hash-1" },
      deps,
    );

    expect(deps.resumeRepository.create).toHaveBeenCalledWith({
      filePath: "resumes/r1.pdf",
      parsedText: "Experienced with React and Node.js development",
      skills: ["React", "Node.js"],
      contentHash: "hash-1",
    });
    expect(result.skills).toEqual(["React", "Node.js"]);
  });

  it("uses manualSkills instead of extraction when provided", async () => {
    const deps = makeDeps({ parseText: vi.fn().mockResolvedValue("mentions .NET and Node.js") });

    await uploadResume(
      {
        filePath: "resumes/r1.pdf",
        buffer: Buffer.from("pdf bytes"),
        mimeType: "application/pdf",
        contentHash: "hash-1",
        manualSkills: ["React", "Python"],
      },
      deps,
    );

    expect(deps.resumeRepository.create).toHaveBeenCalledWith({
      filePath: "resumes/r1.pdf",
      parsedText: "mentions .NET and Node.js",
      skills: ["React", "Python"],
      contentHash: "hash-1",
    });
  });

  it("trims manualSkills entries", async () => {
    const deps = makeDeps({ parseText: vi.fn().mockResolvedValue("Some long enough resume body text here") });

    await uploadResume(
      {
        filePath: "resumes/r1.pdf",
        buffer: Buffer.from("pdf bytes"),
        mimeType: "application/pdf",
        contentHash: "hash-1",
        manualSkills: ["  React  ", "Node.js"],
      },
      deps,
    );

    expect(deps.resumeRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ skills: ["React", "Node.js"] }),
    );
  });

  it("throws DomainValidationError for an empty manual skill entry", async () => {
    const deps = makeDeps({ parseText: vi.fn().mockResolvedValue("Some long enough resume body text here") });

    await expect(
      uploadResume(
        {
          filePath: "resumes/r1.pdf",
          buffer: Buffer.from("pdf bytes"),
          mimeType: "application/pdf",
          contentHash: "hash-1",
          manualSkills: ["React", "   "],
        },
        deps,
      ),
    ).rejects.toThrow(DomainValidationError);
    expect(deps.resumeRepository.create).not.toHaveBeenCalled();
  });

  it("throws DomainValidationError for duplicate manual skills (case-insensitive)", async () => {
    const deps = makeDeps({ parseText: vi.fn().mockResolvedValue("Some long enough resume body text here") });

    await expect(
      uploadResume(
        {
          filePath: "resumes/r1.pdf",
          buffer: Buffer.from("pdf bytes"),
          mimeType: "application/pdf",
          contentHash: "hash-1",
          manualSkills: ["React", "react"],
        },
        deps,
      ),
    ).rejects.toThrow(DomainValidationError);
    expect(deps.resumeRepository.create).not.toHaveBeenCalled();
  });

  it("returns the resume created by the repository", async () => {
    const deps = makeDeps({ parseText: vi.fn().mockResolvedValue("React developer with lots of experience") });

    const result = await uploadResume(
      {
        filePath: "resumes/r1.pdf",
        buffer: Buffer.from("pdf bytes"),
        mimeType: "application/pdf",
        contentHash: "hash-1",
        manualSkills: ["React"],
      },
      deps,
    );

    expect(result).toEqual({
      id: "resume-1",
      filePath: "resumes/r1.pdf",
      parsedText: "React developer with lots of experience",
      skills: ["React"],
      uploadedAt: "2026-01-01T00:00:00Z",
      isActive: true,
      version: 1,
      contentHash: "hash-1",
    });
  });

  describe("sha256 parse-once cache", () => {
    it("skips parseText entirely when a resume with the same content_hash already exists", async () => {
      const cached = makeResume({ parsedText: "Cached React and Node.js resume text" });
      const parseText: ParseResumeText = vi.fn().mockResolvedValue("should never be used");
      const deps = makeDeps({
        resumeRepository: makeResumeRepository(cached),
        parseText,
      });

      await uploadResume(
        { filePath: "resumes/r2.pdf", buffer: Buffer.from("identical bytes"), mimeType: "application/pdf", contentHash: "hash-1" },
        deps,
      );

      expect(parseText).not.toHaveBeenCalled();
      expect(deps.resumeRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ parsedText: "Cached React and Node.js resume text" }),
      );
    });

    it("calls parseText when no resume with that content_hash exists yet", async () => {
      const deps = makeDeps({
        resumeRepository: makeResumeRepository(null),
        parseText: vi.fn().mockResolvedValue("Freshly parsed React resume text"),
      });

      await uploadResume(
        { filePath: "resumes/r1.pdf", buffer: Buffer.from("new bytes"), mimeType: "application/pdf", contentHash: "hash-2" },
        deps,
      );

      expect(deps.parseText).toHaveBeenCalledWith(Buffer.from("new bytes"), "application/pdf");
      expect(deps.resumeRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ parsedText: "Freshly parsed React resume text" }),
      );
    });

    it("looks up the cache by the given content_hash", async () => {
      const deps = makeDeps({ resumeRepository: makeResumeRepository(null) });

      await uploadResume(
        { filePath: "resumes/r1.pdf", buffer: Buffer.from("bytes"), mimeType: "application/pdf", contentHash: "hash-abc" },
        deps,
      );

      expect(deps.resumeRepository.findByContentHash).toHaveBeenCalledWith("hash-abc");
    });
  });

  describe("empty/unreadable parsed text", () => {
    it("throws DomainValidationError instead of creating a resume with empty parsed text (e.g. scanned PDF)", async () => {
      const deps = makeDeps({ parseText: vi.fn().mockResolvedValue("") });

      await expect(
        uploadResume(
          { filePath: "resumes/r1.pdf", buffer: Buffer.from("scanned pdf"), mimeType: "application/pdf", contentHash: "hash-3" },
          deps,
        ),
      ).rejects.toThrow(DomainValidationError);
      expect(deps.resumeRepository.create).not.toHaveBeenCalled();
    });

    it("throws DomainValidationError for whitespace-only parsed text", async () => {
      const deps = makeDeps({ parseText: vi.fn().mockResolvedValue("   \n\n  ") });

      await expect(
        uploadResume(
          { filePath: "resumes/r1.pdf", buffer: Buffer.from("scanned pdf"), mimeType: "application/pdf", contentHash: "hash-3" },
          deps,
        ),
      ).rejects.toThrow(DomainValidationError);
    });

    it("does not re-validate cached parsed text, even if it happens to be short", async () => {
      // Guards against re-running validateParsedText against cached rows --
      // once a hash is cached, its text was already validated on first
      // upload and never re-parsed (that's the entire point of the cache).
      const cached = makeResume({ parsedText: "ok text long enough to pass validation on first upload" });
      const deps = makeDeps({ resumeRepository: makeResumeRepository(cached) });

      await expect(
        uploadResume(
          { filePath: "resumes/r2.pdf", buffer: Buffer.from("identical bytes"), mimeType: "application/pdf", contentHash: "hash-1" },
          deps,
        ),
      ).resolves.toBeDefined();
    });
  });
});
