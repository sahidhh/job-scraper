import type { ApplicationRepository } from "@/features/applications/domain/ApplicationRepository";
import type { Application, ApplicationKind, NewApplicationDraft, PendingApplicationDraft } from "@/features/applications/domain/types";
import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import { toAppError } from "@/shared/infrastructure/supabaseError";
import type { Database } from "../../../../supabase/database.types";

type ApplicationRow = Database["public"]["Tables"]["applications"]["Row"];

// listPendingDrafts' join shape -- PostgREST embeds `jobs` as an object
// since applications.job_id -> jobs.id is many-to-one. Explicitly typed via
// .returns<>() (same pattern as SupabaseJobRepository's DashboardJobRow)
// rather than relying on inference from the select string.
interface PendingDraftRow {
  id: string;
  job_id: string;
  kind: string;
  created_at: string;
  jobs: { title: string; company_name: string } | null;
}

function toApplication(row: ApplicationRow): Application {
  return {
    id: row.id,
    jobId: row.job_id,
    resumeId: row.resume_id,
    kind: row.kind as ApplicationKind,
    subject: row.subject,
    body: row.body,
    recipientEmail: row.recipient_email,
    status: row.status as Application["status"],
    model: row.model,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sentAt: row.sent_at,
  };
}

export class SupabaseApplicationRepository implements ApplicationRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async getById(id: string): Promise<Application | null> {
    const { data, error } = await this.client.from("applications").select("*").eq("id", id).maybeSingle();

    if (error) throw toAppError(error);
    return data ? toApplication(data) : null;
  }

  async findByJobAndKind(jobId: string, kind: ApplicationKind): Promise<Application | null> {
    const { data, error } = await this.client
      .from("applications")
      .select("*")
      .eq("job_id", jobId)
      .eq("kind", kind)
      .maybeSingle();

    if (error) throw toAppError(error);
    return data ? toApplication(data) : null;
  }

  async listByJob(jobId: string): Promise<Application[]> {
    const { data, error } = await this.client
      .from("applications")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    if (error) throw toAppError(error);
    return (data ?? []).map(toApplication);
  }

  async listPendingDrafts(): Promise<PendingApplicationDraft[]> {
    const { data, error } = await this.client
      .from("applications")
      .select("id, job_id, kind, created_at, jobs(title, company_name)")
      .eq("status", "draft")
      .order("created_at", { ascending: true })
      .returns<PendingDraftRow[]>();

    if (error) throw toAppError(error);

    return (data ?? []).map((row) => ({
      applicationId: row.id,
      jobId: row.job_id,
      jobTitle: row.jobs?.title ?? "",
      companyName: row.jobs?.company_name ?? "",
      kind: row.kind as ApplicationKind,
      createdAt: row.created_at,
    }));
  }

  // (job_id, kind) is unique -- upsert on that conflict target, resetting
  // status back to 'draft' (a redraft over a prior 'dismissed' row is
  // exactly this path; draftApplication.ts already refuses a 'sent' one).
  async upsertDraft(input: NewApplicationDraft): Promise<Application> {
    const { data, error } = await this.client
      .from("applications")
      .upsert(
        {
          job_id: input.jobId,
          resume_id: input.resumeId,
          kind: input.kind,
          subject: input.subject,
          body: input.body,
          recipient_email: input.recipientEmail,
          model: input.model,
          status: "draft",
          sent_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "job_id,kind" },
      )
      .select("*")
      .single();

    if (error) throw toAppError(error);
    return toApplication(data);
  }

  async updateContent(id: string, subject: string, body: string): Promise<Application> {
    const { data, error } = await this.client
      .from("applications")
      .update({ subject, body, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw toAppError(error);
    return toApplication(data);
  }

  async markSent(id: string): Promise<Application> {
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from("applications")
      .update({ status: "sent", sent_at: now, updated_at: now })
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw toAppError(error);
    return toApplication(data);
  }

  async markDismissed(id: string): Promise<Application> {
    const { data, error } = await this.client
      .from("applications")
      .update({ status: "dismissed", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw toAppError(error);
    return toApplication(data);
  }
}
