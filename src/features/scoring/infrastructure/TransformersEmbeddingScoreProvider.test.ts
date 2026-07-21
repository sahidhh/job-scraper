import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "@/features/jobs/domain/types";
import type { Resume } from "@/features/resume/domain/types";

const pipelineMock = vi.fn();

vi.mock("@huggingface/transformers", () => ({
  pipeline: (...args: unknown[]) => pipelineMock(...args),
}));

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

describe("TransformersEmbeddingScoreProvider", () => {
  beforeEach(() => {
    vi.resetModules();
    pipelineMock.mockReset();
  });

  it("returns null without calling the pipeline when the resume has no text", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { TransformersEmbeddingScoreProvider } = await import("./TransformersEmbeddingScoreProvider");
    const provider = new TransformersEmbeddingScoreProvider();

    const result = await provider.score({ job: makeJob(), resume: makeResume({ parsedText: "   " }) });

    expect(result).toBeNull();
    expect(pipelineMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("empty resume or job text"));
    warn.mockRestore();
  });

  it("returns null without calling the pipeline when the job has no title/description", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { TransformersEmbeddingScoreProvider } = await import("./TransformersEmbeddingScoreProvider");
    const provider = new TransformersEmbeddingScoreProvider();

    const result = await provider.score({ job: makeJob({ title: "", description: "" }), resume: makeResume() });

    expect(result).toBeNull();
    expect(pipelineMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("empty resume or job text"));
    warn.mockRestore();
  });

  it("computes a continuous-mapped cosine similarity from the extractor's output", async () => {
    const extractor = vi
      .fn()
      .mockResolvedValueOnce({ data: Float32Array.from([1, 0]) })
      .mockResolvedValueOnce({ data: Float32Array.from([1, 0]) });
    pipelineMock.mockResolvedValue(extractor);
    const { TransformersEmbeddingScoreProvider } = await import("./TransformersEmbeddingScoreProvider");
    const provider = new TransformersEmbeddingScoreProvider();

    const result = await provider.score({ job: makeJob(), resume: makeResume() });

    // identical vectors -> cosine similarity 1 -> continuous mapping (1+1)/2 = 1
    expect(result).toBeCloseTo(1);
    expect(pipelineMock).toHaveBeenCalledWith("feature-extraction", "onnx-community/all-MiniLM-L6-v2-ONNX");
  });

  it("loads the pipeline only once across multiple calls", async () => {
    const extractor = vi.fn().mockResolvedValue({ data: Float32Array.from([1, 0]) });
    pipelineMock.mockResolvedValue(extractor);
    const { TransformersEmbeddingScoreProvider } = await import("./TransformersEmbeddingScoreProvider");
    const provider = new TransformersEmbeddingScoreProvider();

    await provider.score({ job: makeJob(), resume: makeResume() });
    await provider.score({ job: makeJob({ id: "job-2" }), resume: makeResume() });

    expect(pipelineMock).toHaveBeenCalledTimes(1);
  });

  it("returns null and logs a warning when the extractor throws (jobhunt bug #7: logged, not silent)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    pipelineMock.mockRejectedValue(new Error("model failed to load"));
    const { TransformersEmbeddingScoreProvider } = await import("./TransformersEmbeddingScoreProvider");
    const provider = new TransformersEmbeddingScoreProvider();

    const result = await provider.score({ job: makeJob(), resume: makeResume() });

    expect(result).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("embedding failed"));
    warn.mockRestore();
  });
});
