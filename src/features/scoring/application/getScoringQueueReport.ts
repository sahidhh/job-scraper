import type { ScoreRepository } from "@/features/scoring/domain/ScoreRepository";
import { SCORING_QUEUE_CONFIG } from "@/features/scoring/domain/scoringQueueConfig";
import { computeScoringQueueSummary, type ScoringQueueSummary } from "./computeScoringQueueSummary";

export interface GetScoringQueueReportDeps {
  scoreRepository: ScoreRepository;
  roleSelectionId: string;
  resumeVersion: number;
  keywordThreshold: number;
  stuckThresholdHours?: number;
}

/**
 * Pending-scoring visibility for the active role/resume (Phase 1 Task 6):
 * how many jobs are waiting on an AI score, how long the oldest has waited,
 * which ones are stuck past the configured threshold, and retry-count
 * stats. Backend-only for this phase -- no dashboard UI wired yet.
 */
export async function getScoringQueueReport(deps: GetScoringQueueReportDeps): Promise<ScoringQueueSummary> {
  const awaiting = await deps.scoreRepository.findAwaitingAi(deps.roleSelectionId, deps.resumeVersion, deps.keywordThreshold);
  return computeScoringQueueSummary(awaiting, deps.stuckThresholdHours ?? SCORING_QUEUE_CONFIG.stuckThresholdHours);
}
