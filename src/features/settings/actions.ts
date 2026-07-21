"use server";

import { revalidatePath } from "next/cache";
import { setDesiredExperience } from "@/features/settings/application/setDesiredExperience";
import { setSkipUnsponsoredForeignJobs } from "@/features/settings/application/setSkipUnsponsoredForeignJobs";
import { SupabaseSettingsRepository } from "@/features/settings/infrastructure/SupabaseSettingsRepository";
import type { ActionResult } from "@/shared/actionResult";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error.";
}

// frontend.md §3 -- persist the desired max years of experience used by the
// dashboard's soft filter (P2). null clears it.
export async function setDesiredExperienceAction(years: number | null): Promise<ActionResult> {
  try {
    const client = await createSupabaseServerClient();
    const settingsRepository = new SupabaseSettingsRepository(client);
    await setDesiredExperience(years, { settingsRepository });

    revalidatePath("/settings");
    revalidatePath("/dashboard");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

// AD-51 -- when on, the next scrape run discards foreign onsite/hybrid
// postings that explicitly refuse visa sponsorship instead of storing them.
// Affects ingest only, so nothing already in the DB changes; /dashboard is
// still revalidated so the settings round-trip feels immediate.
export async function setSkipUnsponsoredForeignJobsAction(enabled: boolean): Promise<ActionResult> {
  try {
    const client = await createSupabaseServerClient();
    const settingsRepository = new SupabaseSettingsRepository(client);
    await setSkipUnsponsoredForeignJobs(enabled, { settingsRepository });

    revalidatePath("/settings");
    revalidatePath("/dashboard");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}
