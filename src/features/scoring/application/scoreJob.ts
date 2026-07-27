import type { Job } from "@/features/jobs/domain/types";
import type { Resume } from "@/features/resume/domain/types";
import type { AiScoreProvider } from "@/features/scoring/domain/AiScoreProvider";
import type { EmbeddingScoreProvider } from "@/features/scoring/domain/EmbeddingScoreProvider";
import type { ScoreRepository } from "@/features/scoring/domain/ScoreRepository";
import { capAiScoreForEligibility } from "@/features/scoring/domain/capAiScore";
import type { EligibilityResult } from "@/features/scoring/domain/classifyEligibility";
import { INELIGIBLE_REASON_LABELS, classifyEligibility } from "@/features/scoring/domain/classifyEligibility";
import type { NewJobScore, RankingPreferences } from "@/features/scoring/domain/types";
import { validateNewJobScore } from "@/features/scoring/domain/validation";
import { extractSkills, type SkillDictionaryEntry } from "@/shared/domain/skills";
import { computeKeywordScore } from "./computeKeywordScore";
import { computeOverallScore } from "./computeOverallScore";

export interface ScoreJobDeps {
  scoreRepository: ScoreRepository;
  aiScoreProvider: AiScoreProvider;
  /** Local, offline stage-2 semantic signal (AD-31); omit to skip it entirely. */
  embeddingScoreProvider?: EmbeddingScoreProvider;
  skillsDictionary: readonly SkillDictionaryEntry[];
  keywordThreshold: number;
  costPer1kTokens?: number | null;
  /** Composite-ranking-score bonuses (Theme 1); absent/empty = aiScore-only ranking. */
  rankingPreferences?: RankingPreferences;
}

/**
 * The stored ingest-time verdict (jobs.ineligible_reason, AD-51) is
 * authoritative when present; classifyEligibility is only recomputed for jobs
 * that predate the column and haven't been through
 * `npm run backfill:eligibility` yet. Keeping the fallback also lets scoreJob
 * stay unit-testable from a plain Job fixture with no DB round trip.
 */
function resolveEligibility(job: Job): EligibilityResult {
  if (job.ineligibleReason !== null) {
    return {
      eligible: false,
      code: job.ineligibleReason,
      reason: INELIGIBLE_REASON_LABELS[job.ineligibleReason],
    };
  }
  return classifyEligibility(job);
}

/**
 * Two-stage scoring for one job against the active resume (scoring.md
 * §2-3, decisions.md AD-07). Stage 1 (keyword overlap) always runs and is
 * free. Stage 2 (AI refinement, plus the local embedding-similarity signal
 * from AD-31 when a provider is supplied) runs only if keywordScore clears
 * keywordThreshold AND the job passes the hard eligibility pre-filter
 * (classifyEligibility.ts -- geo-locked-remote / sponsorship-refusing-
 * onsite postings can never actually be applied to, so they skip stage 2
 * regardless of skill overlap); a null result from either provider (failed
 * call) leaves the corresponding field null without retrying.
 */
export async function scoreJob(
  job: Job,
  resume: Resume,
  roleSelectionId: string,
  deps: ScoreJobDeps,
): Promise<NewJobScore> {
  const jobSkills = extractSkills(`${job.title}\n${job.description}`, deps.skillsDictionary);
  const keywordScore = computeKeywordScore(resume.skills, jobSkills);
  const eligibility = resolveEligibility(job);

  let aiScore: number | null = null;
  let aiReasoning: string | null = null;
  let model: string | null = null;

  let tokensInput: number | null = null;
  let tokensOutput: number | null = null;
  let estimatedCostUsd: number | null = null;

  let embeddingScore: number | null = null;

  if (keywordScore >= deps.keywordThreshold && eligibility.eligible) {
    const result = await deps.aiScoreProvider.score({ job, resume });
    if (result) {
      // AD-53: the model won't reliably translate "unconfirmed sponsorship"
      // into a low number, so cap it deterministically here (onsite Singapore/
      // UAE without confirmed sponsorship -> at most the ceiling). The cap
      // reason is appended so the stored reasoning explains the number.
      const capped = capAiScoreForEligibility(job, result.score, result.sponsorshipConfirmed);
      aiScore = capped.score;
      aiReasoning = capped.capReason ? `${result.reasoning} ${capped.capReason}` : result.reasoning;
      model = result.model;
      tokensInput = result.tokensInput;
      tokensOutput = result.tokensOutput;
      if (deps.costPer1kTokens != null && tokensInput != null && tokensOutput != null) {
        estimatedCostUsd = ((tokensInput + tokensOutput) / 1000) * deps.costPer1kTokens;
      }
    }

    if (deps.embeddingScoreProvider) {
      embeddingScore = await deps.embeddingScoreProvider.score({ job, resume });
    }
  }

  let overallScore: number | null = null;
  let overallScoreReasons: string[] | null = null;
  if (aiScore !== null) {
    const result = computeOverallScore(job, aiScore, deps.rankingPreferences ?? {});
    overallScore = result.overallScore;
    overallScoreReasons = result.reasons;
  }

  const score: NewJobScore = {
    jobId: job.id,
    roleSelectionId,
    resumeVersion: resume.version,
    keywordScore,
    aiScore,
    aiReasoning,
    model,
    tokensInput,
    tokensOutput,
    estimatedCostUsd,
    embeddingScore,
    overallScore,
    overallScoreReasons,
  };

  validateNewJobScore(score);
  await deps.scoreRepository.insertScore(score);

  return score;
}
