import { describe, expect, it, vi } from "vitest";
import type { ResumeRepository } from "@/features/resume/domain/ResumeRepository";
import type { Resume } from "@/features/resume/domain/types";
import { DomainValidationError } from "@/shared/domain/errors";
import type { SkillDictionaryEntry } from "@/shared/domain/skills";
import { uploadResume } from "./uploadResume";

const dictionary: SkillDictionaryEntry[] = [
  { canonical: "React", aliases: ["react", "react.js", "reactjs"] },
  { canonical: "Node.js", aliases: ["node", "node.js", "nodejs"] },
  { canonical: ".NET", aliases: [".net", "dotnet", "asp.net"] },
];

function makeResumeRepository(): ResumeRepository {
  return {
    getActive: vi.fn(),
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
        }),
    ),
    updateSkills: vi.fn(),
  };
}

describe("uploadResume", () => {
  it("extracts skills from parsedText via the dictionary and stores them", async () => {
    const resumeRepository = makeResumeRepository();

    const result = await uploadResume(
      { filePath: "resumes/r1.pdf", parsedText: "Experienced with React and Node.js development" },
      { resumeRepository, skillsDictionary: dictionary },
    );

    expect(resumeRepository.create).toHaveBeenCalledWith({
      filePath: "resumes/r1.pdf",
      parsedText: "Experienced with React and Node.js development",
      skills: ["React", "Node.js"],
    });
    expect(result.skills).toEqual(["React", "Node.js"]);
  });

  it("uses manualSkills instead of extraction when provided", async () => {
    const resumeRepository = makeResumeRepository();

    await uploadResume(
      {
        filePath: "resumes/r1.pdf",
        parsedText: "mentions .NET and Node.js",
        manualSkills: ["React", "Python"],
      },
      { resumeRepository, skillsDictionary: dictionary },
    );

    expect(resumeRepository.create).toHaveBeenCalledWith({
      filePath: "resumes/r1.pdf",
      parsedText: "mentions .NET and Node.js",
      skills: ["React", "Python"],
    });
  });

  it("trims manualSkills entries", async () => {
    const resumeRepository = makeResumeRepository();

    await uploadResume(
      { filePath: "resumes/r1.pdf", parsedText: "", manualSkills: ["  React  ", "Node.js"] },
      { resumeRepository, skillsDictionary: dictionary },
    );

    expect(resumeRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ skills: ["React", "Node.js"] }),
    );
  });

  it("throws DomainValidationError for an empty manual skill entry", async () => {
    const resumeRepository = makeResumeRepository();

    await expect(
      uploadResume(
        { filePath: "resumes/r1.pdf", parsedText: "", manualSkills: ["React", "   "] },
        { resumeRepository, skillsDictionary: dictionary },
      ),
    ).rejects.toThrow(DomainValidationError);
    expect(resumeRepository.create).not.toHaveBeenCalled();
  });

  it("throws DomainValidationError for duplicate manual skills (case-insensitive)", async () => {
    const resumeRepository = makeResumeRepository();

    await expect(
      uploadResume(
        { filePath: "resumes/r1.pdf", parsedText: "", manualSkills: ["React", "react"] },
        { resumeRepository, skillsDictionary: dictionary },
      ),
    ).rejects.toThrow(DomainValidationError);
    expect(resumeRepository.create).not.toHaveBeenCalled();
  });

  it("returns the resume created by the repository", async () => {
    const resumeRepository = makeResumeRepository();

    const result = await uploadResume(
      { filePath: "resumes/r1.pdf", parsedText: "React developer", manualSkills: ["React"] },
      { resumeRepository, skillsDictionary: dictionary },
    );

    expect(result).toEqual({
      id: "resume-1",
      filePath: "resumes/r1.pdf",
      parsedText: "React developer",
      skills: ["React"],
      uploadedAt: "2026-01-01T00:00:00Z",
      isActive: true,
      version: 1,
    });
  });
});
