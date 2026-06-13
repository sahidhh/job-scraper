import type { JobRepository } from "@/features/jobs/domain/JobRepository";
import type { NormalizedJob, UpsertResult } from "@/features/jobs/domain/types";
import { validateNormalizedJob } from "@/features/jobs/domain/validation";
import { dedupeJobs } from "./dedupeJobs";

export interface IngestJobsDeps {
  jobRepository: JobRepository;
}

/**
 * Dedupes, validates, and persists a batch of filtered jobs
 * (architecture.md §3.1 step 6). Throws DomainValidationError if any job
 * is missing required fields or has no location tags -- both should be
 * impossible by the time jobs reach here (sources/filtering already
 * enforce this), so a throw here indicates an upstream bug, not bad data
 * to be silently skipped.
 */
export async function ingestJobs(
  jobs: readonly NormalizedJob[],
  deps: IngestJobsDeps,
): Promise<UpsertResult> {
  const deduped = dedupeJobs(jobs);

  for (const job of deduped) {
    validateNormalizedJob(job);
  }

  if (deduped.length === 0) {
    return { inserted: 0, updated: 0 };
  }

  return deps.jobRepository.upsertMany(deduped);
}
