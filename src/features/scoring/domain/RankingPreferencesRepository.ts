import type { RankingPreferences } from "./types";

export interface RankingPreferencesRepository {
  /** Returns the stored preferences, or null if none have been saved yet (all defaults apply). */
  getPreferences(): Promise<RankingPreferences | null>;

  /** Persists preferences. Passing null clears them (reverts to aiScore-only ranking). */
  setPreferences(prefs: RankingPreferences | null): Promise<void>;
}
