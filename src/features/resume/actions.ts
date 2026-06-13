"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { uploadResume } from "@/features/resume/application/uploadResume";
import { updateSkills } from "@/features/resume/application/updateSkills";
import type { Resume } from "@/features/resume/domain/types";
import { parsePdf } from "@/features/resume/infrastructure/parsePdf";
import { SupabaseResumeRepository } from "@/features/resume/infrastructure/SupabaseResumeRepository";
import type { ActionResult } from "@/shared/actionResult";
import { SKILLS_DICTIONARY } from "@/shared/config/skills-dictionary";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server";

const RESUME_BUCKET = "resumes";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error.";
}

// frontend.md §3 -- stores the PDF in Supabase Storage, parses text via
// pdf-parse, extracts skills via the dictionary, and activates the new
// resume (set_active_resume RPC, decisions.md AD-09).
export async function uploadResumeAction(formData: FormData): Promise<ActionResult<Resume>> {
  try {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Select a PDF file to upload." };
    }
    if (file.type !== "application/pdf") {
      return { ok: false, error: "Only PDF files are supported." };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsedText = await parsePdf(buffer);

    const client = await createSupabaseServerClient();
    const filePath = `${Date.now()}-${randomUUID()}.pdf`;
    const { error: uploadError } = await client.storage.from(RESUME_BUCKET).upload(filePath, buffer, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (uploadError) {
      return { ok: false, error: uploadError.message };
    }

    const resumeRepository = new SupabaseResumeRepository(client);
    const result = await uploadResume(
      { filePath, parsedText },
      { resumeRepository, skillsDictionary: SKILLS_DICTIONARY },
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
