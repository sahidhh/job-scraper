"use server";

import { revalidatePath } from "next/cache";
import { createStatus } from "@/features/jobs/application/createStatus";
import { deleteStatus } from "@/features/jobs/application/deleteStatus";
import { setJobStatus } from "@/features/jobs/application/setJobStatus";
import { updateStatus } from "@/features/jobs/application/updateStatus";
import { SupabaseJobRepository } from "@/features/jobs/infrastructure/SupabaseJobRepository";
import type { CreateStatusInput, JobStatus, UpdateStatusInput } from "@/features/jobs/domain/types";
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

export async function createStatusAction(input: CreateStatusInput): Promise<ActionResult<JobStatus>> {
  try {
    const client = await createSupabaseServerClient();
    const jobRepository = new SupabaseJobRepository(client);
    const status = await createStatus(input, { jobRepository });

    revalidatePath("/settings");
    revalidatePath("/dashboard");
    return { ok: true, data: status };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function updateStatusAction(
  id: string,
  input: UpdateStatusInput,
): Promise<ActionResult<JobStatus>> {
  try {
    const client = await createSupabaseServerClient();
    const jobRepository = new SupabaseJobRepository(client);
    const status = await updateStatus(id, input, { jobRepository });

    revalidatePath("/settings");
    revalidatePath("/dashboard");
    return { ok: true, data: status };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function deleteStatusAction(id: string): Promise<ActionResult> {
  try {
    const client = await createSupabaseServerClient();
    const jobRepository = new SupabaseJobRepository(client);
    await deleteStatus(id, { jobRepository });

    revalidatePath("/settings");
    revalidatePath("/dashboard");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}
