import type { JobRepository } from "@/features/jobs/domain/JobRepository";
import type { IngestResult, NormalizedJob } from "@/features/jobs/domain/types";
import { extractContactEmail } from "@/features/jobs/domain/extractContactEmail";
import { extractJobAttributes } from "@/features/jobs/domain/extractJobAttributes";
import { extractSalary } from "@/features/jobs/domain/extractSalary";
import { isUnsponsoredForeignOnsite } from "@/features/jobs/domain/isUnsponsoredForeignOnsite";
import { validateNormalizedJob } from "@/features/jobs/domain/validation";
// Cross-feature import: the eligibility rules live with scoring (their other
// consumer, scoreJob.ts) but the verdict is now a job attribute computed
// once here at ingest rather than recomputed per scoring run (AD-50).
import { classifyEligibility } from "@/features/scoring/domain/classifyEligibility";
import { dedupeJobs } from "./dedupeJobs";
import { parseMinYears } from "./parseMinYears";

export interface IngestJobsDeps {
  jobRepository: JobRepository;
  /**
   * When true, drop foreign onsite/hybrid postings that explicitly refuse
   * visa sponsorship instead of storing them (app_settings key
   * `skip_unsponsored_foreign_jobs`). Off by default.
   */
  skipUnsponsoredForeignJobs?: boolean;
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
): Promise<IngestResult> {
  const deduped = dedupeJobs(jobs);

  for (const job of deduped) {
    validateNormalizedJob(job);
  }

  if (deduped.length === 0) {
    return { inserted: 0, updated: 0, duplicates: 0, skippedUnsponsored: 0 };
  }

  // Derive the soft experience signal (P2), a best-effort contact email
  // (Phase 2 Task 9), a best-effort salary (Phase 2 Task 10), deterministic
  // job attributes (employment type/seniority/work arrangement/visa/
  // relocation/clearance/urgency -- personal-intelligence polish), and the
  // eligibility verdict (AD-50) at ingest, all parsed from title+description.
  const enriched = deduped.map((job) => {
    const text = `${job.title}\n${job.description}`;
    const contact = extractContactEmail(text);
    const salary = extractSalary(text);
    const attributes = extractJobAttributes(text);
    const eligibility = classifyEligibility(job);
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
      employmentType: attributes.employmentType,
      seniority: attributes.seniority,
      workArrangement: attributes.workArrangement,
      visaSponsorship: attributes.visaSponsorship,
      relocationAssistance: attributes.relocationAssistance,
      securityClearance: attributes.securityClearance,
      urgentHiring: attributes.urgentHiring,
      ineligibleReason: eligibility.code,
    };
  });

  // Optional ingest-time filter (settings). Distinct from the eligibility
  // verdict above: ineligible jobs are still stored (so they can be shown on
  // request and counted), whereas these are never persisted at all.
  const kept = deps.skipUnsponsoredForeignJobs ? enriched.filter((job) => !isUnsponsoredForeignOnsite(job)) : enriched;
  const skippedUnsponsored = enriched.length - kept.length;

  if (kept.length === 0) {
    return { inserted: 0, updated: 0, duplicates: 0, skippedUnsponsored };
  }

  const result = await deps.jobRepository.upsertMany(kept);
  return { ...result, skippedUnsponsored };
}
