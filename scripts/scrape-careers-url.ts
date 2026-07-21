import { tagLocations } from "@/features/filtering/application/tagLocations";
import { hasAllowedLocation } from "@/features/filtering/domain/validation";
import { ingestJobs } from "@/features/jobs/application/ingestJobs";
import { SupabaseJobRepository } from "@/features/jobs/infrastructure/SupabaseJobRepository";
import { SupabaseRoleRepository } from "@/features/roles/infrastructure/SupabaseRoleRepository";
import { classifyScrapeFailure } from "@/features/sources/domain/classifyScrapeFailure";
import { LlmCareersPageExtractor } from "@/features/sources/infrastructure/careersUrl/LlmCareersPageExtractor";
import { fetchCareersUrlJobs } from "@/features/sources/infrastructure/careersUrl/CareersUrlScraper";
import { SupabaseScrapeRunRepository } from "@/features/sources/infrastructure/SupabaseScrapeRunRepository";
import { SupabaseSettingsRepository } from "@/features/settings/infrastructure/SupabaseSettingsRepository";
import { createSupabaseServiceClient } from "@/shared/infrastructure/supabaseClient";

// Manual-trigger entry point for the static careers-URL fetcher
// (merge-workspace Phase 5, docs/decisions.md AD-35) -- NOT part of
// scrape.ts's cron loop/registry.ts (see enums.ts's JOB_SOURCES comment for
// why). Run on demand for one operator-provided public careers page:
//   npm run scrape:careers-url -- https://example.com/careers
// Reuses the exact same tagLocations -> hasAllowedLocation -> ingestJobs ->
// recordRun pipeline scrape.ts's per-source block uses, so a careers_url run
// gets the same location filtering, cross-source dedup, and scrape_runs
// provenance as every other source -- just invoked for one URL instead of a
// registry loop.
async function main(): Promise<void> {
  const url = process.argv[2];
  if (!url) {
    console.error("[scrape-careers-url] usage: npm run scrape:careers-url -- <careers-page-url>");
    process.exit(1);
  }

  const client = createSupabaseServiceClient();
  const jobRepository = new SupabaseJobRepository(client);
  const roleRepository = new SupabaseRoleRepository(client);
  const scrapeRunRepository = new SupabaseScrapeRunRepository(client);
  const settingsRepository = new SupabaseSettingsRepository(client);

  const roleSelection = await roleRepository.getActiveSelection();
  if (!roleSelection) {
    console.log("[scrape-careers-url] no active role selection, skipping");
    return;
  }

  const roles = roleSelection.expandedRoles;
  const extractor = new LlmCareersPageExtractor();
  const startedAt = new Date();

  try {
    const rawJobs = await fetchCareersUrlJobs(url, roles, { extractor });

    const filtered = tagLocations(rawJobs).filter((job) => hasAllowedLocation(job.locationTags));
    const skipUnsponsoredForeignJobs = await settingsRepository.getSkipUnsponsoredForeignJobs();
    const result = await ingestJobs(filtered, { jobRepository, skipUnsponsoredForeignJobs });

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    await scrapeRunRepository.recordRun({
      source: "careers_url",
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
      metadata: { url },
    });

    const skippedNote =
      result.skippedUnsponsored > 0 ? `, skipped ${result.skippedUnsponsored} unsponsored foreign` : "";
    console.log(
      `[scrape-careers-url] ${url}: found ${rawJobs.length}, kept ${filtered.length}, ` +
        `inserted ${result.inserted}, updated ${result.updated}, duplicates ${result.duplicates}${skippedNote} (${durationMs}ms)`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    await scrapeRunRepository.recordRun({
      source: "careers_url",
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
      metadata: { url },
    });

    console.error(`[scrape-careers-url] ${url}: failed - ${message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[scrape-careers-url] fatal error:", err);
  process.exit(1);
});
