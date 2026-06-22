import type { Job } from "@/features/jobs/domain/types";
import type { Resume } from "@/features/resume/domain/types";
import type { AiScoreProvider } from "@/features/scoring/domain/AiScoreProvider";
import type { ScoreRepository } from "@/features/scoring/domain/ScoreRepository";
import type { NewJobScore } from "@/features/scoring/domain/types";
import { validateNewJobScore } from "@/features/scoring/domain/validation";
import { extractSkills, type SkillDictionaryEntry } from "@/shared/domain/skills";
import { computeKeywordScore } from "./computeKeywordScore";

export interface ScoreJobDeps {
  scoreRepository: ScoreRepository;
  aiScoreProvider: AiScoreProvider;
  skillsDictionary: readonly SkillDictionaryEntry[];
  keywordThreshold: number;
  costPer1kTokens?: number | null;
}

/**
 * Two-stage scoring for one job against the active resume (scoring.md
 * §2-3, decisions.md AD-07). Stage 1 (keyword overlap) always runs and is
 * free. Stage 2 (AI refinement) runs only if keywordScore clears
 * keywordThreshold; a null result from the provider (failed call) leaves
 * aiScore/aiReasoning null without retrying.
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
  };

  validateNewJobScore(score);
  await deps.scoreRepository.insertScore(score);

  return score;
}
