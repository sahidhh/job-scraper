import { tagLocations } from "@/features/filtering/application/tagLocations";
import { hasAllowedLocation } from "@/features/filtering/domain/validation";
import { ingestJobs } from "@/features/jobs/application/ingestJobs";
import { SupabaseJobRepository } from "@/features/jobs/infrastructure/SupabaseJobRepository";
import { SupabaseCompanyRepository } from "@/features/companies/infrastructure/SupabaseCompanyRepository";
import { SupabaseRoleRepository } from "@/features/roles/infrastructure/SupabaseRoleRepository";
import { classifyScrapeFailure } from "@/features/sources/domain/classifyScrapeFailure";
import { sourceScrapers } from "@/features/sources/infrastructure/registry";
import { SupabaseScrapeRunRepository } from "@/features/sources/infrastructure/SupabaseScrapeRunRepository";
import { createSupabaseServiceClient } from "@/shared/infrastructure/supabaseClient";
import { optionalEnv } from "@/shared/infrastructure/env";

const DEFAULT_EXPIRATION_DAYS = 7;

// Cron entry point (AD-04): scrapes every registered source, tags and
// filters jobs by location (architecture.md §3.1 steps 4-5), and ingests
// the survivors via jobs.application.ingestJobs (step 6). One scrape_runs
// row is written per source with full timing and count metrics
// (docs/operations/observability.md).
//
// Role-aware fetching (decisions.md AD-14): the active role selection's
// expandedRoles are passed to every adapter's fetchJobs so jobs are
// constrained by role at fetch/ingest time, not only at scoring time. If
// there is no active role selection, scraping is skipped entirely --
// fetching/ingesting everything with no role constraint would defeat the
// purpose of this change.
async function main(): Promise<void> {
  const client = createSupabaseServiceClient();
  const companyRepository = new SupabaseCompanyRepository(client);
  const jobRepository = new SupabaseJobRepository(client);
  const roleRepository = new SupabaseRoleRepository(client);
  const scrapeRunRepository = new SupabaseScrapeRunRepository(client);

  const roleSelection = await roleRepository.getActiveSelection();
  if (!roleSelection) {
    console.log("[scrape] no active role selection, skipping");
    return;
  }

  const roles = roleSelection.expandedRoles;

  for (const scraper of sourceScrapers) {
    const companies = scraper.requiresCompanyConfig ? await companyRepository.listActiveHealthy(scraper.source) : [];

    if (scraper.requiresCompanyConfig && companies.length === 0) {
      console.log(`[scrape] ${scraper.source}: no active companies configured, skipping`);
      continue;
    }

    const startedAt = new Date();

    try {
      const rawJobs = await scraper.fetchJobs(companies, roles);

      const filtered = tagLocations(rawJobs).filter((job) => hasAllowedLocation(job.locationTags));
      const result = await ingestJobs(filtered, { jobRepository });

      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt.getTime();

      // Task 5/7: a source returning literally zero jobs (not just zero
      // after location filtering) is a signal worth surfacing even though
      // the run technically "succeeded" -- likely a broken board/feed
      // rather than a genuinely quiet posting cycle.
      await scrapeRunRepository.recordRun({
        source: scraper.source,
        status: "success",
        foundCount: rawJobs.length,
        keptCount: filtered.length,
        insertedCount: result.inserted,
        updatedCount: result.updated,
        duplicateCount: result.duplicates,
        failedCount: 0,
        failureCategory: rawJobs.length === 0 ? "empty_feed" : null,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs,
        error: null,
      });

      console.log(
        `[scrape] ${scraper.source}: found ${rawJobs.length}, kept ${filtered.length}, ` +
          `inserted ${result.inserted}, updated ${result.updated}, duplicates ${result.duplicates} (${durationMs}ms)`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt.getTime();

      await scrapeRunRepository.recordRun({
        source: scraper.source,
        status: "failed",
        foundCount: 0,
        keptCount: 0,
        insertedCount: 0,
        updatedCount: 0,
        failedCount: 0,
        failureCategory: classifyScrapeFailure(err),
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs,
        error: message,
      });

      console.error(`[scrape] ${scraper.source}: failed - ${message}`);
    }
  }

  const expirationDays = parseInt(optionalEnv("JOB_EXPIRATION_DAYS", String(DEFAULT_EXPIRATION_DAYS)), 10);
  try {
    const expired = await jobRepository.markExpiredJobs(expirationDays);
    if (expired > 0) {
      console.log(`[scrape] marked ${expired} job(s) inactive (not seen for ${expirationDays}+ days)`);
    }
  } catch (err) {
    console.error("[scrape] expiration sweep failed:", err instanceof Error ? err.message : String(err));
  }
}

main().catch((err) => {
  console.error("[scrape] fatal error:", err);
  process.exit(1);
});
