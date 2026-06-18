import { describe, expect, it, vi } from "vitest";
import type { JobRepository } from "@/features/jobs/domain/JobRepository";
import { DomainValidationError } from "@/shared/domain/errors";
import { setJobStatus } from "./setJobStatus";

function makeRepository(): JobRepository {
  return {
    upsertMany: vi.fn(),
    findUnscored: vi.fn(),
    findForDashboard: vi.fn(),
    countMatchingExpandedRoles: vi.fn(),
    listStatuses: vi.fn(),
    setJobStatus: vi.fn().mockResolvedValue(undefined),
    createStatus: vi.fn(),
    updateStatus: vi.fn(),
    deleteStatus: vi.fn(),
  };
}

describe("setJobStatus", () => {
  it("delegates validated ids and status to the repository", async () => {
    const jobRepository = makeRepository();

    await setJobStatus(["job-1", "job-2"], "status-1", { jobRepository });

    expect(jobRepository.setJobStatus).toHaveBeenCalledTimes(1);
    expect(jobRepository.setJobStatus).toHaveBeenCalledWith(["job-1", "job-2"], "status-1");
  });

  it("throws DomainValidationError when no job ids are given", async () => {
    const jobRepository = makeRepository();

    await expect(setJobStatus([], "status-1", { jobRepository })).rejects.toThrow(DomainValidationError);
    expect(jobRepository.setJobStatus).not.toHaveBeenCalled();
  });

  it("throws DomainValidationError for a blank job id", async () => {
    const jobRepository = makeRepository();

    await expect(setJobStatus(["  "], "status-1", { jobRepository })).rejects.toThrow(DomainValidationError);
    expect(jobRepository.setJobStatus).not.toHaveBeenCalled();
  });

  it("throws DomainValidationError for a blank status id", async () => {
    const jobRepository = makeRepository();

    await expect(setJobStatus(["job-1"], "", { jobRepository })).rejects.toThrow(DomainValidationError);
    expect(jobRepository.setJobStatus).not.toHaveBeenCalled();
  });
});
