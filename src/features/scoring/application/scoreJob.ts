import type { Job } from "@/features/jobs/domain/types";
import type { Resume } from "@/features/resume/domain/types";
import type { AiScoreProvider } from "@/features/scoring/domain/AiScoreProvider";
import type { EmbeddingScoreProvider } from "@/features/scoring/domain/EmbeddingScoreProvider";
import type { ScoreRepository } from "@/features/scoring/domain/ScoreRepository";
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
 * Two-stage scoring for one job against the active resume (scoring.md
 * §2-3, decisions.md AD-07). Stage 1 (keyword overlap) always runs and is
 * free. Stage 2 (AI refinement, plus the local embedding-similarity signal
 * from AD-31 when a provider is supplied) runs only if keywordScore clears
 * keywordThreshold; a null result from either provider (failed call) leaves
 * the corresponding field null without retrying.
 */
export async function scoreJob(
  job: Job,
  resume: Resume,
  roleSelectionId: string,
  deps: ScoreJobDeps,
): Promise<NewJobScore> {
  const jobSkills = extractSkills(`${job.title}\n${job.description}`, deps.skillsDictionary);
  const keywordScore = computeKeywordScore(resume.skills, jobSkills);

  let aiScore: number | null = null;
  let aiReasoning: string | null = null;
  let model: string | null = null;

  let tokensInput: number | null = null;
  let tokensOutput: number | null = null;
  let estimatedCostUsd: number | null = null;

  let embeddingScore: number | null = null;

  if (keywordScore >= deps.keywordThreshold) {
    const result = await deps.aiScoreProvider.score({ job, resume });
    if (result) {
      aiScore = result.score;
      aiReasoning = result.reasoning;
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
