import { describe, expect, it, vi } from "vitest";
import type { JobRepository } from "@/features/jobs/domain/JobRepository";
import type { JobStatus } from "@/features/jobs/domain/types";
import { DomainValidationError } from "@/shared/domain/errors";
import { createStatus } from "./createStatus";
import { deleteStatus } from "./deleteStatus";
import { updateStatus } from "./updateStatus";

const mockStatus: JobStatus = {
  id: "status-1",
  label: "Applied",
  color: "#aabbcc",
  sortOrder: 1,
};

function makeRepository(): JobRepository {
  return {
    upsertMany: vi.fn(),
    findUnscored: vi.fn(),
    findForDashboard: vi.fn(),
    countMatchingExpandedRoles: vi.fn(),
    listStatuses: vi.fn(),
    setJobStatus: vi.fn(),
    createStatus: vi.fn().mockResolvedValue(mockStatus),
    updateStatus: vi.fn().mockResolvedValue(mockStatus),
    deleteStatus: vi.fn().mockResolvedValue(undefined),
  };
}

describe("createStatus", () => {
  it("delegates to repository with valid input", async () => {
    const jobRepository = makeRepository();
    const result = await createStatus({ label: "Applied", color: "#aabbcc" }, { jobRepository });

    expect(jobRepository.createStatus).toHaveBeenCalledTimes(1);
    expect(jobRepository.createStatus).toHaveBeenCalledWith({ label: "Applied", color: "#aabbcc" });
    expect(result).toEqual(mockStatus);
  });

  it("throws DomainValidationError for empty label", async () => {
    const jobRepository = makeRepository();

    await expect(createStatus({ label: "  ", color: "#aabbcc" }, { jobRepository })).rejects.toThrow(
      DomainValidationError,
    );
    expect(jobRepository.createStatus).not.toHaveBeenCalled();
  });

  it("throws DomainValidationError for empty string label", async () => {
    const jobRepository = makeRepository();

    await expect(createStatus({ label: "", color: "#aabbcc" }, { jobRepository })).rejects.toThrow(
      DomainValidationError,
    );
    expect(jobRepository.createStatus).not.toHaveBeenCalled();
  });
});

describe("updateStatus", () => {
  it("delegates to repository with valid id and input", async () => {
    const jobRepository = makeRepository();
    const result = await updateStatus("status-1", { label: "Interviewing" }, { jobRepository });

    expect(jobRepository.updateStatus).toHaveBeenCalledTimes(1);
    expect(jobRepository.updateStatus).toHaveBeenCalledWith("status-1", { label: "Interviewing" });
    expect(result).toEqual(mockStatus);
  });

  it("throws DomainValidationError for blank id", async () => {
    const jobRepository = makeRepository();

    await expect(updateStatus("  ", { label: "Interviewing" }, { jobRepository })).rejects.toThrow(
      DomainValidationError,
    );
    expect(jobRepository.updateStatus).not.toHaveBeenCalled();
  });

  it("throws DomainValidationError when label is explicitly set to empty string", async () => {
    const jobRepository = makeRepository();

    await expect(updateStatus("status-1", { label: "" }, { jobRepository })).rejects.toThrow(
      DomainValidationError,
    );
    expect(jobRepository.updateStatus).not.toHaveBeenCalled();
  });

  it("allows updating color only (no label)", async () => {
    const jobRepository = makeRepository();
    await updateStatus("status-1", { color: "#112233" }, { jobRepository });

    expect(jobRepository.updateStatus).toHaveBeenCalledWith("status-1", { color: "#112233" });
  });
});

describe("deleteStatus", () => {
  it("delegates to repository with valid id", async () => {
    const jobRepository = makeRepository();
    await deleteStatus("status-1", { jobRepository });

    expect(jobRepository.deleteStatus).toHaveBeenCalledTimes(1);
    expect(jobRepository.deleteStatus).toHaveBeenCalledWith("status-1");
  });

  it("throws DomainValidationError for blank id", async () => {
    const jobRepository = makeRepository();

    await expect(deleteStatus("  ", { jobRepository })).rejects.toThrow(DomainValidationError);
    expect(jobRepository.deleteStatus).not.toHaveBeenCalled();
  });

  it("throws DomainValidationError for empty id", async () => {
    const jobRepository = makeRepository();

    await expect(deleteStatus("", { jobRepository })).rejects.toThrow(DomainValidationError);
    expect(jobRepository.deleteStatus).not.toHaveBeenCalled();
  });
});
