import { describe, expect, it, vi } from "vitest";
import type { Job } from "@/features/jobs/domain/types";
import type { Resume } from "@/features/resume/domain/types";
import type { AiScoreProvider } from "@/features/scoring/domain/AiScoreProvider";
import type { EmbeddingScoreProvider } from "@/features/scoring/domain/EmbeddingScoreProvider";
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
    canonicalCompanyName: "Acme",
    fingerprint: "test-fingerprint",
    contactEmail: null,
    contactEmailCategory: null,
    contactEmailConfidence: null,
    salaryCurrency: null,
    salaryMin: null,
    salaryMax: null,
    salaryPeriod: null,
    salaryConfidence: null,
    employmentType: null,
    seniority: null,
    workArrangement: null,
    visaSponsorship: null,
    relocationAssistance: null,
    securityClearance: false,
    urgentHiring: false,
    ineligibleReason: null,
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
    contentHash: "hash-1",
    ...overrides,
  };
}

function makeScoreRepository(): ScoreRepository {
  return {
    insertScore: vi.fn().mockResolvedValue(undefined),
    hasScore: vi.fn().mockResolvedValue(false) as ScoreRepository["hasScore"],
    findAwaitingAi: vi.fn().mockResolvedValue([]),
  };
}

function makeAiProvider(
  result: { score: number; reasoning: string; model: string; tokensInput: number | null; tokensOutput: number | null } | null,
): AiScoreProvider {
  return {
    score: vi.fn().mockResolvedValue(result),
  };
}

function makeEmbeddingProvider(result: number | null): EmbeddingScoreProvider {
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

  it("calls the embedding provider and stores its result when keyword score clears the threshold", async () => {
    const job = makeJob();
    const resume = makeResume({ skills: ["React", "Node.js"] });
    const scoreRepository = makeScoreRepository();
    const aiScoreProvider = makeAiProvider({ score: 0.85, reasoning: "Strong match", model: "x", tokensInput: null, tokensOutput: null });
    const embeddingScoreProvider = makeEmbeddingProvider(0.72);

    const result = await scoreJob(job, resume, "role-selection-1", {
      scoreRepository,
      aiScoreProvider,
      embeddingScoreProvider,
      skillsDictionary: dictionary,
      keywordThreshold: 0.5,
    });

    expect(embeddingScoreProvider.score).toHaveBeenCalledWith({ job, resume });
    expect(result.embeddingScore).toBe(0.72);
  });

  it("leaves embeddingScore null when the embedding provider returns null (fallback to overlap-only)", async () => {
    const job = makeJob();
    const resume = makeResume({ skills: ["React", "Node.js"] });
    const scoreRepository = makeScoreRepository();
    const aiScoreProvider = makeAiProvider({ score: 0.85, reasoning: "Strong match", model: "x", tokensInput: null, tokensOutput: null });
    const embeddingScoreProvider = makeEmbeddingProvider(null);

    const result = await scoreJob(job, resume, "role-selection-1", {
      scoreRepository,
      aiScoreProvider,
      embeddingScoreProvider,
      skillsDictionary: dictionary,
      keywordThreshold: 0.5,
    });

    expect(result.embeddingScore).toBeNull();
  });

  it("never calls the embedding provider when keyword score is below the threshold", async () => {
    const job = makeJob({ title: "Python Developer", description: "Work with Python and Django" });
    const resume = makeResume({ skills: ["React", "Node.js"] });
    const scoreRepository = makeScoreRepository();
    const aiScoreProvider = makeAiProvider({ score: 0.9, reasoning: "n/a", model: "x", tokensInput: null, tokensOutput: null });
    const embeddingScoreProvider = makeEmbeddingProvider(0.72);

    const result = await scoreJob(job, resume, "role-selection-1", {
      scoreRepository,
      aiScoreProvider,
      embeddingScoreProvider,
      skillsDictionary: dictionary,
      keywordThreshold: 0.5,
    });

    expect(embeddingScoreProvider.score).not.toHaveBeenCalled();
    expect(result.embeddingScore).toBeNull();
  });

  it("hard-excludes a remote job geo-locked to a region the candidate fails, skipping AI even when keyword score clears the threshold", async () => {
    const job = makeJob({
      locationRaw: "Remote (US)",
      locationTags: ["remote"],
      description: "Build UI with React and Node.js. US residents only.",
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

    expect(result.keywordScore).toBe(1);
    expect(result.aiScore).toBeNull();
    expect(aiScoreProvider.score).not.toHaveBeenCalled();
  });

  it("hard-excludes an onsite job with an explicit no-sponsorship signal, skipping AI even when keyword score clears the threshold", async () => {
    const job = makeJob({
      locationRaw: "Austin, TX",
      locationTags: [],
      description: "Build UI with React and Node.js. We are not able to sponsor visas for this role.",
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

    expect(result.keywordScore).toBe(1);
    expect(result.aiScore).toBeNull();
    expect(aiScoreProvider.score).not.toHaveBeenCalled();
  });

  it("honours a stored ineligible_reason without re-deriving it from the posting text", async () => {
    // AD-50: the ingest-time verdict is authoritative. This job's own text
    // reads as perfectly eligible, so if the stored value were ignored the
    // AI call would fire.
    const job = makeJob({
      locationRaw: "Remote",
      locationTags: ["remote"],
      description: "Build UI with React and Node.js.",
      ineligibleReason: "geo_locked",
    });
    const resume = makeResume({ skills: ["React", "Node.js"] });
    const aiScoreProvider = makeAiProvider({ score: 0.9, reasoning: "should not be called", model: "x", tokensInput: null, tokensOutput: null });

    const result = await scoreJob(job, resume, "role-selection-1", {
      scoreRepository: makeScoreRepository(),
      aiScoreProvider,
      skillsDictionary: dictionary,
      keywordThreshold: 0.5,
    });

    expect(result.aiScore).toBeNull();
    expect(aiScoreProvider.score).not.toHaveBeenCalled();
  });

  it("does not exclude an onsite job that is merely silent on sponsorship", async () => {
    const job = makeJob({
      locationRaw: "Singapore",
      locationTags: ["singapore"],
      description: "Build UI with React and Node.js in our Singapore office.",
    });
    const resume = makeResume({ skills: ["React", "Node.js"] });
    const scoreRepository = makeScoreRepository();
    const aiScoreProvider = makeAiProvider({ score: 0.6, reasoning: "worth a look", model: "x", tokensInput: null, tokensOutput: null });

    const result = await scoreJob(job, resume, "role-selection-1", {
      scoreRepository,
      aiScoreProvider,
      skillsDictionary: dictionary,
      keywordThreshold: 0.5,
    });

    expect(aiScoreProvider.score).toHaveBeenCalledWith({ job, resume });
    expect(result.aiScore).toBe(0.6);
  });

  it("leaves embeddingScore null when no embedding provider is supplied", async () => {
    const job = makeJob();
    const resume = makeResume({ skills: ["React", "Node.js"] });
    const scoreRepository = makeScoreRepository();
    const aiScoreProvider = makeAiProvider({ score: 0.85, reasoning: "Strong match", model: "x", tokensInput: null, tokensOutput: null });

    const result = await scoreJob(job, resume, "role-selection-1", {
      scoreRepository,
      aiScoreProvider,
      skillsDictionary: dictionary,
      keywordThreshold: 0.5,
    });

    expect(result.embeddingScore).toBeNull();
  });
});
