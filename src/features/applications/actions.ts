"use server";

import { revalidatePath } from "next/cache";
import { draftApplication } from "@/features/applications/application/draftApplication";
import { markApplicationDismissed } from "@/features/applications/application/markApplicationDismissed";
import { markApplicationSent } from "@/features/applications/application/markApplicationSent";
import { updateApplicationContent } from "@/features/applications/application/updateApplicationContent";
import type { Application, ApplicationKind } from "@/features/applications/domain/types";
import { LlmApplicationDraftProvider } from "@/features/applications/infrastructure/LlmApplicationDraftProvider";
import { SupabaseApplicationRepository } from "@/features/applications/infrastructure/SupabaseApplicationRepository";
import { SupabaseJobRepository } from "@/features/jobs/infrastructure/SupabaseJobRepository";
import { SupabaseResumeRepository } from "@/features/resume/infrastructure/SupabaseResumeRepository";
import type { ActionResult } from "@/shared/actionResult";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error.";
}

// Generates (or redrafts) a tailored application for one job against the
// active resume (frontend.md's draft-review-send flow, decisions.md AD-34).
// Never sends anything -- the user reviews via updateApplicationContentAction
// then opens the mailto: link themselves (markApplicationSentAction).
export async function draftApplicationAction(jobId: string, kind: ApplicationKind = "email"): Promise<ActionResult<Application>> {
  try {
    const client = await createSupabaseServerClient();
    const jobRepository = new SupabaseJobRepository(client);
    const resumeRepository = new SupabaseResumeRepository(client);
    const applicationRepository = new SupabaseApplicationRepository(client);

    const resume = await resumeRepository.getActive();
    if (!resume) {
      return { ok: false, error: "Upload a resume before drafting an application." };
    }

    const job = await jobRepository.getById(jobId);
    if (!job) {
      return { ok: false, error: "Job not found." };
    }

    const provider = new LlmApplicationDraftProvider();
    const result = await draftApplication(job, resume, kind, { provider, repository: applicationRepository });

    revalidatePath("/dashboard");
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

// Fetches the existing (job, kind) application, if any -- lets the review UI
// show a prior draft/sent/dismissed application without regenerating it.
export async function getApplicationForJobAction(jobId: string, kind: ApplicationKind = "email"): Promise<ActionResult<Application | null>> {
  try {
    const client = await createSupabaseServerClient();
    const applicationRepository = new SupabaseApplicationRepository(client);

    const result = await applicationRepository.findByJobAndKind(jobId, kind);
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

// User edits during review, before sending.
export async function updateApplicationContentAction(id: string, subject: string, body: string): Promise<ActionResult<Application>> {
  try {
    const client = await createSupabaseServerClient();
    const applicationRepository = new SupabaseApplicationRepository(client);

    const result = await updateApplicationContent(id, subject, body, { repository: applicationRepository });
    revalidatePath("/dashboard");
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

// Called once the user has opened the mailto: link and sent the message
// themselves -- records status only, never sends anything server-side.
export async function markApplicationSentAction(id: string): Promise<ActionResult<Application>> {
  try {
    const client = await createSupabaseServerClient();
    const applicationRepository = new SupabaseApplicationRepository(client);

    const result = await markApplicationSent(id, { repository: applicationRepository });
    revalidatePath("/dashboard");
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function markApplicationDismissedAction(id: string): Promise<ActionResult<Application>> {
  try {
    const client = await createSupabaseServerClient();
    const applicationRepository = new SupabaseApplicationRepository(client);

    const result = await markApplicationDismissed(id, { repository: applicationRepository });
    revalidatePath("/dashboard");
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}
