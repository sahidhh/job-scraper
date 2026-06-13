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

  const keywordThreshold = Number(optionalEnv("KEYWORD_THRESHOLD", "0.5"));

  const jobs = await jobRepository.findUnscored(roleSelection.id, roleSelection.expandedRoles);
  console.log(`[score] scoring ${jobs.length} unscored job(s) for role selection ${roleSelection.id}`);

  let scored = 0;
  for (const job of jobs) {
    try {
      await scoreJob(job, resume, roleSelection.id, {
        scoreRepository,
        aiScoreProvider,
        skillsDictionary: SKILLS_DICTIONARY,
        keywordThreshold,
      });
      scored += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[score] failed to score job ${job.id}: ${message}`);
    }
  }

  console.log(`[score] scored ${scored}/${jobs.length} job(s)`);
}

main().catch((err) => {
  console.error("[score] fatal error:", err);
  process.exit(1);
});
