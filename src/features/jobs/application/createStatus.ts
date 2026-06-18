import type { JobRepository } from "@/features/jobs/domain/JobRepository";
import type { CreateStatusInput, JobStatus } from "@/features/jobs/domain/types";
import { DomainValidationError } from "@/shared/domain/errors";

export interface CreateStatusDeps {
  jobRepository: JobRepository;
}

/**
 * Create a new job status (P3, settings CRUD). Validates label is non-empty
 * then delegates to the repository.
 */
export async function createStatus(
  input: CreateStatusInput,
  deps: CreateStatusDeps,
): Promise<JobStatus> {
  if (input.label.trim().length === 0) {
    throw new DomainValidationError("Status label must not be empty");
  }
  return deps.jobRepository.createStatus(input);
}
