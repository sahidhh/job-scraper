import type { EmploymentType } from "@/features/jobs/domain/extractJobAttributes";
import type { SalaryPeriod } from "@/features/jobs/domain/extractSalary";
import type { JobMatch } from "@/features/notifications/domain/types";

const PERIOD_ABBREVIATION: Record<SalaryPeriod, string> = {
  yearly: "yr",
  monthly: "mo",
  hourly: "hr",
};

const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  internship: "Internship",
  contract: "Contract",
  freelance: "Freelance",
  temporary: "Temporary",
  part_time: "Part-time",
  full_time: "Full-time",
};

// Only the signals this module actually reads -- narrower than JobMatch so
// callers that don't have a full match (e.g. the webhook's own DB query,
// which fetches a different column set) can build a compatible object
// instead of needing every JobMatch field.
export type JobHighlightSignals = Pick<
  JobMatch,
  "locationTags" | "urgentHiring" | "salaryMin" | "salaryMax" | "salaryCurrency" | "salaryPeriod" | "employmentType"
>;

function formatSalaryHighlight(match: JobHighlightSignals): string | null {
  if (match.salaryMin === null) return null;

  const currency = match.salaryCurrency ?? "";
  const period = match.salaryPeriod ? `/${PERIOD_ABBREVIATION[match.salaryPeriod]}` : "";
  const min = Math.round(match.salaryMin).toLocaleString("en-US");
  const range =
    match.salaryMax !== null && match.salaryMax !== match.salaryMin
      ? `${min}–${Math.round(match.salaryMax).toLocaleString("en-US")}`
      : min;

  return `\u{1F4B0} ${currency}${range}${period}`.trim();
}

/**
 * Builds short "why this job" badges for a notified match (Phase 4 digest
 * polish) from signals already computed at ingest -- no extra queries.
 * Deterministic and order-stable so message snapshots stay consistent.
 * Full-time is the assumed default and is not called out as a badge; only
 * signals worth a second look are surfaced.
 */
export function buildJobHighlights(match: JobHighlightSignals): string[] {
  const highlights: string[] = [];

  if (match.locationTags.includes("remote")) highlights.push("\u{1F30D} Remote");
  if (match.urgentHiring) highlights.push("⚡ Urgent hiring");

  const salary = formatSalaryHighlight(match);
  if (salary) highlights.push(salary);

  if (match.employmentType && match.employmentType !== "full_time") {
    highlights.push(`\u{1F4C4} ${EMPLOYMENT_TYPE_LABEL[match.employmentType]}`);
  }

  return highlights;
}
