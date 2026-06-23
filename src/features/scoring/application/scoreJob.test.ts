import { describe, expect, it, vi } from "vitest";
import type { Job } from "@/features/jobs/domain/types";
import type { Resume } from "@/features/resume/domain/types";
import type { AiScoreProvider } from "@/features/scoring/domain/AiScoreProvider";
import type { ScoreRepository } from "@/features/scoring/domain/ScoreRepository";
import type { SkillDictionaryEntry } from "@/shared/domain/skills";
import { scoreJob } from "./scoreJob";

const dictionary: SkillDictionaryEntry[] = [
  { canonical: "React", aliases: ["react", "react.js", "reactjs"] },
  { canonical: "Node.js", aliases: ["node", "node.js", "nodejs"] },
  { canonical: "Python", aliases: ["python"] },
];

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    source: "greenhouse",
    sourceJobId: "123",
    companyId: null,
    companyName: "Acme",
    title: "Senior React Developer",
    locationRaw: "Remote",
    locationTags: ["remote"],
    description: "Build UI with React and Node.js",
    url: "https://example.com/jobs/123",
    postedAt: null,
    firstSeenAt: "2026-01-01T00:00:00Z",
    lastSeenAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    isActive: true,
    inactiveReason: null,
    minYears: null,
    ...overrides,
  };
}

function makeResume(overrides: Partial<Resume> = {}): Resume {
  return {
    id: "resume-1",
    filePath: "resumes/resume-1.pdf",
    parsedText: "Experienced engineer skilled in React and Node.js",
    skills: ["React", "Node.js"],
    uploadedAt: "2026-01-01T00:00:00Z",
    isActive: true,
    version: 1,
    ...overrides,
  };
}

function makeScoreRepository(): ScoreRepository {
  return {
    insertScore: vi.fn().mockResolvedValue(undefined),
    hasScore: vi.fn().mockResolvedValue(false) as ScoreRepository["hasScore"],
  };
}

function makeAiProvider(
  result: { score: number; reasoning: string; model: string; tokensInput: number | null; tokensOutput: number | null } | null,
): AiScoreProvider {
  return {
    score: vi.fn().mockResolvedValue(result),
  };
}

describe("scoreJob", () => {
  it("computes keyword score and skips AI when below threshold", async () => {
    const job = makeJob({
      title: "Python Developer",
      description: "Work with Python and Django",
    });
    const resume = makeResume({ skills: ["React", "Node.js"] });
    const scoreRepository = makeScoreRepository();
    const aiScoreProvider = makeAiProvider({ score: 0.9, reasoning: "should not be called", model: "x", tokensInput: null, tokensOutput: null });

    const result = await scoreJob(job, resume, "role-selection-1", {
      scoreRepository,
      aiScoreProvider,
      skillsDictionary: dictionary,
      keywordThreshold: 0.5,
    });

    expect(result.keywordScore).toBe(0); // job mentions Python only, resume has none of it
    expect(result.aiScore).toBeNull();
    expect(result.aiReasoning).toBeNull();
    expect(aiScoreProvider.score).not.toHaveBeenCalled();
    expect(scoreRepository.insertScore).toHaveBeenCalledWith(result);
  });

  it("calls the AI provider and stores its result (including model) when keyword score clears the threshold", async () => {
    const job = makeJob(); // title+description mention React and Node.js, both in resume
    const resume = makeResume({ skills: ["React", "Node.js"] });
    const scoreRepository = makeScoreRepository();
    const aiScoreProvider = makeAiProvider({ score: 0.85, reasoning: "Strong match on stack", model: "openai/gpt-4o-mini", tokensInput: null, tokensOutput: null });

    const result = await scoreJob(job, resume, "role-selection-1", {
      scoreRepository,
      aiScoreProvider,
      skillsDictionary: dictionary,
      keywordThreshold: 0.5,
    });

    expect(result.keywordScore).toBe(1);
    expect(aiScoreProvider.score).toHaveBeenCalledWith({ job, resume });
    expect(result.aiScore).toBe(0.85);
    expect(result.aiReasoning).toBe("Strong match on stack");
    expect(result.model).toBe("openai/gpt-4o-mini");
  });

  it("leaves aiScore/aiReasoning null when the AI provider returns null (failed call)", async () => {
    const job = makeJob();
    const resume = makeResume({ skills: ["React", "Node.js"] });
    const scoreRepository = makeScoreRepository();
    const aiScoreProvider = makeAiProvider(null);

    const result = await scoreJob(job, resume, "role-selection-1", {
      scoreRepository,
      aiScoreProvider,
      skillsDictionary: dictionary,
      keywordThreshold: 0.5,
    });

    expect(result.keywordScore).toBe(1);
    expect(result.aiScore).toBeNull();
    expect(result.aiReasoning).toBeNull();
    expect(scoreRepository.insertScore).toHaveBeenCalledWith(result);
  });

  it("scores 0 and skips AI when the job mentions no dictionary skills at all", async () => {
    const job = makeJob({ title: "Generic Role", description: "No tech mentioned here" });
    const resume = makeResume({ skills: ["React", "Node.js"] });
    const scoreRepository = makeScoreRepository();
    const aiScoreProvider = makeAiProvider({ score: 0.5, reasoning: "n/a", model: "x", tokensInput: null, tokensOutput: null });

    const result = await scoreJob(job, resume, "role-selection-1", {
      scoreRepository,
      aiScoreProvider,
      skillsDictionary: dictionary,
      keywordThreshold: 0.5,
    });

    expect(result.keywordScore).toBe(0);
    expect(aiScoreProvider.score).not.toHaveBeenCalled();
  });
});
