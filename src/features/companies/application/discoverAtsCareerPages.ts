import { deriveAtsCareerPageUrl } from "@/features/companies/domain/deriveAtsCareerPage";
import { normalizeCompanyName } from "@/features/companies/domain/normalizeCompanyName";
import type { Company, NewCareerPage } from "@/features/companies/domain/types";

/**
 * Deterministic career-page discovery for every ATS-registry company
 * (Phase 2 Task 8) -- no network calls, no scraping: the board itself is
 * the public careers page for greenhouse/lever/ashby. Companies with no
 * derivable URL (no boardToken, or an aggregator source) are skipped, not
 * included with a null URL.
 *
 * De-duplicates by canonicalCompanyName, keeping the last match: two
 * `companies` rows can share a canonical name (e.g. the same company
 * configured on both greenhouse and lever), and CareerPageRepository.
 * upsertMany does a single batched upsert keyed on canonicalCompanyName --
 * Postgres rejects a multi-row upsert that targets the same conflict key
 * twice ("ON CONFLICT DO UPDATE command cannot affect row a second time"),
 * so any duplicate must be resolved before it reaches the repository.
 */
export function discoverAtsCareerPages(companies: readonly Company[]): NewCareerPage[] {
  const byCanonicalName = new Map<string, NewCareerPage>();

  for (const company of companies) {
    const careerPageUrl = deriveAtsCareerPageUrl(company);
    if (!careerPageUrl) continue;

    const canonicalCompanyName = normalizeCompanyName(company.name);
    byCanonicalName.set(canonicalCompanyName, {
      canonicalCompanyName,
      careerPageUrl,
      discoveryMethod: "ats_board",
      confidence: "high",
    });
  }

  return [...byCanonicalName.values()];
}
