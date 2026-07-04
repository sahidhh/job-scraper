import { assertUnitInterval } from "@/shared/domain/validation";
import { JOB_SOURCES, LOCATION_TAGS } from "@/shared/domain/enums";
import type { NotificationPreferences } from "./types";

export function validateNotifyThreshold(threshold: number): void {
  assertUnitInterval(threshold, "NOTIFY_THRESHOLD");
}

// Throws a descriptive error on the first invalid field so the settings UI
// can surface a specific message instead of silently no-op-ing on typos.
export function validateNotificationPreferences(prefs: NotificationPreferences): void {
  if (prefs.locations) {
    for (const location of prefs.locations) {
      if (!LOCATION_TAGS.includes(location)) {
        throw new Error(`Unknown location "${location}". Valid: ${LOCATION_TAGS.join(", ")}.`);
      }
    }
  }
  if (prefs.sources) {
    for (const source of prefs.sources) {
      if (!JOB_SOURCES.includes(source)) {
        throw new Error(`Unknown source "${source}". Valid: ${JOB_SOURCES.join(", ")}.`);
      }
    }
  }
  if (prefs.minExperience !== undefined && prefs.minExperience < 0) {
    throw new Error("Minimum experience must be >= 0.");
  }
  if (prefs.maxExperience !== undefined && prefs.maxExperience < 0) {
    throw new Error("Maximum experience must be >= 0.");
  }
  if (
    prefs.minExperience !== undefined &&
    prefs.maxExperience !== undefined &&
    prefs.minExperience > prefs.maxExperience
  ) {
    throw new Error("Minimum experience cannot exceed maximum experience.");
  }
}
