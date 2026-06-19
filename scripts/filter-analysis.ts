import { createSupabaseServiceClient } from "@/shared/infrastructure/supabaseClient";
import { LOCATION_KEYWORD_RULES } from "@/shared/config/location-keywords";

interface SourceFunnel {
  source: string;
  fetched: number;
  afterLocation: number;
  inserted: number;
  updated: number;
  locationDropRate: number;
}

function pad(value: string, width: number): string {
  return value.padEnd(width);
}

function pct(dropped: number, total: number): string {
  if (total === 0) return "    N/A";
  return `${((dropped / total) * 100).toFixed(1)}%`.padStart(7);
}

async function main(): Promise<void> {
  const client = createSupabaseServiceClient();

  const { data: rows, error } = await client
    .from("scrape_runs")
    .select("source, found_count, kept_count, inserted_count, updated_count, status")
    .eq("status", "success")
    .gte("run_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  if (error) {
    console.error("[filter-analysis] query failed:", error.message);
    process.exit(0);
  }

  const bySource = new Map<
    string,
    { fetched: number; afterLocation: number; inserted: number; updated: number }
  >();

  for (const row of rows ?? []) {
    const existing = bySource.get(row.source) ?? {
      fetched: 0,
      afterLocation: 0,
      inserted: 0,
      updated: 0,
    };
    bySource.set(row.source, {
      fetched: existing.fetched + (row.found_count ?? 0),
      afterLocation: existing.afterLocation + (row.kept_count ?? 0),
      inserted: existing.inserted + (row.inserted_count ?? 0),
      updated: existing.updated + (row.updated_count ?? 0),
    });
  }

  const funnels: SourceFunnel[] = [...bySource.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([source, counts]) => ({
      source,
      fetched: counts.fetched,
      afterLocation: counts.afterLocation,
      inserted: counts.inserted,
      updated: counts.updated,
      locationDropRate:
        counts.fetched === 0 ? 0 : ((counts.fetched - counts.afterLocation) / counts.fetched) * 100,
    }));

  const { data: jobRows, error: jobError } = await client
    .from("jobs")
    .select("source, location_tags");

  if (jobError) {
    console.error("[filter-analysis] jobs query failed:", jobError.message);
    process.exit(0);
  }

  const jobsBySource = new Map<string, { total: number; noTags: number }>();
  for (const job of jobRows ?? []) {
    const existing = jobsBySource.get(job.source) ?? { total: 0, noTags: 0 };
    jobsBySource.set(job.source, {
      total: existing.total + 1,
      noTags: existing.noTags + (job.location_tags.length === 0 ? 1 : 0),
    });
  }

  const now = new Date().toISOString();

  console.log(`\n## Filter Effectiveness Analysis (Last 30 Days)`);
  console.log(`Generated: ${now}\n`);
  console.log(`### Pipeline: fetch → location-filter → dedup → ingest\n`);

  const col = { source: 17, fetched: 9, afterLoc: 16, inserted: 10, updated: 9, dropPct: 15 };
  const header =
    `${pad("Source", col.source)} | ${pad("Fetched", col.fetched)} | ${pad("After Location", col.afterLoc)} | ` +
    `${pad("Inserted", col.inserted)} | ${pad("Updated", col.updated)} | Location Drop%`;
  const divider = "-".repeat(header.length);

  console.log(header);
  console.log(divider);

  for (const f of funnels) {
    const dropPct = pct(f.fetched - f.afterLocation, f.fetched);
    console.log(
      `${pad(f.source, col.source)} | ${pad(String(f.fetched), col.fetched)} | ` +
        `${pad(String(f.afterLocation), col.afterLoc)} | ${pad(String(f.inserted), col.inserted)} | ` +
        `${pad(String(f.updated), col.updated)} | ${dropPct}`,
    );
  }

  if (funnels.length === 0) {
    console.log("  (no successful scrape runs in the last 30 days)");
  }

  console.log(`\n### Key Findings\n`);

  for (const f of funnels) {
    if (f.fetched === 0) continue;
    const dropped = f.fetched - f.afterLocation;
    const dropPct = ((dropped / f.fetched) * 100).toFixed(1);
    console.log(
      `- ${f.source}: ${f.fetched} fetched → ${f.afterLocation} kept = ${dropPct}% dropped by location filter`,
    );

    if (f.afterLocation === 0) {
      console.log(`  100% location drop rate — consider disabling this source`);
    }
  }

  const highDrop = funnels.filter((f) => f.fetched > 0 && f.locationDropRate === 100);
  if (highDrop.length > 0) {
    console.log(
      `\n  Sources with 100% drop rate: ${highDrop.map((f) => f.source).join(", ")} — recommend disabling`,
    );
  }

  console.log(`\n### Jobs Corpus (All Time)\n`);

  const corpusHeader = `${pad("Source", col.source)} | ${pad("Total Jobs", 12)} | No Location Tags`;
  console.log(corpusHeader);
  console.log("-".repeat(corpusHeader.length));

  for (const [source, counts] of [...jobsBySource.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    console.log(`${pad(source, col.source)} | ${pad(String(counts.total), 12)} | ${counts.noTags}`);
  }

  console.log(`\n### Role Filter\n`);
  console.log(
    "Note: role filtering is applied at fetch time (before found_count is recorded).",
  );
  console.log("The scrape_runs found_count already reflects post-role-filter results.");
  console.log("Location filtering happens after role filtering.\n");

  console.log(`### Location Keywords\n`);
  console.log("The following location keywords are accepted:\n");
  for (const rule of LOCATION_KEYWORD_RULES) {
    console.log(`  ${rule.tag}: ${rule.keywords.join(", ")}`);
  }
  console.log("");
}

main().catch((err) => {
  console.error("[filter-analysis] fatal error:", err);
  process.exit(0);
});
