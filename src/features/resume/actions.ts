"use server";

import { revalidatePath } from "next/cache";
import { uploadResume } from "@/features/resume/application/uploadResume";
import { updateSkills } from "@/features/resume/application/updateSkills";
import type { Resume } from "@/features/resume/domain/types";
import { computeContentHash } from "@/features/resume/infrastructure/contentHash";
import {
  parseResumeFile,
  RESUME_FILE_EXTENSION_BY_MIME_TYPE,
  type SupportedResumeMimeType,
} from "@/features/resume/infrastructure/parseResumeFile";
import { SupabaseResumeRepository } from "@/features/resume/infrastructure/SupabaseResumeRepository";
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
