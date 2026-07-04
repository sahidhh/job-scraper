import type { RankingPreferencesRepository } from "@/features/scoring/domain/RankingPreferencesRepository";
import type { RankingPreferences } from "@/features/scoring/domain/types";
import type { Json } from "../../../../supabase/database.types";
import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import { toAppError } from "@/shared/infrastructure/supabaseError";

const RANKING_PREFERENCES_KEY = "ranking_preferences";

// Stores RankingPreferences as a JSON value in the app_settings table, same
// pattern as SupabaseNotificationPreferencesRepository. A missing row means
// no preferences saved -- overallScore reduces to aiScore plus zero bonuses.
export class SupabaseRankingPreferencesRepository implements RankingPreferencesRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async getPreferences(): Promise<RankingPreferences | null> {
    const { data, error } = await this.client
      .from("app_settings")
      .select("value")
      .eq("key", RANKING_PREFERENCES_KEY)
      .maybeSingle();
    if (error) throw toAppError(error);
    if (!data) return null;

    const value = data.value;
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    return value as unknown as RankingPreferences;
  }

  async setPreferences(prefs: RankingPreferences | null): Promise<void> {
    if (prefs === null) {
      const { error } = await this.client
        .from("app_settings")
        .delete()
        .eq("key", RANKING_PREFERENCES_KEY);
      if (error) throw toAppError(error);
      return;
    }

    const { error } = await this.client
      .from("app_settings")
      .upsert(
        { key: RANKING_PREFERENCES_KEY, value: prefs as unknown as Json, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    if (error) throw toAppError(error);
  }
}
