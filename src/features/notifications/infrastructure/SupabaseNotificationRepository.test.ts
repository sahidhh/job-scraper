import { describe, expect, it } from "vitest";
import { mockSupabaseClient } from "@/shared/infrastructure/testing/supabaseQueryMock";
import { SupabaseNotificationRepository } from "./SupabaseNotificationRepository";

describe("SupabaseNotificationRepository", () => {
  it("findUnnotifiedMatches maps matches and filters out already-notified jobs", async () => {
    const { client, builder } = mockSupabaseClient({
      data: [
        {
          id: "job-1",
          title: "Senior React Developer",
          company_name: "Acme",
          location_tags: ["remote"],
          source: "greenhouse",
          url: "https://example.com/jobs/1",
          description: "React and Node.js role.",
          min_years: 3,
          job_scores: [{ ai_score: 0.85, ai_reasoning: "Strong match" }],
          notifications_log: [],
        },
        {
          id: "job-2",
          title: "Already notified",
          company_name: "Acme",
          location_tags: ["remote"],
          source: "greenhouse",
          url: "https://example.com/jobs/2",
          description: "Some description.",
          min_years: null,
          job_scores: [{ ai_score: 0.9, ai_reasoning: "Great fit" }],
          notifications_log: [{ id: "notif-1" }],
        },
        {
          id: "job-3",
          title: "Staff Engineer",
          company_name: "Acme",
          location_tags: ["remote"],
          source: "greenhouse",
          url: "https://example.com/jobs/3",
          description: "Platform engineering role.",
          min_years: 5,
          job_scores: [{ ai_score: 0.95, ai_reasoning: "Excellent fit" }],
          notifications_log: null,
        },
      ],
      error: null,
    });
    const repo = new SupabaseNotificationRepository(client);

    const result = await repo.findUnnotifiedMatches("role-selection-1", 0.8);

    expect(result).toEqual([
      {
        jobId: "job-1",
        title: "Senior React Developer",
        companyName: "Acme",
        locationTags: ["remote"],
        source: "greenhouse",
        url: "https://example.com/jobs/1",
        aiScore: 0.85,
        aiReasoning: "Strong match",
        description: "React and Node.js role.",
        minYears: 3,
      },
      {
        jobId: "job-3",
        title: "Staff Engineer",
        companyName: "Acme",
        locationTags: ["remote"],
        source: "greenhouse",
        url: "https://example.com/jobs/3",
        aiScore: 0.95,
        aiReasoning: "Excellent fit",
        description: "Platform engineering role.",
        minYears: 5,
      },
    ]);
    expect(builder.eq).toHaveBeenCalledWith("job_scores.role_selection_id", "role-selection-1");
    expect(builder.gte).toHaveBeenCalledWith("job_scores.ai_score", 0.8);
  });

  it("markNotified upserts onConflict 'job_id' ignoring duplicates", async () => {
    const { client, builder } = mockSupabaseClient({ data: null, error: null });
    const repo = new SupabaseNotificationRepository(client);

    await repo.markNotified("job-1");

    expect(builder.upsert).toHaveBeenCalledWith({ job_id: "job-1" }, { onConflict: "job_id", ignoreDuplicates: true });
  });

  it("listRecent orders by sent_at desc, maps rows, and skips entries with no matching job", async () => {
    const { client, builder } = mockSupabaseClient({
      data: [
        {
          id: "notif-1",
          job_id: "job-1",
          sent_at: "2026-01-02T00:00:00Z",
          jobs: { title: "Senior React Developer", company_name: "Acme", source: "greenhouse" },
        },
        {
          id: "notif-2",
          job_id: "job-2",
          sent_at: "2026-01-01T00:00:00Z",
          jobs: null,
        },
      ],
      error: null,
    });
    const repo = new SupabaseNotificationRepository(client);

    const result = await repo.listRecent(20);

    expect(result).toEqual([
      {
        id: "notif-1",
        jobId: "job-1",
        jobTitle: "Senior React Developer",
        companyName: "Acme",
        source: "greenhouse",
        sentAt: "2026-01-02T00:00:00Z",
      },
    ]);
    expect(builder.order).toHaveBeenCalledWith("sent_at", { ascending: false });
    expect(builder.limit).toHaveBeenCalledWith(20);
  });
});
