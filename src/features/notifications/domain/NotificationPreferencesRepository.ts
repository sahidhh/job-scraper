import type { NotificationPreferences } from "./types";

export interface NotificationPreferencesRepository {
  /** Returns the stored preferences, or null if none have been saved yet. */
  getPreferences(): Promise<NotificationPreferences | null>;

  /** Persists preferences. Passing null clears them (reverts to default: notify all). */
  setPreferences(prefs: NotificationPreferences | null): Promise<void>;
}
