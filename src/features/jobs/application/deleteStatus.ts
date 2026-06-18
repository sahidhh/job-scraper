import type { JobRepository } from "@/features/jobs/domain/JobRepository";
import { assertNonEmpty } from "@/shared/domain/validation";

export interface DeleteStatusDeps {
  jobRepository: JobRepository;
}

/**
 * Delete a job status by id (P3, settings CRUD). Validates id is non-empty
 * then delegates to the repository (which nullifies job_state rows first).
 */
export async function deleteStatus(
  id: string,
  deps: DeleteStatusDeps,
): Promise<void> {
  assertNonEmpty(id, "deleteStatus.id");
  await deps.jobRepository.deleteStatus(id);
}
