"use server";

import { revalidatePath } from "next/cache";
import type { NotificationPreferences } from "@/features/notifications/domain/types";
import { validateNotificationPreferences } from "@/features/notifications/domain/validation";
import { SupabaseNotificationPreferencesRepository } from "@/features/notifications/infrastructure/SupabaseNotificationPreferencesRepository";
import type { ActionResult } from "@/shared/actionResult";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error.";
}

export async function getNotificationPreferencesAction(): Promise<ActionResult<NotificationPreferences | null>> {
  try {
    const client = await createSupabaseServerClient();
    const repo = new SupabaseNotificationPreferencesRepository(client);
    const prefs = await repo.getPreferences();
    return { ok: true, data: prefs };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function setNotificationPreferencesAction(
  prefs: NotificationPreferences | null,
): Promise<ActionResult> {
  try {
    if (prefs !== null) validateNotificationPreferences(prefs);
    const client = await createSupabaseServerClient();
    const repo = new SupabaseNotificationPreferencesRepository(client);
    await repo.setPreferences(prefs);
    revalidatePath("/settings/notifications");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}
