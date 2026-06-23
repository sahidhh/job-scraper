import type { JobRepository } from "@/features/jobs/domain/JobRepository";
import type { CreateStatusInput, JobStatus, UpdateStatusInput } from "@/features/jobs/domain/types";
import { DomainValidationError } from "@/shared/domain/errors";
import { assertNonEmpty } from "@/shared/domain/validation";

type StatusDeps = { jobRepository: JobRepository };

export async function createStatus(input: CreateStatusInput, deps: StatusDeps): Promise<JobStatus> {
  if (input.label.trim().length === 0) {
    throw new DomainValidationError("Status label must not be empty");
  }
  return deps.jobRepository.createStatus(input);
}

export async function updateStatus(id: string, input: UpdateStatusInput, deps: StatusDeps): Promise<JobStatus> {
  assertNonEmpty(id, "updateStatus.id");
  if (input.label !== undefined && input.label.trim().length === 0) {
    throw new DomainValidationError("Status label must not be empty");
  }
  return deps.jobRepository.updateStatus(id, input);
}

export async function deleteStatus(id: string, deps: StatusDeps): Promise<void> {
  assertNonEmpty(id, "deleteStatus.id");
  await deps.jobRepository.deleteStatus(id);
}
