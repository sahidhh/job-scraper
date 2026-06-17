import type { JobRepository } from "@/features/jobs/domain/JobRepository";
import { validateSetJobStatus } from "@/features/jobs/domain/validation";

export interface SetJobStatusDeps {
  jobRepository: JobRepository;
}

/**
 * Assign one status to one or many jobs (P0, docs/plans/feature-roadmap.md
 * Phase 1). Validates the input, then delegates to the repository -- thin
 * orchestration, no business logic. Shared by the per-row dropdown (one id)
 * and the bulk-select action bar (many ids).
 */
export async function setJobStatus(
  jobIds: string[],
  statusId: string,
  deps: SetJobStatusDeps,
): Promise<void> {
  validateSetJobStatus(jobIds, statusId);
  await deps.jobRepository.setJobStatus(jobIds, statusId);
}
