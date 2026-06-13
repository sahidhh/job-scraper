import { DomainValidationError } from "@/shared/domain/errors";
import { assertNonEmpty } from "@/shared/domain/validation";
import type { NormalizedJob } from "./types";

// A NormalizedJob is a TaggedRawJob that passed filtering -- it must carry
// at least one location tag, plus the same non-empty-field guarantees as
// RawJob (sources/domain/validation.ts).
export function validateNormalizedJob(job: NormalizedJob): void {
  assertNonEmpty(job.sourceJobId, "NormalizedJob.sourceJobId");
  assertNonEmpty(job.title, "NormalizedJob.title");
  assertNonEmpty(job.url, "NormalizedJob.url");

  if (job.locationTags.length === 0) {
    throw new DomainValidationError(
      "NormalizedJob.locationTags must not be empty -- jobs with no matching " +
        "location tag must be dropped by filtering before reaching jobs.application",
    );
  }
}
