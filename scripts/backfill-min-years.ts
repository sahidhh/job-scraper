import { parseMinYears } from "@/features/jobs/application/parseMinYears";
import { createSupabaseServiceClient } from "@/shared/infrastructure/supabaseClient";

const BATCH_SIZE = 500;

async function main(): Promise<void> {
  const supabase = createSupabaseServiceClient();

  let batchNumber = 0;
  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalFailed = 0;
  let offset = 0;

  console.log("[backfill-min-years] starting backfill of min_years for NULL rows");

  while (true) {
    batchNumber += 1;

    const { data: jobs, error } = await supabase
      .from("jobs")
      .select("id, title, description")
      .is("min_years", null)
      .not("description", "is", null)
      .eq("is_active", true)
      .range(offset, offset + BATCH_SIZE - 1);

    // Throw rather than break: breaking here falls through to the summary and
    // exits 0, so a run that fetched nothing at all is indistinguishable from
    // a run with nothing left to do.
    if (error) {
      throw new Error(`batch ${batchNumber}: fetch error — ${error.message}`);
    }

    if (!jobs || jobs.length === 0) {
      console.log(`[backfill-min-years] batch ${batchNumber}: no more rows, done`);
      break;
    }

    console.log(`[backfill-min-years] batch ${batchNumber}: fetched ${jobs.length} row(s)`);

    let batchUpdated = 0;

    for (const job of jobs) {
      try {
        const text = `${job.title ?? ""}\n${job.description ?? ""}`;
        const value = parseMinYears(text);

        if (value === null) {
          // Parsing returned nothing useful — preserve NULL semantics, skip.
          continue;
        }

        const { error: updateError } = await supabase
          .from("jobs")
          .update({ min_years: value })
          .eq("id", job.id);

        if (updateError) {
          // Non-fatal per row (one bad row must not strand the corpus), but
          // counted so the exit code can't report a wholly-failed run as success.
          totalFailed += 1;
          console.error(
            `[backfill-min-years] batch ${batchNumber}: failed to update job ${job.id} — ${updateError.message}`,
          );
        } else {
          batchUpdated += 1;
        }
      } catch (err) {
        totalFailed += 1;
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[backfill-min-years] batch ${batchNumber}: unexpected error on job ${job.id} — ${message}`,
        );
      }
    }

    totalProcessed += jobs.length;
    totalUpdated += batchUpdated;

    console.log(
      `[backfill-min-years] batch ${batchNumber}: ${batchUpdated}/${jobs.length} updated` +
        ` (running total: processed=${totalProcessed} updated=${totalUpdated})`,
    );

    if (jobs.length < BATCH_SIZE) {
      // Last page — no need to fetch again.
      break;
    }

    // Because we only fetch rows where min_years IS NULL, and each successful
    // update flips min_years to a non-null value, updated rows drop out of the
    // result set on the next fetch. We advance offset only by the number of
    // rows that were NOT updated so we don't skip rows.
    offset += jobs.length - batchUpdated;
  }

  // Final count of remaining NULLs (best-effort, non-fatal).
  const { count: remainingNull } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .is("min_years", null)
    .not("description", "is", null)
    .eq("is_active", true);

  console.log(
    `[backfill-min-years] finished — total processed: ${totalProcessed}` +
      ` | total updated: ${totalUpdated}` +
      ` | failed: ${totalFailed}` +
      ` | remaining NULL (active, has description): ${remainingNull ?? "unknown"}`,
  );

  if (totalFailed > 0) {
    throw new Error(`${totalFailed} row update(s) failed — see the errors above`);
  }
}

main().catch((err) => {
  console.error("[backfill-min-years] fatal error:", err);
  process.exit(1);
});
