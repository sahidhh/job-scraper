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

function formatSalaryHighlight(match: JobMatch): string | null {
  if (match.salaryMin === null) return null;

  const currency = match.salaryCurrency ?? "";
  const period = match.salaryPeriod ? `/${PERIOD_ABBREVIATION[match.salaryPeriod]}` : "";
  const min = Math.round(match.salaryMin).toLocaleString();
  const range =
    match.salaryMax !== null && match.salaryMax !== match.salaryMin
      ? `${min}–${Math.round(match.salaryMax).toLocaleString()}`
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
export function buildJobHighlights(match: JobMatch): string[] {
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
