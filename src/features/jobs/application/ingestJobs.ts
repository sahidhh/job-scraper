import type { JobRepository } from "@/features/jobs/domain/JobRepository";
import type { NormalizedJob, UpsertResult } from "@/features/jobs/domain/types";
import { extractContactEmail } from "@/features/jobs/domain/extractContactEmail";
import { extractSalary } from "@/features/jobs/domain/extractSalary";
import { validateNormalizedJob } from "@/features/jobs/domain/validation";
import { dedupeJobs } from "./dedupeJobs";
import { parseMinYears } from "./parseMinYears";

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
    return { inserted: 0, updated: 0, duplicates: 0 };
  }

  // Derive the soft experience signal (P2), a best-effort contact email
  // (Phase 2 Task 9), and a best-effort salary (Phase 2 Task 10) at ingest,
  // all parsed from title+description.
  const enriched = deduped.map((job) => {
    const text = `${job.title}\n${job.description}`;
    const contact = extractContactEmail(text);
    const salary = extractSalary(text);
    return {
      ...job,
      minYears: parseMinYears(text),
      contactEmail: contact?.email ?? null,
      contactEmailCategory: contact?.category ?? null,
      contactEmailConfidence: contact?.confidence ?? null,
      salaryCurrency: salary?.currency ?? null,
      salaryMin: salary?.min ?? null,
      salaryMax: salary?.max ?? null,
      salaryPeriod: salary?.period ?? null,
      salaryConfidence: salary?.confidence ?? null,
    };
  });

  return deps.jobRepository.upsertMany(enriched);
}
