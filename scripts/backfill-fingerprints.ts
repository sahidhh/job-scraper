import { computeFingerprint } from "@/features/jobs/application/computeFingerprint";
import { normalizeCompanyName } from "@/features/companies/domain/normalizeCompanyName";
import { createSupabaseServiceClient } from "@/shared/infrastructure/supabaseClient";

const PAGE_SIZE = 500;

// One-time backfill (Phase 1 Task 1-3): populates fingerprint/
// canonical_company_name for jobs ingested before the
// 20260703000001_job_fingerprint_dedup.sql migration, which defaults both
// columns to '' for existing rows. Safe to re-run -- every row is
// recomputed deterministically from its own title/company_name/location_tags.
async function main(): Promise<void> {
  const client = createSupabaseServiceClient();
  let updated = 0;
  let from = 0;

  for (;;) {
    const { data, error } = await client
      .from("jobs")
      .select("id, title, company_name, location_tags")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data) {
      const fingerprint = computeFingerprint({
        title: row.title,
        companyName: row.company_name,
        locationTags: row.location_tags,
      });
      const canonicalCompanyName = normalizeCompanyName(row.company_name);

      const { error: updateError } = await client
        .from("jobs")
        .update({ fingerprint, canonical_company_name: canonicalCompanyName })
        .eq("id", row.id);
      if (updateError) throw updateError;
      updated += 1;
    }

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  console.log(`[backfill-fingerprints] updated ${updated} job(s)`);
}

main().catch((err) => {
  console.error("[backfill-fingerprints] fatal error:", err);
  process.exit(1);
});
