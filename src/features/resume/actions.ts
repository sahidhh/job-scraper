"use server";

import { revalidatePath } from "next/cache";
import { applyResumeSuggestions } from "@/features/resume/application/applyResumeSuggestions";
import { restoreResumeVersion } from "@/features/resume/application/restoreResumeVersion";
import { suggestResumeImprovements } from "@/features/resume/application/suggestResumeImprovements";
import { uploadResume } from "@/features/resume/application/uploadResume";
import { updateSkills } from "@/features/resume/application/updateSkills";
import type { Resume, ResumeSuggestionSet } from "@/features/resume/domain/types";
import { computeContentHash } from "@/features/resume/infrastructure/contentHash";
import { LlmResumeSuggestionProvider } from "@/features/resume/infrastructure/LlmResumeSuggestionProvider";
import {
  parseResumeFile,
  RESUME_FILE_EXTENSION_BY_MIME_TYPE,
  type SupportedResumeMimeType,
} from "@/features/resume/infrastructure/parseResumeFile";
import { SupabaseResumeRepository } from "@/features/resume/infrastructure/SupabaseResumeRepository";
import { SupabaseResumeSuggestionRepository } from "@/features/resume/infrastructure/SupabaseResumeSuggestionRepository";
import type { ActionResult } from "@/shared/actionResult";
import { SKILLS_DICTIONARY } from "@/shared/config/skills-dictionary";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server";

const RESUME_BUCKET = "resumes";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error.";
}

function isSupportedResumeMimeType(mimeType: string): mimeType is SupportedResumeMimeType {
  return mimeType in RESUME_FILE_EXTENSION_BY_MIME_TYPE;
}

// frontend.md §3 -- stores the file in Supabase Storage under a
// content-hash path (naturally dedupes storage too), parses text via
// pdf-parse/mammoth (skipped entirely on a sha256 cache hit, decisions.md
// AD-30), extracts skills via the dictionary, and activates the new resume
// (set_active_resume RPC, decisions.md AD-09).
export async function uploadResumeAction(formData: FormData): Promise<ActionResult<Resume>> {
  try {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Select a PDF or DOCX resume file to upload." };
    }
    if (!isSupportedResumeMimeType(file.type)) {
      return { ok: false, error: "Only PDF and DOCX files are supported." };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const contentHash = computeContentHash(buffer);

    const client = await createSupabaseServerClient();
    const extension = RESUME_FILE_EXTENSION_BY_MIME_TYPE[file.type];
    const filePath = `${contentHash}.${extension}`;
    const { error: uploadError } = await client.storage.from(RESUME_BUCKET).upload(filePath, buffer, {
      contentType: file.type,
      upsert: true,
    });
    if (uploadError) {
      return { ok: false, error: uploadError.message };
    }

    const resumeRepository = new SupabaseResumeRepository(client);
    const result = await uploadResume(
      { filePath, buffer, mimeType: file.type, contentHash },
      { resumeRepository, skillsDictionary: SKILLS_DICTIONARY, parseText: parseResumeFile },
    );

    revalidatePath("/resume");
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

// frontend.md §3 -- manual skill edits override dictionary extraction.
export async function updateResumeSkillsAction(resumeId: string, skills: string[]): Promise<ActionResult<Resume>> {
  try {
    const client = await createSupabaseServerClient();
    const resumeRepository = new SupabaseResumeRepository(client);

    const result = await updateSkills(resumeId, skills, { resumeRepository });
    revalidatePath("/resume");
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

// Restores an old resume version as the new active version. Never mutates
// the old row in place -- reactivates its content via the same
// set_active_resume path a fresh upload uses (audit finding #1: old
// versions were preserved in Postgres but had no reachable undo path).
export async function restoreResumeVersionAction(resumeId: string): Promise<ActionResult<Resume>> {
  try {
    const client = await createSupabaseServerClient();
    const resumeRepository = new SupabaseResumeRepository(client);

    const result = await restoreResumeVersion(resumeId, { resumeRepository });
    revalidatePath("/resume");
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

// AI resume coaching (decisions.md AD-32/AD-33). Generates suggestions for
// the currently active resume and persists them as a new versioned row --
// this action never mutates the resume itself.
export async function suggestResumeImprovementsAction(targetRole: string): Promise<ActionResult<ResumeSuggestionSet>> {
  try {
    const client = await createSupabaseServerClient();
    const resumeRepository = new SupabaseResumeRepository(client);
    const resume = await resumeRepository.getActive();
    if (!resume) {
      return { ok: false, error: "Upload a resume before requesting suggestions." };
    }

    const repository = new SupabaseResumeSuggestionRepository(client);
    const provider = new LlmResumeSuggestionProvider();

    const result = await suggestResumeImprovements(resume, targetRole, { provider, repository });
    revalidatePath("/resume");
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

// Applies a chosen subset of a stored suggestion set to the active resume,
// creating a NEW resume version -- never overwrites the current one
// (decisions.md AD-33).
export async function applyResumeSuggestionsAction(
  suggestionSetId: string,
  chosenIds: string[],
): Promise<ActionResult<Resume>> {
  try {
    const client = await createSupabaseServerClient();
    const resumeRepository = new SupabaseResumeRepository(client);
    const resume = await resumeRepository.getActive();
    if (!resume) {
      return { ok: false, error: "No active resume to apply suggestions to." };
    }

    const suggestionRepository = new SupabaseResumeSuggestionRepository(client);
    const provider = new LlmResumeSuggestionProvider();

    const result = await applyResumeSuggestions(resume, suggestionSetId, chosenIds, {
      provider,
      suggestionRepository,
      resumeRepository,
      skillsDictionary: SKILLS_DICTIONARY,
    });
    revalidatePath("/resume");
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}
