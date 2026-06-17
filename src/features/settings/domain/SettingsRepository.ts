// Editable, user-facing app settings (P2) -- distinct from the read-only env
// thresholds (KEYWORD_THRESHOLD/NOTIFY_THRESHOLD). Backed by the app_settings
// key/value table. Kept narrow to the one setting in use; add methods per
// setting rather than a stringly-typed generic get/set.
export interface SettingsRepository {
  /** Desired max years of experience for the dashboard filter, or null if unset. */
  getDesiredExperienceYears(): Promise<number | null>;
  setDesiredExperienceYears(years: number | null): Promise<void>;
}
