import { createSupabaseServiceClient } from "@/shared/infrastructure/supabaseClient";
import type { Database } from "../supabase/database.types";

type DbJobSource = Database["public"]["Enums"]["job_source"];
type ScrapeRunStatus = Database["public"]["Enums"]["scrape_run_status"];

// Sources to report on — superset of the DB enum to handle migrations
// where new sources are added to the schema before the generated types are updated.
const ALL_SOURCES = [
  "greenhouse",
  "lever",
  "ashby",
  "wellfound",
  "remoteok",
  "mycareersfuture",
] as const;

type ReportSource = (typeof ALL_SOURCES)[number];

interface SourceMetrics {
  source: ReportSource;
  runCount: number;
  jobsFound: number;
  jobsKept: number;
  keepRate: string;
  jobsInserted: number;
  jobsUpdated: number;
  successRate: string;
  avgFoundPerRun: number;
}

interface ScrapeRunRow {
  source: DbJobSource | ReportSource;
  status: ScrapeRunStatus;
  found_count: number;
  kept_count: number | null;
  inserted_count: number | null;
  updated_count: number | null;
}

function formatPercent(numerator: number, denominator: number): string {
  if (denominator === 0) return "0.0%";
  return ((numerator / denominator) * 100).toFixed(1) + "%";
}

function pad(value: string | number, width: number, right = false): string {
  const s = String(value);
  const padding = " ".repeat(Math.max(0, width - s.length));
  return right ? s + padding : padding + s;
}

function computeMetrics(source: ReportSource, rows: ScrapeRunRow[]): SourceMetrics {
  const sourceRows = rows.filter((r) => r.source === source);
  const runCount = sourceRows.length;
  const jobsFound = sourceRows.reduce((sum, r) => sum + r.found_count, 0);
  const jobsKept = sourceRows.reduce((sum, r) => sum + (r.kept_count ?? 0), 0);
  const jobsInserted = sourceRows.reduce((sum, r) => sum + (r.inserted_count ?? 0), 0);
  const jobsUpdated = sourceRows.reduce((sum, r) => sum + (r.updated_count ?? 0), 0);
  const successCount = sourceRows.filter((r) => r.status === "success").length;

  return {
    source,
    runCount,
    jobsFound,
    jobsKept,
    keepRate: formatPercent(jobsKept, jobsFound),
    jobsInserted,
    jobsUpdated,
    successRate: formatPercent(successCount, runCount),
    avgFoundPerRun: runCount === 0 ? 0 : jobsFound / runCount,
  };
}

function printTable(metrics: SourceMetrics[]): void {
  const header =
    pad("Source", 16, true) +
    "| " +
    pad("Runs", 4) +
    " | " +
    pad("Found", 5) +
    " | " +
    pad("Kept", 4) +
    " | " +
    pad("Keep%", 6) +
    " | " +
    pad("Inserted", 8) +
    " | " +
    pad("Updated", 7) +
    " | " +
    pad("30d Avg", 7);

  const divider =
    "-".repeat(16) +
    "|" +
    "-".repeat(6) +
    "|" +
    "-".repeat(7) +
    "|" +
    "-".repeat(6) +
    "|" +
    "-".repeat(8) +
    "|" +
    "-".repeat(10) +
    "|" +
    "-".repeat(9) +
    "|" +
    "-".repeat(8);

  console.log(header);
  console.log(divider);

  for (const m of metrics) {
    const row =
      pad(m.source, 16, true) +
      "| " +
      pad(m.runCount, 4) +
      " | " +
      pad(m.jobsFound, 5) +
      " | " +
      pad(m.jobsKept, 4) +
      " | " +
      pad(m.keepRate, 6) +
      " | " +
      pad(m.jobsInserted, 8) +
      " | " +
      pad(m.jobsUpdated, 7) +
      " | " +
      pad(m.avgFoundPerRun.toFixed(1), 7);
    console.log(row);
  }
}

function printLowPerformers(metrics: SourceMetrics[]): void {
  const low = metrics.filter((m) => {
    const keepRateNum = parseFloat(m.keepRate);
    return keepRateNum < 10 || m.avgFoundPerRun < 5;
  });

  if (low.length === 0) return;

  console.log("\n## Low Performers (keep rate < 10% or avg found < 5)");
  for (const m of low) {
    const keepRateNum = parseFloat(m.keepRate);
    const parts: string[] = [`${m.avgFoundPerRun.toFixed(1)} avg found/run`];
    if (keepRateNum < 10) {
      parts.push(`${m.keepRate} keep rate`);
    }
    console.log(`  ${m.source}: ${parts.join(", ")}`);
  }
}

async function main(): Promise<void> {
  const client = createSupabaseServiceClient();

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const { data, error } = await client
    .from("scrape_runs")
    .select("source, status, found_count, kept_count, inserted_count, updated_count")
    .gte("run_at", since.toISOString());

  if (error) {
    console.error("[source-analytics] query failed:", error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log("No data available");
    process.exit(0);
  }

  const rows = data as ScrapeRunRow[];

  console.log("## Source Quality Report (Last 30 Days)\n");

  const metrics = ALL_SOURCES.map((source) => computeMetrics(source, rows));
  printTable(metrics);
  printLowPerformers(metrics);
}

main().catch((err: unknown) => {
  console.error("[source-analytics] fatal:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
