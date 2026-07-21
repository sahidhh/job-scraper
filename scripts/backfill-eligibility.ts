import { classifyEligibility } from "@/features/scoring/domain/classifyEligibility";
import { createSupabaseServiceClient } from "@/shared/infrastructure/supabaseClient";

const BATCH_SIZE = 500;

// One-off (but idempotent) backfill for jobs.ineligible_reason, added by
// migration 20260720000001 (AD-51). Rows ingested before that migration have
// the column NULL, which reads as "eligible" -- so every existing job must be
// re-classified once or hard-excluded jobs stay in the scoring queue and
// visible on the dashboard.
//
// Safe to re-run at any time: it recomputes and rewrites the verdict for
// every active job, so it doubles as the refresh path after the phrase lists
// in shared/config/candidate-constraints.ts change (design/limitations.md --
// the stored verdict is an ingest-time snapshot, not a live view).
async function main(): Promise<void> {
  const supabase = createSupabaseServiceClient();

  let batchNumber = 0;
  let offset = 0;
  let totalProcessed = 0;
  let totalChanged = 0;
  let totalFailed = 0;
  const byReason = new Map<string, number>();

  console.log("[backfill-eligibility] starting reclassification of active jobs");

  while (true) {
    batchNumber += 1;

    // Paging by offset is stable here even though rows are updated in place:
    // the filter (is_active) is not affected by what this script writes, so
    // no row moves in or out of the result set mid-run.
    const { data: jobs, error } = await supabase
      .from("jobs")
      .select("id, location_raw, location_tags, description, ineligible_reason")
      .eq("is_active", true)
      .order("id", { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    // Throw rather than break: a fetch failure means the run accomplished
    // nothing, and breaking here would fall through to the summary and exit 0
    // -- indistinguishable from a clean no-op run. That is exactly how a
    // missing ineligible_reason column (migration 20260720000001 unapplied)
    // reported success while backfilling zero rows.
    if (error) {
      throw new Error(`batch ${batchNumber}: fetch error — ${error.message}`);
    }

    if (!jobs || jobs.length === 0) {
      console.log(`[backfill-eligibility] batch ${batchNumber}: no more rows, done`);
      break;
    }

    let batchChanged = 0;

    for (const job of jobs) {
      const { code } = classifyEligibility({
        locationRaw: job.location_raw ?? "",
        locationTags: job.location_tags ?? [],
        description: job.description ?? "",
      });

      if (code !== null) byReason.set(code, (byReason.get(code) ?? 0) + 1);

      // Only write when the verdict actually changed -- keeps re-runs cheap.
      if (code === job.ineligible_reason) continue;

      const { error: updateError } = await supabase
        .from("jobs")
        .update({ ineligible_reason: code })
        .eq("id", job.id);

      if (updateError) {
        // Per-row failures stay non-fatal so one bad row can't strand the
        // rest of the corpus, but they are counted and surfaced in the exit
        // code -- a run that failed every write must not report success.
        totalFailed += 1;
        console.error(
          `[backfill-eligibility] batch ${batchNumber}: failed to update job ${job.id} — ${updateError.message}`,
        );
      } else {
        batchChanged += 1;
      }
    }

    totalProcessed += jobs.length;
    totalChanged += batchChanged;

    console.log(
      `[backfill-eligibility] batch ${batchNumber}: ${batchChanged}/${jobs.length} changed` +
        ` (running total: processed=${totalProcessed} changed=${totalChanged})`,
    );

    if (jobs.length < BATCH_SIZE) break;
    offset += jobs.length;
  }

  const breakdown =
    byReason.size > 0
      ? [...byReason.entries()].map(([reason, count]) => `${reason}=${count}`).join(" ")
      : "none";

  console.log(
    `[backfill-eligibility] finished — processed: ${totalProcessed}` +
      ` | changed: ${totalChanged}` +
      ` | failed: ${totalFailed}` +
      ` | ineligible breakdown: ${breakdown}`,
  );

  if (totalFailed > 0) {
    throw new Error(`${totalFailed} row update(s) failed — see the errors above`);
  }
}

main().catch((err) => {
  console.error("[backfill-eligibility] fatal error:", err);
  process.exit(1);
});
