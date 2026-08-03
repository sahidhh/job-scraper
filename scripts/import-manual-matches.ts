import { readFileSync } from "node:fs";
import { mapManualMatch } from "@/features/jobs/application/mapManualMatch";
import { SupabaseJobRepository } from "@/features/jobs/infrastructure/SupabaseJobRepository";
import { createSupabaseServiceClient } from "@/shared/infrastructure/supabaseClient";

// Manual/one-off entry point for the "Claude routine" (docs/tasks/manual-
// job-matches.md), not part of the scrape/score/notify cron -- same
// category as scripts/discover-career-pages.ts. Reads a state.json-shaped
// file (job-match-tracker's own format) and upserts its jobs[] as
// source='claude_routine' rows. Safe to re-run -- upserts on
// (source, sourceJobId), same as every other source.
async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("[import-manual-matches] usage: tsx scripts/import-manual-matches.ts <path-to-state.json>");
    process.exit(1);
  }

  const state = JSON.parse(readFileSync(filePath, "utf-8"));
  const jobs = (state.jobs ?? []).map(mapManualMatch);

  const client = createSupabaseServiceClient();
  const repository = new SupabaseJobRepository(client);
  const result = await repository.upsertMany(jobs);

  console.log(
    `[import-manual-matches] inserted ${result.inserted}, updated ${result.updated}, duplicates ${result.duplicates}`,
  );
}

main().catch((err) => {
  console.error("[import-manual-matches] fatal error:", err);
  process.exit(1);
});
