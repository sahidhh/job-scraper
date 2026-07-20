import type { SettingsRepository } from "@/features/settings/domain/SettingsRepository";
import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import { toAppError } from "@/shared/infrastructure/supabaseError";

const DESIRED_EXPERIENCE_KEY = "desired_experience_years";
const SKIP_UNSPONSORED_FOREIGN_KEY = "skip_unsponsored_foreign_jobs";

export class SupabaseSettingsRepository implements SettingsRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async getDesiredExperienceYears(): Promise<number | null> {
    const { data, error } = await this.client
      .from("app_settings")
      .select("value")
      .eq("key", DESIRED_EXPERIENCE_KEY)
      .maybeSingle();
    if (error) throw toAppError(error);

    const value = data?.value;
    return typeof value === "number" ? value : null;
  }

  async setDesiredExperienceYears(years: number | null): Promise<void> {
    // null clears the setting -- remove the row so "unset" stays distinct
    // from "0 years".
    if (years === null) {
      const { error } = await this.client.from("app_settings").delete().eq("key", DESIRED_EXPERIENCE_KEY);
      if (error) throw toAppError(error);
      return;
    }

    const { error } = await this.client
      .from("app_settings")
      .upsert({ key: DESIRED_EXPERIENCE_KEY, value: years, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw toAppError(error);
  }

  async getSkipUnsponsoredForeignJobs(): Promise<boolean> {
    const { data, error } = await this.client
      .from("app_settings")
      .select("value")
      .eq("key", SKIP_UNSPONSORED_FOREIGN_KEY)
      .maybeSingle();
    if (error) throw toAppError(error);

    // Unlike desired_experience_years there's no meaningful "unset" state to
    // preserve -- a missing row and an explicit false both mean "don't skip".
    return data?.value === true;
  }

  async setSkipUnsponsoredForeignJobs(enabled: boolean): Promise<void> {
    const { error } = await this.client
      .from("app_settings")
      .upsert(
        { key: SKIP_UNSPONSORED_FOREIGN_KEY, value: enabled, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    if (error) throw toAppError(error);
  }
}
