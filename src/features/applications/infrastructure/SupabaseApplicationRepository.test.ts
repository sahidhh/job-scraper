import { describe, expect, it } from "vitest";
import type { Database } from "../../../../supabase/database.types";
import { mockSupabaseClient } from "@/shared/infrastructure/testing/supabaseQueryMock";
import { SupabaseApplicationRepository } from "./SupabaseApplicationRepository";

type ApplicationRow = Database["public"]["Tables"]["applications"]["Row"];

const row: ApplicationRow = {
  id: "app-1",
  job_id: "job-1",
  resume_id: "resume-1",
  kind: "email",
  subject: "Application for Software Engineer",
  body: "Dear team,",
  recipient_email: "recruiter@acme.example",
  status: "draft",
  model: "gemini-2.5-flash",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  sent_at: null,
};

describe("SupabaseApplicationRepository", () => {
  it("getById maps the row", async () => {
    const { client, builder } = mockSupabaseClient({ data: row, error: null });
    const repo = new SupabaseApplicationRepository(client);

    const result = await repo.getById("app-1");

    expect(result).toEqual({
      id: "app-1",
      jobId: "job-1",
      resumeId: "resume-1",
      kind: "email",
      subject: "Application for Software Engineer",
      body: "Dear team,",
      recipientEmail: "recruiter@acme.example",
      status: "draft",
      model: "gemini-2.5-flash",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      sentAt: null,
    });
    expect(builder.eq).toHaveBeenCalledWith("id", "app-1");
  });

  it("getById returns null when no row matches", async () => {
    const { client } = mockSupabaseClient({ data: null, error: null });
    const repo = new SupabaseApplicationRepository(client);

    expect(await repo.getById("missing")).toBeNull();
  });

  it("findByJobAndKind filters on job_id and kind", async () => {
    const { client, builder } = mockSupabaseClient({ data: row, error: null });
    const repo = new SupabaseApplicationRepository(client);

    await repo.findByJobAndKind("job-1", "email");

    expect(builder.eq).toHaveBeenCalledWith("job_id", "job-1");
    expect(builder.eq).toHaveBeenCalledWith("kind", "email");
  });

  it("upsertDraft upserts on (job_id, kind), resetting status to draft", async () => {
    const { client, builder } = mockSupabaseClient({ data: row, error: null });
    const repo = new SupabaseApplicationRepository(client);

    await repo.upsertDraft({
      jobId: "job-1",
      resumeId: "resume-1",
      kind: "email",
      subject: "Application for Software Engineer",
      body: "Dear team,",
      recipientEmail: "recruiter@acme.example",
      model: "gemini-2.5-flash",
    });

    expect(builder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        job_id: "job-1",
        resume_id: "resume-1",
        kind: "email",
        status: "draft",
        sent_at: null,
      }),
      { onConflict: "job_id,kind" },
    );
  });

  it("markSent sets status and sent_at", async () => {
    const { client, builder } = mockSupabaseClient({ data: { ...row, status: "sent", sent_at: "2026-01-02T00:00:00Z" }, error: null });
    const repo = new SupabaseApplicationRepository(client);

    const result = await repo.markSent("app-1");

    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "sent", sent_at: expect.any(String) }),
    );
    expect(result.status).toBe("sent");
  });

  it("markDismissed sets status to dismissed", async () => {
    const { client, builder } = mockSupabaseClient({ data: { ...row, status: "dismissed" }, error: null });
    const repo = new SupabaseApplicationRepository(client);

    const result = await repo.markDismissed("app-1");

    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({ status: "dismissed" }));
    expect(result.status).toBe("dismissed");
  });

  it("listPendingDrafts maps the joined job title/company", async () => {
    const { client, builder } = mockSupabaseClient({
      data: [
        { id: "app-1", job_id: "job-1", kind: "email", created_at: "2026-01-01T00:00:00Z", jobs: { title: "Engineer", company_name: "Acme" } },
      ],
      error: null,
    });
    const repo = new SupabaseApplicationRepository(client);

    const result = await repo.listPendingDrafts();

    expect(builder.eq).toHaveBeenCalledWith("status", "draft");
    expect(result).toEqual([
      { applicationId: "app-1", jobId: "job-1", jobTitle: "Engineer", companyName: "Acme", kind: "email", createdAt: "2026-01-01T00:00:00Z" },
    ]);
  });

  it("getById throws on a Supabase error", async () => {
    const { client } = mockSupabaseClient({ data: null, error: { message: "boom" } });
    const repo = new SupabaseApplicationRepository(client);

    await expect(repo.getById("app-1")).rejects.toThrow();
  });
});
