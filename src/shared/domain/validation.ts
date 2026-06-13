import { DomainValidationError } from "./errors";

// Shared by job_scores (keyword_score/ai_score) and scoring thresholds
// (KEYWORD_THRESHOLD/NOTIFY_THRESHOLD) -- all are values in [0, 1].
export function assertUnitInterval(value: number, label: string): void {
  if (Number.isNaN(value) || value < 0 || value > 1) {
    throw new DomainValidationError(`${label} must be between 0 and 1, got ${value}`);
  }
}

export function assertNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new DomainValidationError(`${label} must not be empty`);
  }
}
