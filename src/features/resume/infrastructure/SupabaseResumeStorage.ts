import type { ResumeStorage } from "@/features/resume/domain/ResumeStorage";
import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";

const RESUME_BUCKET = "resumes";

export class SupabaseResumeStorage implements ResumeStorage {
  constructor(private readonly client: TypedSupabaseClient) {}

  async upload(filePath: string, buffer: Buffer, mimeType: string): Promise<void> {
    const { error } = await this.client.storage.from(RESUME_BUCKET).upload(filePath, buffer, {
      contentType: mimeType,
      upsert: true,
    });
    if (error) throw new Error(error.message);
  }

  async remove(filePath: string): Promise<void> {
    // Best-effort: this only ever runs as post-failure cleanup (uploadResume.ts),
    // so a removal failure here must not mask the original error.
    await this.client.storage.from(RESUME_BUCKET).remove([filePath]);
  }
}
