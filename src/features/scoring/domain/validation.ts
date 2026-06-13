import { assertUnitInterval } from "@/shared/domain/validation";
import type { NewJobScore } from "./types";

export function validateNewJobScore(score: NewJobScore): void {
  assertUnitInterval(score.keywordScore, "keywordScore");

  if (score.aiScore !== undefined && score.aiScore !== null) {
    assertUnitInterval(score.aiScore, "aiScore");
  }
}
