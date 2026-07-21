import { SupabaseJobRepository } from "@/features/jobs/infrastructure/SupabaseJobRepository";
import { SupabaseResumeRepository } from "@/features/resume/infrastructure/SupabaseResumeRepository";
import { SupabaseRoleRepository } from "@/features/roles/infrastructure/SupabaseRoleRepository";
import { getScoringQueueReport } from "@/features/scoring/application/getScoringQueueReport";
import { scoreJob } from "@/features/scoring/application/scoreJob";
import { INELIGIBLE_REASON_LABELS, classifyEligibility } from "@/features/scoring/domain/classifyEligibility";
import { SCORING_QUEUE_CONFIG } from "@/features/scoring/domain/scoringQueueConfig";
import { OpenRouterAiScoreProvider } from "@/features/scoring/infrastructure/OpenRouterAiScoreProvider";
import { SupabaseRankingPreferencesRepository } from "@/features/scoring/infrastructure/SupabaseRankingPreferencesRepository";
import { SupabaseScoreRepository } from "@/features/scoring/infrastructure/SupabaseScoreRepository";
import { TransformersEmbeddingScoreProvider } from "@/features/scoring/infrastructure/TransformersEmbeddingScoreProvider";
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
  const rankingPreferencesRepository = new SupabaseRankingPreferencesRepository(client);
  const aiScoreProvider = new OpenRouterAiScoreProvider();
  // Local, offline stage-2 semantic signal (decisions.md AD-31) -- the
  // model loads once (cached across jobs in this run) and degrades to a
  // logged null on any failure, so it's always safe to wire in.
  const embeddingScoreProvider = new TransformersEmbeddingScoreProvider();

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

  // Cost tracking: set OPENROUTER_COST_PER_1K_TOKENS to the blended per-1k-token
  // rate for the model in use (e.g. "0.0008" for $0.80/1M tokens). When unset,
  // estimated_cost_usd is left null on each score row and the run-cost log line
  // is omitted. See scoring.md §5.
  const costPer1kTokensRaw = optionalEnv("OPENROUTER_COST_PER_1K_TOKENS", "");
  const costPer1kTokensParsed = costPer1kTokensRaw !== "" ? Number(costPer1kTokensRaw) : null;
  const costPer1kTokens =
    costPer1kTokensParsed !== null && !isNaN(costPer1kTokensParsed) ? costPer1kTokensParsed : null;
  if (costPer1kTokensRaw !== "" && costPer1kTokens === null) {
    console.warn(
      `[score] OPENROUTER_COST_PER_1K_TOKENS="${costPer1kTokensRaw}" is not a valid number; cost tracking disabled`,
    );
  }

  const { maxAiRetries } = SCORING_QUEUE_CONFIG;
  const jobs = await jobRepository.findUnscored(
    roleSelection.id,
    roleSelection.expandedRoles,
    resume.version,
    keywordThreshold,
    maxAiRetries,
  );
  console.log(
    `[score] scoring ${jobs.length} unscored/retry job(s) for role selection ${roleSelection.id} (AI retry cap ${maxAiRetries})`,
  );

  // Composite ranking score bonuses (Theme 1); absent settings row means
  // aiScore-only ranking (computeOverallScore.ts defaults to zero bonuses).
  const rankingPreferences = (await rankingPreferencesRepository.getPreferences()) ?? {};

  let scored = 0;
  let skippedBelowGate = 0;
  let hardExcluded = 0;
  for (const job of jobs) {
    try {
      const result = await scoreJob(job, resume, roleSelection.id, {
        scoreRepository,
        aiScoreProvider,
        embeddingScoreProvider,
        skillsDictionary: SKILLS_DICTIONARY,
        keywordThreshold,
        costPer1kTokens,
        rankingPreferences,
      });

      // Distinguishes "hard-excluded" from "AI call failed" in the log, since
      // both leave ai_score null on the row. findUnscored now filters out jobs
      // with a stored ineligible_reason (AD-50), so this branch should only
      // ever fire for rows ingested before that column existed and not yet
      // put through `npm run backfill:eligibility`.
      const eligibility = job.ineligibleReason
        ? { eligible: false, reason: INELIGIBLE_REASON_LABELS[job.ineligibleReason] }
        : classifyEligibility(job);

      if (result.keywordScore < keywordThreshold) {
        skippedBelowGate += 1;
        console.log(
          `[score] job ${job.id}: skipped AI (keyword score ${result.keywordScore.toFixed(2)} < threshold ${keywordThreshold})`,
        );
      } else if (!eligibility.eligible) {
        hardExcluded += 1;
        console.log(`[score] job ${job.id}: hard-excluded, skipped AI (${eligibility.reason})`);
      } else if (result.aiScore == null) {
        console.warn(
          `[score] job ${job.id}: AI provider returned null (call failed or malformed response); ai_score left null for retry`,
        );
      } else {
        const embeddingPart = result.embeddingScore != null ? `, embedding=${result.embeddingScore.toFixed(2)}` : "";
        console.log(
          `[score] job ${job.id}: scored (keyword=${result.keywordScore.toFixed(2)}, ai=${result.aiScore.toFixed(2)}${embeddingPart})`,
        );
      }

      scored += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[score] failed to score job ${job.id}: ${message}`);
    }
  }

  const aiStats = aiScoreProvider.getStats();
  const failureSummary =
    aiStats.failed > 0 ? ` failures=${JSON.stringify(aiStats.failuresByReason)}` : "";
  console.log(
    `[score] scored ${scored}/${jobs.length} job(s) (${skippedBelowGate} below keyword gate, ${hardExcluded} hard-excluded on eligibility, ${aiStats.failed} AI call failures left for retry)`,
  );
  console.log(
    `[score] AI call stats: successful=${aiStats.successful} failed=${aiStats.failed}${failureSummary}`,
  );

  const totalTokens = aiStats.totalTokensInput + aiStats.totalTokensOutput;
  if (totalTokens > 0) {
    const costLine =
      costPer1kTokens != null
        ? ` estimated_cost=$${((totalTokens / 1000) * costPer1kTokens).toFixed(6)}`
        : "";
    console.log(
      `[score] token usage: input=${aiStats.totalTokensInput} output=${aiStats.totalTokensOutput} total=${totalTokens}${costLine}`,
    );
  }

  // Pending-scoring visibility (Phase 1 Task 6): surfaces queue depth and
  // stuck jobs even though this run's own retries already ran above.
  const queue = await getScoringQueueReport({
    scoreRepository,
    roleSelectionId: roleSelection.id,
    resumeVersion: resume.version,
    keywordThreshold,
  });
  console.log(
    `[score] AI-retry queue: ${queue.awaitingAiCount} awaiting, oldest ${
      queue.oldestPendingAgeHours != null ? queue.oldestPendingAgeHours.toFixed(1) + "h" : "n/a"
    }, ${queue.stuckJobs.length} stuck (max retries=${queue.maxRetryCount})`,
  );
  if (queue.stuckJobs.length > 0) {
    console.warn(`[score] stuck job ids: ${queue.stuckJobs.map((j) => j.jobId).join(", ")}`);
  }
}

main().catch((err) => {
  console.error("[score] fatal error:", err);
  process.exit(1);
});
