import { EMPLOYMENT_TYPES } from "@/features/jobs/domain/extractJobAttributes";
import { JOB_SOURCES, LOCATION_TAGS } from "@/shared/domain/enums";
import { DomainValidationError } from "@/shared/domain/errors";
import { assertUnitInterval } from "@/shared/domain/validation";
import type { NotificationPreferences } from "./types";

export function validateNotifyThreshold(threshold: number): void {
  assertUnitInterval(threshold, "NOTIFY_THRESHOLD");
}

// Guards the /settings UI's write path (setNotificationPreferencesAction) --
// enum-valued array fields must only contain real values, and the
// experience range must be internally consistent. Free-text fields
// (roles/skills/blockedCompanies) are intentionally unrestricted.
export function validateNotificationPreferences(prefs: NotificationPreferences): void {
  if (prefs.locations) {
    for (const loc of prefs.locations) {
      if (!LOCATION_TAGS.includes(loc)) {
        throw new DomainValidationError(`invalid location "${loc}" in notification preferences`);
      }
    }
  }

  if (prefs.sources) {
    for (const source of prefs.sources) {
      if (!JOB_SOURCES.includes(source)) {
        throw new DomainValidationError(`invalid source "${source}" in notification preferences`);
      }
    }
  }

  if (prefs.excludeEmploymentTypes) {
    for (const type of prefs.excludeEmploymentTypes) {
      if (!EMPLOYMENT_TYPES.includes(type)) {
        throw new DomainValidationError(`invalid employment type "${type}" in notification preferences`);
      }
    }
  }

  if (prefs.minExperience !== undefined && prefs.minExperience < 0) {
    throw new DomainValidationError("minExperience must be >= 0");
  }
  if (prefs.maxExperience !== undefined && prefs.maxExperience < 0) {
    throw new DomainValidationError("maxExperience must be >= 0");
  }
  if (
    prefs.minExperience !== undefined &&
    prefs.maxExperience !== undefined &&
    prefs.minExperience > prefs.maxExperience
  ) {
    throw new DomainValidationError("minExperience must be <= maxExperience");
  }
}
