"use server";

import { revalidatePath } from "next/cache";
import { validateRankingPreferences } from "@/features/scoring/domain/validation";
import type { RankingPreferences } from "@/features/scoring/domain/types";
import { SupabaseRankingPreferencesRepository } from "@/features/scoring/infrastructure/SupabaseRankingPreferencesRepository";
import type { ActionResult } from "@/shared/actionResult";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error.";
}

export async function getRankingPreferencesAction(): Promise<ActionResult<RankingPreferences | null>> {
  try {
    const client = await createSupabaseServerClient();
    const repo = new SupabaseRankingPreferencesRepository(client);
    const prefs = await repo.getPreferences();
    return { ok: true, data: prefs };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function setRankingPreferencesAction(
  prefs: RankingPreferences | null,
): Promise<ActionResult> {
  try {
    if (prefs !== null) validateRankingPreferences(prefs);
    const client = await createSupabaseServerClient();
    const repo = new SupabaseRankingPreferencesRepository(client);
    await repo.setPreferences(prefs);
    revalidatePath("/settings");
    revalidatePath("/dashboard");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}
