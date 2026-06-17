import { DomainValidationError } from "@/shared/domain/errors";

// Desired experience is a soft filter input: null clears it; otherwise a
// whole number of years in a sane range. Matches the parse clamp intent in
// jobs/application/parseMinYears (0..20) but allows a little headroom.
export function validateExperienceYears(years: number | null): void {
  if (years === null) return;
  if (!Number.isInteger(years) || years < 0 || years > 50) {
    throw new DomainValidationError(`desired experience years must be an integer in 0..50, got ${years}`);
  }
}
