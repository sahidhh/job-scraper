import { assertNonEmpty } from "@/shared/domain/validation";
import type { RawJob } from "./types";

// scrapers.md §3 normalization rules: sourceJobId/title/url must always be
// present and non-empty for a RawJob to be usable downstream. locationRaw
// is allowed to be "" (handled by the filtering feature, which drops it).
export function validateRawJob(job: RawJob): void {
  assertNonEmpty(job.sourceJobId, "RawJob.sourceJobId");
  assertNonEmpty(job.title, "RawJob.title");
  assertNonEmpty(job.url, "RawJob.url");
}
