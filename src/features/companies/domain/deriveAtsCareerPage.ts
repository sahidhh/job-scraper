import type { Company } from "@/features/companies/domain/types";
import type { JobSource } from "@/shared/domain/enums";

// Public careers page URL templates, keyed by board token -- distinct from
// the API host used for scraping (e.g. greenhouse's scrape endpoint is
// boards-api.greenhouse.io, its public careers page is boards.greenhouse.io).
const CAREER_PAGE_TEMPLATES: Partial<Record<JobSource, (token: string) => string>> = {
  greenhouse: (token) => `https://boards.greenhouse.io/${token}`,
  lever: (token) => `https://jobs.lever.co/${token}`,
  ashby: (token) => `https://jobs.ashbyhq.com/${token}`,
};

/**
 * Derives a company's careers page URL from its (source, boardToken) --
 * zero network calls, zero ambiguity: for greenhouse/lever/ashby companies
 * the ATS board itself IS the public careers page (Phase 2 Task 8). Returns
 * null for sources with no board-token template (wellfound/remoteok/
 * mycareersfuture -- aggregators, not per-company registries) or a company
 * with no boardToken set.
 */
export function deriveAtsCareerPageUrl(company: Pick<Company, "source" | "boardToken">): string | null {
  if (!company.boardToken) return null;
  const template = CAREER_PAGE_TEMPLATES[company.source];
  return template ? template(company.boardToken) : null;
}
