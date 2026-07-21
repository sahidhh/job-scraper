import { describe, expect, it, vi } from "vitest";
import type { ScoreRepository } from "@/features/scoring/domain/ScoreRepository";
import { getScoringQueueReport } from "./getScoringQueueReport";

describe("getScoringQueueReport", () => {
  it("queries the AI-retry queue for the given role/resume/threshold and summarizes it", async () => {
    const scoreRepository: ScoreRepository = {
      insertScore: vi.fn(),
      hasScore: vi.fn(),
      deleteScores: vi.fn(),
      findAwaitingAi: vi.fn().mockResolvedValue([{ jobId: "job-1", scoredAt: "2026-01-01T00:00:00Z", retryCount: 2 }]),
    };

    const result = await getScoringQueueReport({
      scoreRepository,
      roleSelectionId: "role-1",
      resumeVersion: 1,
      keywordThreshold: 0.25,
    });

    expect(scoreRepository.findAwaitingAi).toHaveBeenCalledWith("role-1", 1, 0.25);
    expect(result.awaitingAiCount).toBe(1);
    expect(result.maxRetryCount).toBe(2);
  });

  it("honors a custom stuck threshold", async () => {
    const scoreRepository: ScoreRepository = {
      insertScore: vi.fn(),
      hasScore: vi.fn(),
      deleteScores: vi.fn(),
      findAwaitingAi: vi.fn().mockResolvedValue([
        { jobId: "job-1", scoredAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), retryCount: 1 },
      ]),
    };

    const result = await getScoringQueueReport({
      scoreRepository,
      roleSelectionId: "role-1",
      resumeVersion: 1,
      keywordThreshold: 0.25,
      stuckThresholdHours: 1,
    });

    expect(result.stuckJobs).toHaveLength(1);
  });
});
