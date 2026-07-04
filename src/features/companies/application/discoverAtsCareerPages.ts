import { deriveAtsCareerPageUrl } from "@/features/companies/domain/deriveAtsCareerPage";
import { normalizeCompanyName } from "@/features/companies/domain/normalizeCompanyName";
import type { Company, NewCareerPage } from "@/features/companies/domain/types";

/**
 * Deterministic career-page discovery for every ATS-registry company
 * (Phase 2 Task 8) -- no network calls, no scraping: the board itself is
 * the public careers page for greenhouse/lever/ashby. Companies with no
 * derivable URL (no boardToken, or an aggregator source) are skipped, not
 * included with a null URL.
 */
export function discoverAtsCareerPages(companies: readonly Company[]): NewCareerPage[] {
  const pages: NewCareerPage[] = [];

  for (const company of companies) {
    const careerPageUrl = deriveAtsCareerPageUrl(company);
    if (!careerPageUrl) continue;

    pages.push({
      canonicalCompanyName: normalizeCompanyName(company.name),
      careerPageUrl,
      discoveryMethod: "ats_board",
      confidence: "high",
    });
  }

  return pages;
}
