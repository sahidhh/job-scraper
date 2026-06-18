import type { ResumeRepository } from "@/features/resume/domain/ResumeRepository";
import type { NewResume, Resume } from "@/features/resume/domain/types";
import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import type { Database } from "../../../../supabase/database.types";

type ResumeRow = Database["public"]["Tables"]["resumes"]["Row"];

function toResume(row: ResumeRow): Resume {
  return {
    id: row.id,
    filePath: row.file_path,
    parsedText: row.parsed_text,
    skills: row.skills,
    uploadedAt: row.uploaded_at,
    isActive: row.is_active,
    version: row.version,
  };
}

// repositories.md §3.
export class SupabaseResumeRepository implements ResumeRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async getActive(): Promise<Resume | null> {
    const { data, error } = await this.client.from("resumes").select("*").eq("is_active", true).maybeSingle();

    if (error) throw error;
    return data ? toResume(data) : null;
  }

  // Atomic deactivate-previous + insert-new via set_active_resume RPC
  // (decisions.md AD-09).
  async create(input: NewResume): Promise<Resume> {
    const { data, error } = await this.client.rpc("set_active_resume", {
      p_file_path: input.filePath,
      p_parsed_text: input.parsedText,
      p_skills: input.skills,
    });

    if (error) throw error;

    const row = data?.[0];
    if (!row) throw new Error("set_active_resume returned no row");
    return toResume(row);
  }

  async updateSkills(id: string, skills: string[]): Promise<Resume> {
    const { data, error } = await this.client.from("resumes").update({ skills }).eq("id", id).select("*").single();

    if (error) throw error;
    return toResume(data);
  }
}
