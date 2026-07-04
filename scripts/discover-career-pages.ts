import { discoverAtsCareerPages } from "@/features/companies/application/discoverAtsCareerPages";
import { SupabaseCareerPageRepository } from "@/features/companies/infrastructure/SupabaseCareerPageRepository";
import { SupabaseCompanyRepository } from "@/features/companies/infrastructure/SupabaseCompanyRepository";
import { createSupabaseServiceClient } from "@/shared/infrastructure/supabaseClient";

// Standalone enrichment tool (Phase 2 Task 8), not part of the scrape/score/
// notify cron: derives each ATS-registry company's public careers page URL
// (deterministic from source + board_token, no network calls) and persists
// it to company_career_pages for future reuse. Safe to re-run -- upserts on
// canonical_company_name.
async function main(): Promise<void> {
  const client = createSupabaseServiceClient();
  const companyRepository = new SupabaseCompanyRepository(client);
  const careerPageRepository = new SupabaseCareerPageRepository(client);

  const companies = await companyRepository.list();
  const pages = discoverAtsCareerPages(companies);

  await careerPageRepository.upsertMany(pages);

  console.log(`[discover-career-pages] discovered ${pages.length} career page(s) from ${companies.length} companies`);
}

main().catch((err) => {
  console.error("[discover-career-pages] fatal error:", err);
  process.exit(1);
});
