import { createSupabaseServiceClient } from "@/shared/infrastructure/supabaseClient";

const RESUME_BUCKET = "resumes";
// Mirrors domain/validation.ts's MIN_PARSED_TEXT_LENGTH -- a persisted row
// below this should be unreachable through uploadResume()'s current
// (post-fix) validation, so any match here predates the fix.
const MIN_PARSED_TEXT_LENGTH = 20;

// One-time sweep (MERGE_PLAN.md Bug 1 cleanup): before this session's fix,
// actions.ts uploaded to Storage BEFORE parsing/validating the file, so a
// parse failure (bad PDF) or a validation failure (scanned/empty PDF)
// could leave an uploaded Storage object with no corresponding `resumes`
// row pointing at it -- harmless (never referenced, never billed beyond
// storage), but worth reclaiming. Separately reports any `resumes` row
// whose parsed_text is suspiciously short, in case some other path (e.g. a
// manual DB edit, or a bug this sweep doesn't yet know about) produced one
// -- these are NOT auto-deleted, since a resume row may be pointed at by
// job_scores.resume_version/resume_suggestions.resume_id and deleting one
// is a data-loss decision for a human, not a script.
//
// Read-only by default. Pass --delete-orphaned-storage to actually remove
// Storage objects confirmed to have no referencing `resumes` row.
async function main(): Promise<void> {
  const shouldDelete = process.argv.includes("--delete-orphaned-storage");
  const client = createSupabaseServiceClient();

  const { data: rows, error: rowsError } = await client.from("resumes").select("file_path, parsed_text");
  if (rowsError) throw rowsError;

  const referencedPaths = new Set((rows ?? []).map((r) => r.file_path));

  const shortTextRows = (rows ?? []).filter((r) => r.parsed_text.trim().length < MIN_PARSED_TEXT_LENGTH);
  if (shortTextRows.length > 0) {
    console.log(`[sweep-stranded-resumes] ${shortTextRows.length} resume row(s) with parsed_text < ${MIN_PARSED_TEXT_LENGTH} chars (NOT auto-deleted, review manually):`);
    for (const row of shortTextRows) {
      console.log(`  - ${row.file_path} (parsed_text: ${JSON.stringify(row.parsed_text.slice(0, 40))})`);
    }
  } else {
    console.log("[sweep-stranded-resumes] no resume rows with suspiciously short parsed_text.");
  }

  const { data: objects, error: listError } = await client.storage.from(RESUME_BUCKET).list("", { limit: 1000 });
  if (listError) throw listError;

  const orphanedPaths = (objects ?? []).map((o) => o.name).filter((name) => !referencedPaths.has(name));

  if (orphanedPaths.length === 0) {
    console.log("[sweep-stranded-resumes] no orphaned Storage objects found.");
    return;
  }

  console.log(`[sweep-stranded-resumes] ${orphanedPaths.length} Storage object(s) with no referencing resumes row:`);
  for (const path of orphanedPaths) {
    console.log(`  - ${path}`);
  }

  if (!shouldDelete) {
    console.log("[sweep-stranded-resumes] dry run -- re-run with --delete-orphaned-storage to remove these.");
    return;
  }

  const { error: removeError } = await client.storage.from(RESUME_BUCKET).remove(orphanedPaths);
  if (removeError) throw removeError;
  console.log(`[sweep-stranded-resumes] removed ${orphanedPaths.length} orphaned Storage object(s).`);
}

main().catch((err) => {
  console.error("[sweep-stranded-resumes] fatal error:", err);
  process.exit(1);
});
