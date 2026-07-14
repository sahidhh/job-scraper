import { describe, expect, it, vi } from "vitest";
import type { JobRepository } from "@/features/jobs/domain/JobRepository";
import type { NormalizedJob } from "@/features/jobs/domain/types";
import { DomainValidationError } from "@/shared/domain/errors";
import { ingestJobs } from "./ingestJobs";

function makeJob(overrides: Partial<NormalizedJob> = {}): NormalizedJob {
  return {
    source: "greenhouse",
    sourceJobId: "123",
    companyId: null,
    companyName: "Acme",
    title: "Software Engineer",
    locationRaw: "Remote",
    locationTags: ["remote"],
    description: "Build things.",
    url: "https://example.com/jobs/123",
    postedAt: null,
    ...overrides,
  };
}

function makeRepository(): JobRepository {
  return {
    getById: vi.fn(),
    upsertMany: vi.fn().mockResolvedValue({ inserted: 0, updated: 0, duplicates: 0 }),
    findUnscored: vi.fn(),
    findForDashboard: vi.fn(),
    countMatchingExpandedRoles: vi.fn(),
    countJobStats: vi.fn(),
    markExpiredJobs: vi.fn(),
    listStatuses: vi.fn(),
    setJobStatus: vi.fn(),
    createStatus: vi.fn(),
    updateStatus: vi.fn(),
    deleteStatus: vi.fn(),
  };
}

describe("ingestJobs", () => {
  it("dedupes and forwards jobs to jobRepository.upsertMany", async () => {
    const jobRepository = makeRepository();
    const jobs = [
      makeJob({ sourceJobId: "1", title: "Old" }),
      makeJob({ sourceJobId: "1", title: "New" }),
      makeJob({ sourceJobId: "2" }),
    ];

    await ingestJobs(jobs, { jobRepository });

    expect(jobRepository.upsertMany).toHaveBeenCalledTimes(1);
    const passed = vi.mocked(jobRepository.upsertMany).mock.calls[0]?.[0];
    expect(passed).toHaveLength(2);
    expect(passed?.find((j) => j.sourceJobId === "1")?.title).toBe("New");
  });

  it("returns the repository's upsert result", async () => {
    const jobRepository = makeRepository();
    vi.mocked(jobRepository.upsertMany).mockResolvedValue({ inserted: 2, updated: 0, duplicates: 1 });

    const result = await ingestJobs([makeJob()], { jobRepository });

    expect(result).toEqual({ inserted: 2, updated: 0, duplicates: 1 });
  });

  it("short-circuits without calling the repository when there are no jobs", async () => {
    const jobRepository = makeRepository();

    const result = await ingestJobs([], { jobRepository });

    expect(result).toEqual({ inserted: 0, updated: 0, duplicates: 0 });
    expect(jobRepository.upsertMany).not.toHaveBeenCalled();
  });

  it("throws DomainValidationError for a job with no location tags", async () => {
    const jobRepository = makeRepository();
    const invalid = makeJob({ locationTags: [] });

    await expect(ingestJobs([invalid], { jobRepository })).rejects.toThrow(DomainValidationError);
    expect(jobRepository.upsertMany).not.toHaveBeenCalled();
  });

  it("throws DomainValidationError for a job with an empty title", async () => {
    const jobRepository = makeRepository();
    const invalid = makeJob({ title: "  " });

    await expect(ingestJobs([invalid], { jobRepository })).rejects.toThrow(DomainValidationError);
  });

  it("derives contactEmail/category/confidence from title+description (Phase 2 Task 9)", async () => {
    const jobRepository = makeRepository();
    const job = makeJob({ description: "Please apply and send your resume to recruiting@acme.com" });

    await ingestJobs([job], { jobRepository });

    const passed = vi.mocked(jobRepository.upsertMany).mock.calls[0]?.[0];
    expect(passed?.[0]).toMatchObject({
      contactEmail: "recruiting@acme.com",
      contactEmailCategory: "recruiter",
      contactEmailConfidence: "high",
    });
  });

  it("leaves contact fields null when no email is present", async () => {
    const jobRepository = makeRepository();

    await ingestJobs([makeJob()], { jobRepository });

    const passed = vi.mocked(jobRepository.upsertMany).mock.calls[0]?.[0];
    expect(passed?.[0]).toMatchObject({
      contactEmail: null,
      contactEmailCategory: null,
      contactEmailConfidence: null,
    });
  });

  it("derives salary fields from title+description (Phase 2 Task 10)", async () => {
    const jobRepository = makeRepository();
    const job = makeJob({ description: "Compensation: $120k/year" });

    await ingestJobs([job], { jobRepository });

    const passed = vi.mocked(jobRepository.upsertMany).mock.calls[0]?.[0];
    expect(passed?.[0]).toMatchObject({
      salaryCurrency: "USD",
      salaryMin: 120_000,
      salaryMax: 120_000,
      salaryPeriod: "yearly",
      salaryConfidence: "high",
    });
  });

  it("leaves salary fields null when no salary text is present", async () => {
    const jobRepository = makeRepository();

    await ingestJobs([makeJob()], { jobRepository });

    const passed = vi.mocked(jobRepository.upsertMany).mock.calls[0]?.[0];
    expect(passed?.[0]).toMatchObject({
      salaryCurrency: null,
      salaryMin: null,
      salaryMax: null,
      salaryPeriod: null,
      salaryConfidence: null,
    });
  });
});
