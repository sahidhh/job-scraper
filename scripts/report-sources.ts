import { SupabaseScrapeRunRepository } from "@/features/sources/infrastructure/SupabaseScrapeRunRepository";
import type { ScrapeRun } from "@/features/sources/domain/types";
import { createSupabaseServiceClient } from "@/shared/infrastructure/supabaseClient";

const RECENT_RUNS = 200;
const FAILURE_WINDOW_DAYS = 7;

function pad(value: string, width: number): string {
  return value.padEnd(width);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toISOString().replace("T", " ").slice(0, 19) + "Z";
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function formatCount(n: number | null): string {
  return n === null ? "—" : String(n);
}

async function main(): Promise<void> {
  const client = createSupabaseServiceClient();
  const repo = new SupabaseScrapeRunRepository(client);

  const runs = await repo.listRecent(RECENT_RUNS);

  if (runs.length === 0) {
    console.log("No scrape runs found.");
    return;
  }

  // Group by source — keep the most recent run per source
  const latestPerSource = new Map<string, ScrapeRun>();
  for (const run of runs) {
    if (!latestPerSource.has(run.source)) {
      latestPerSource.set(run.source, run);
    }
  }

  const now = new Date();
  const cutoff = new Date(now.getTime() - FAILURE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const recentFailures = runs.filter(
    (r) => (r.status === "failed" || r.status === "partial") && new Date(r.runAt) >= cutoff,
  );

  console.log(`\nSource Observability Report`);
  console.log(`Generated: ${now.toISOString()}`);
  console.log(`${"=".repeat(100)}\n`);

  // ── Last Run Summary ──────────────────────────────────────────────────────
  console.log("Last Run Per Source:");
  console.log(
    `${pad("Source", 20)} ${pad("Last Run (UTC)", 22)} ${pad("Status", 9)} ${pad("Found", 7)} ${pad("Kept", 6)} ${pad("Inserted", 10)} ${pad("Updated", 9)} ${pad("Duration", 10)}`,
  );
  console.log(`${"-".repeat(99)}`);

  for (const [source, run] of [...latestPerSource.entries()].sort()) {
    const statusLabel = run.status === "success" ? "success" : run.status === "partial" ? "partial" : "FAILED";
    console.log(
      `${pad(source, 20)} ${pad(formatDate(run.runAt), 22)} ${pad(statusLabel, 9)} ${pad(formatCount(run.foundCount), 7)} ${pad(formatCount(run.keptCount), 6)} ${pad(formatCount(run.insertedCount), 10)} ${pad(formatCount(run.updatedCount), 9)} ${pad(formatDuration(run.durationMs), 10)}`,
    );
  }

  // ── Failure Summary ───────────────────────────────────────────────────────
  console.log(`\nFailures in the last ${FAILURE_WINDOW_DAYS} days:`);

  if (recentFailures.length === 0) {
    console.log("  No failures — all sources healthy.\n");
    return;
  }

  console.log(
    `\n${pad("Source", 20)} ${pad("Run Time (UTC)", 22)} ${pad("Status", 9)} Error`,
  );
  console.log(`${"-".repeat(99)}`);

  for (const run of recentFailures) {
    const errorSnippet = run.error ? run.error.slice(0, 60) + (run.error.length > 60 ? "…" : "") : "(no message)";
    console.log(
      `${pad(run.source, 20)} ${pad(formatDate(run.runAt), 22)} ${pad(run.status, 9)} ${errorSnippet}`,
    );
  }

  console.log(`\nTotal failures: ${recentFailures.length} across ${new Set(recentFailures.map((r) => r.source)).size} source(s)\n`);
}

main().catch((err) => {
  console.error("[report-sources] fatal error:", err);
  process.exit(1);
});
