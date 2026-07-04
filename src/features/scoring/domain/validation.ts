import { assertUnitInterval } from "@/shared/domain/validation";
import type { NewJobScore, RankingPreferences } from "./types";

export function validateNewJobScore(score: NewJobScore): void {
  assertUnitInterval(score.keywordScore, "keywordScore");

  if (score.aiScore !== undefined && score.aiScore !== null) {
    assertUnitInterval(score.aiScore, "aiScore");
  }
}

// Throws a descriptive error on the first invalid field so the settings UI
// can surface a specific message rather than silently no-op-ing.
export function validateRankingPreferences(prefs: RankingPreferences): void {
  for (const [label, value] of [
    ["companyBonus", prefs.companyBonus],
    ["remoteBonus", prefs.remoteBonus],
    ["salaryBonus", prefs.salaryBonus],
  ] as const) {
    if (value !== undefined && (value < 0 || value > 1 || Number.isNaN(value))) {
      throw new Error(`${label} must be between 0 and 1, got ${value}.`);
    }
  }
}
