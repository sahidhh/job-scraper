import type { NotificationPreferencesRepository } from "@/features/notifications/domain/NotificationPreferencesRepository";
import type { NotificationPreferences } from "@/features/notifications/domain/types";
import type { Json } from "../../../../supabase/database.types";
import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import { toAppError } from "@/shared/infrastructure/supabaseError";

const NOTIFICATION_PREFERENCES_KEY = "notification_preferences";

// Stores NotificationPreferences as a JSON value in the app_settings table
// (repositories.md §6). A missing row is equivalent to no preferences
// (notify all), so there is no default row to seed.
export class SupabaseNotificationPreferencesRepository implements NotificationPreferencesRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async getPreferences(): Promise<NotificationPreferences | null> {
    const { data, error } = await this.client
      .from("app_settings")
      .select("value")
      .eq("key", NOTIFICATION_PREFERENCES_KEY)
      .maybeSingle();
    if (error) throw toAppError(error);
    if (!data) return null;

    const value = data.value;
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    return value as unknown as NotificationPreferences;
  }

  async setPreferences(prefs: NotificationPreferences | null): Promise<void> {
    if (prefs === null) {
      const { error } = await this.client
        .from("app_settings")
        .delete()
        .eq("key", NOTIFICATION_PREFERENCES_KEY);
      if (error) throw toAppError(error);
      return;
    }

    const { error } = await this.client
      .from("app_settings")
      .upsert(
        { key: NOTIFICATION_PREFERENCES_KEY, value: prefs as unknown as Json, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    if (error) throw toAppError(error);
  }
}
