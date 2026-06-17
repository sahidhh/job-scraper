"use server";

import { revalidatePath } from "next/cache";
import { setJobStatus } from "@/features/jobs/application/setJobStatus";
import { SupabaseJobRepository } from "@/features/jobs/infrastructure/SupabaseJobRepository";
import type { ActionResult } from "@/shared/actionResult";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error.";
}

// frontend.md §3 -- assign a status to one job (per-row dropdown) or many
// jobs at once (bulk-select action bar). Composition root: instantiates the
// repository and calls the same use-case the rest of the app uses.
export async function setJobStatusAction(jobIds: string[], statusId: string): Promise<ActionResult> {
  try {
    const client = await createSupabaseServerClient();
    const jobRepository = new SupabaseJobRepository(client);
    await setJobStatus(jobIds, statusId, { jobRepository });

    revalidatePath("/dashboard");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}
