import { SupabaseJobRepository } from "@/features/jobs/infrastructure/SupabaseJobRepository";
import { SupabaseResumeRepository } from "@/features/resume/infrastructure/SupabaseResumeRepository";
import { SupabaseRoleRepository } from "@/features/roles/infrastructure/SupabaseRoleRepository";
import { scoreJob } from "@/features/scoring/application/scoreJob";
import { OpenRouterAiScoreProvider } from "@/features/scoring/infrastructure/OpenRouterAiScoreProvider";
import { SupabaseScoreRepository } from "@/features/scoring/infrastructure/SupabaseScoreRepository";
import { SKILLS_DICTIONARY } from "@/shared/config/skills-dictionary";
import { optionalEnv } from "@/shared/infrastructure/env";
import { createSupabaseServiceClient } from "@/shared/infrastructure/supabaseClient";

// Cron entry point (AD-04): scores every job not yet scored for the active
// role selection against the active resume (scoring.md §2-3, AD-07).
async function main(): Promise<void> {
  const client = createSupabaseServiceClient();
  const jobRepository = new SupabaseJobRepository(client);
  const resumeRepository = new SupabaseResumeRepository(client);
  const roleRepository = new SupabaseRoleRepository(client);
  const scoreRepository = new SupabaseScoreRepository(client);
  const aiScoreProvider = new OpenRouterAiScoreProvider();

  const resume = await resumeRepository.getActive();
  if (!resume) {
    console.log("[score] no active resume, skipping");
    return;
  }

  const roleSelection = await roleRepository.getActiveSelection();
  if (!roleSelection) {
    console.log("[score] no active role selection, skipping");
    return;
  }

  // Lowered from 0.5 (decisions.md AD-07 follow-up): the prior default left
  // ai_score null for nearly all jobs because real skill-overlap rarely
  // reaches 0.5. 0.25 still bounds AI spend to skill-relevant jobs while
  // letting the AI stage actually run. Override via KEYWORD_THRESHOLD.
  const keywordThreshold = Number(optionalEnv("KEYWORD_THRESHOLD", "0.25"));

  const jobs = await jobRepository.findUnscored(roleSelection.id, roleSelection.expandedRoles, resume.version, keywordThreshold);
  console.log(`[score] scoring ${jobs.length} unscored/retry job(s) for role selection ${roleSelection.id}`);

  let scored = 0;
  let skippedBelowGate = 0;
  let aiCallFailed = 0;
  for (const job of jobs) {
    try {
      const result = await scoreJob(job, resume, roleSelection.id, {
        scoreRepository,
        aiScoreProvider,
        skillsDictionary: SKILLS_DICTIONARY,
        keywordThreshold,
      });

      if (result.keywordScore < keywordThreshold) {
        skippedBelowGate += 1;
        console.log(
          `[score] job ${job.id}: skipped AI (keyword score ${result.keywordScore.toFixed(2)} < threshold ${keywordThreshold})`,
        );
      } else if (result.aiScore == null) {
        aiCallFailed += 1;
        console.warn(
          `[score] job ${job.id}: AI provider returned null (call failed or malformed response); ai_score left null for retry`,
        );
      } else {
        console.log(`[score] job ${job.id}: scored (keyword=${result.keywordScore.toFixed(2)}, ai=${result.aiScore.toFixed(2)})`);
      }

      scored += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[score] failed to score job ${job.id}: ${message}`);
    }
  }

  console.log(
    `[score] scored ${scored}/${jobs.length} job(s) (${skippedBelowGate} below keyword gate, ${aiCallFailed} AI call failures left for retry)`,
  );
}

main().catch((err) => {
  console.error("[score] fatal error:", err);
  process.exit(1);
});
