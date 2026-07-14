import type { ApplicationDraftProvider } from "@/features/applications/domain/ApplicationDraftProvider";
import type { ApplicationRepository } from "@/features/applications/domain/ApplicationRepository";
import type { Application, ApplicationKind } from "@/features/applications/domain/types";
import type { Job } from "@/features/jobs/domain/types";
import type { Resume } from "@/features/resume/domain/types";
import { truncateText } from "@/shared/infrastructure/text";

// jobhunt/apply.py's draft() caps job description at 4000 chars and resume
// text at 8000 chars in its prompt context -- carried over as-is (AD-23
// precedent: prompt-cost caps are a deliberate, documented choice in this
// codebase, not a bug). Unlike resume suggestions (AD-33, bug #2), a single
// application draft is one coherent LLM call for one job, not a
// merge-across-chunks operation -- chunking doesn't apply here.
export const MAX_DESCRIPTION_PROMPT_CHARS = 4000;
export const MAX_RESUME_PROMPT_CHARS = 8000;

export interface DraftApplicationDeps {
  provider: ApplicationDraftProvider;
  repository: ApplicationRepository;
}

// Drafts (or redrafts) an application for one job against the active
// resume. Redrafting overwrites an existing 'draft'/'dismissed' row for the
// same (job, kind) in place; a 'sent' row is a terminal record and cannot be
// redrafted (scope.md's "user always reviews and applies manually" --
// silently rewriting a message the user may have already sent would defeat
// that review step).
export async function draftApplication(
  job: Job,
  resume: Resume,
  kind: ApplicationKind,
  deps: DraftApplicationDeps,
): Promise<Application> {
  const existing = await deps.repository.findByJobAndKind(job.id, kind);
  if (existing?.status === "sent") {
    throw new Error("This application has already been sent and cannot be redrafted.");
  }

  const result = await deps.provider.draft({
    kind,
    jobTitle: job.title,
    companyName: job.companyName,
    locationRaw: job.locationRaw,
    description: truncateText(job.description, MAX_DESCRIPTION_PROMPT_CHARS),
    resumeText: truncateText(resume.parsedText, MAX_RESUME_PROMPT_CHARS),
  });

  return deps.repository.upsertDraft({
    jobId: job.id,
    resumeId: resume.id,
    kind,
    subject: result.subject,
    body: result.body,
    recipientEmail: job.contactEmail,
    model: result.model,
  });
}
