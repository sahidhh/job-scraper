import type { JobRepository } from "@/features/jobs/domain/JobRepository";
import type { JobStatus, UpdateStatusInput } from "@/features/jobs/domain/types";
import { DomainValidationError } from "@/shared/domain/errors";
import { assertNonEmpty } from "@/shared/domain/validation";

export interface UpdateStatusDeps {
  jobRepository: JobRepository;
}

/**
 * Update an existing job status's label and/or color (P3, settings CRUD).
 * Validates id is non-empty and that label, if provided, is non-empty.
 */
export async function updateStatus(
  id: string,
  input: UpdateStatusInput,
  deps: UpdateStatusDeps,
): Promise<JobStatus> {
  assertNonEmpty(id, "updateStatus.id");
  if (input.label !== undefined && input.label.trim().length === 0) {
    throw new DomainValidationError("Status label must not be empty");
  }
  return deps.jobRepository.updateStatus(id, input);
}
