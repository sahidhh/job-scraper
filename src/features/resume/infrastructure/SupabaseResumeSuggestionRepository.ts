import type { ResumeSuggestionRepository } from "@/features/resume/domain/ResumeSuggestionRepository";
import type { NewResumeSuggestionSet, ResumeSuggestionItem, ResumeSuggestionSet } from "@/features/resume/domain/types";
import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import { toAppError } from "@/shared/infrastructure/supabaseError";
import type { Database } from "../../../../supabase/database.types";

type ResumeSuggestionRow = Database["public"]["Tables"]["resume_suggestions"]["Row"];

function toResumeSuggestionSet(row: ResumeSuggestionRow): ResumeSuggestionSet {
  return {
    id: row.id,
    resumeId: row.resume_id,
    targetRole: row.target_role,
    suggestions: row.suggestions as unknown as ResumeSuggestionItem[],
    model: row.model,
    createdAt: row.created_at,
    appliedAsResumeId: row.applied_as_resume_id,
  };
}

export class SupabaseResumeSuggestionRepository implements ResumeSuggestionRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async create(input: NewResumeSuggestionSet): Promise<ResumeSuggestionSet> {
    const { data, error } = await this.client
      .from("resume_suggestions")
      .insert({
        resume_id: input.resumeId,
        target_role: input.targetRole,
        suggestions: input.suggestions as unknown as ResumeSuggestionRow["suggestions"],
        model: input.model,
      })
      .select("*")
      .single();

    if (error) throw toAppError(error);
    return toResumeSuggestionSet(data);
  }

  async getById(id: string): Promise<ResumeSuggestionSet | null> {
    const { data, error } = await this.client.from("resume_suggestions").select("*").eq("id", id).maybeSingle();

    if (error) throw toAppError(error);
    return data ? toResumeSuggestionSet(data) : null;
  }

  async markApplied(id: string, appliedAsResumeId: string): Promise<void> {
    const { error } = await this.client
      .from("resume_suggestions")
      .update({ applied_as_resume_id: appliedAsResumeId })
      .eq("id", id);

    if (error) throw toAppError(error);
  }
}
