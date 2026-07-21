import { SupabaseResumeRepository } from "@/features/resume/infrastructure/SupabaseResumeRepository";
import { SupabaseRoleRepository } from "@/features/roles/infrastructure/SupabaseRoleRepository";
import { SupabaseScoreRepository } from "@/features/scoring/infrastructure/SupabaseScoreRepository";
import { createSupabaseServiceClient } from "@/shared/infrastructure/supabaseClient";

// Force a full re-score of the active corpus: clears every job_scores row for
// the active role selection + active resume version so the next scoring pass
// rebuilds them under the current prompt/constraints. score.ts only (re)scores
// jobs that have NO score row for the active (role_selection, resume_version)
// -- so a prompt/constraint change (e.g. AD-50) does NOT affect already-scored
// jobs until their rows are cleared here (limitations.md §3.5).
//
// This script only DELETES; run `npm run score` afterwards to rebuild. The
// `rescore.yml` workflow chains both steps.
async function main(): Promise<void> {
  const client = createSupabaseServiceClient();
  const roleRepository = new SupabaseRoleRepository(client);
  const resumeRepository = new SupabaseResumeRepository(client);
  const scoreRepository = new SupabaseScoreRepository(client);

  const roleSelection = await roleRepository.getActiveSelection();
  if (!roleSelection) {
    console.log("[rescore] no active role selection — nothing to clear.");
    return;
  }

  const activeResume = await resumeRepository.getActive();
  const resumeVersion = activeResume?.version ?? 0;

  const deleted = await scoreRepository.deleteScores(roleSelection.id, resumeVersion);

  console.log(
    `[rescore] cleared ${deleted} score(s) for role "${roleSelection.primaryRole}" (resume v${resumeVersion}). ` +
      `Run \`npm run score\` to rebuild them under the current prompt.`,
  );
}

main().catch((err) => {
  console.error("[rescore] fatal error:", err);
  process.exit(1);
});
