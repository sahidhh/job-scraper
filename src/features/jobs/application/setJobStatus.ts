import type { JobRepository } from "@/features/jobs/domain/JobRepository";
import { validateSetJobStatus } from "@/features/jobs/domain/validation";

export async function setJobStatus(
  jobIds: string[],
  statusId: string,
  deps: { jobRepository: JobRepository },
): Promise<void> {
  validateSetJobStatus(jobIds, statusId);
  await deps.jobRepository.setJobStatus(jobIds, statusId);
}
