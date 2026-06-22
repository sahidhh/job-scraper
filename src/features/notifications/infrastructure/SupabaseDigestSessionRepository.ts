import type { DigestSessionRepository } from "@/features/notifications/domain/DigestSessionRepository";
import type { DigestSession } from "@/features/notifications/domain/types";
import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import { toAppError } from "@/shared/infrastructure/supabaseError";

export class SupabaseDigestSessionRepository implements DigestSessionRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async save(roleSelectionId: string, worthReviewingJobIds: string[], resumeVersion: number): Promise<{ id: string }> {
    const { data, error } = await this.client
      .from("digest_sessions")
      .insert({ role_selection_id: roleSelectionId, worth_reviewing_job_ids: worthReviewingJobIds, resume_version: resumeVersion })
      .select("id")
      .single();

    if (error) throw toAppError(error);
    return { id: data.id };
  }

  async getLatest(): Promise<DigestSession | null> {
    const { data, error } = await this.client
      .from("digest_sessions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw toAppError(error);
    if (!data) return null;

    return {
      id: data.id,
      roleSelectionId: data.role_selection_id,
      resumeVersion: data.resume_version,
      worthReviewingJobIds: data.worth_reviewing_job_ids,
      paginationMessageId: data.pagination_message_id,
      createdAt: data.created_at,
    };
  }

  async updatePaginationMessageId(id: string, messageId: number): Promise<void> {
    const { error } = await this.client
      .from("digest_sessions")
      .update({ pagination_message_id: messageId })
      .eq("id", id);

    if (error) throw toAppError(error);
  }
}
