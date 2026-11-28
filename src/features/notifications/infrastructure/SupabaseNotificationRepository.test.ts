import { describe, expect, it } from "vitest";
import { mockSupabaseClient, queuedSupabaseClient } from "@/shared/infrastructure/testing/supabaseQueryMock";
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
          posted_at: "2026-04-16T10:00:00Z",
          job_scores: [{ ai_score: 0.85, overall_score: 0.87, ai_reasoning: "Strong match" }],
          notifications_log: null,
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
          posted_at: null,
          job_scores: [{ ai_score: 0.9, overall_score: 0.9, ai_reasoning: "Great fit" }],
          notifications_log: { id: "notif-1" },
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
          posted_at: "2026-04-10T10:00:00Z",
          job_scores: [{ ai_score: 0.95, overall_score: 0.95, ai_reasoning: "Excellent fit" }],
          notifications_log: null,
        },
      ],
      error: null,
    });
    const repo = new SupabaseNotificationRepository(client);
    const now = new Date("2026-04-17T00:00:00Z");

    const result = await repo.findUnnotifiedMatches("role-selection-1", 0.8, 2, now);

    expect(result).toEqual([
      {
        jobId: "job-3",
        title: "Staff Engineer",
        companyName: "Acme",
        locationTags: ["remote"],
        source: "greenhouse",
        url: "https://example.com/jobs/3",
        aiScore: 0.95,
        overallScore: 0.95,
        postedAt: "2026-04-10T10:00:00Z",
        aiReasoning: "Excellent fit",
        description: "Platform engineering role.",
        minYears: 5,
      },
      {
        jobId: "job-1",
        title: "Senior React Developer",
        companyName: "Acme",
        locationTags: ["remote"],
        source: "greenhouse",
        url: "https://example.com/jobs/1",
        aiScore: 0.85,
        overallScore: 0.87,
        postedAt: "2026-04-16T10:00:00Z",
        aiReasoning: "Strong match",
        description: "React and Node.js role.",
        minYears: 3,
      },
    ]);
    expect(builder.eq).toHaveBeenCalledWith("is_active", true);
    expect(builder.eq).toHaveBeenCalledWith("job_scores.role_selection_id", "role-selection-1");
    expect(builder.eq).toHaveBeenCalledWith("job_scores.resume_version", 2);
    expect(builder.gte).toHaveBeenCalledWith("job_scores.ai_score", 0.8);
  });

  it("findUnnotifiedMatches ranks < 24h fresh jobs ahead of equal-score older jobs", async () => {
    const { client } = mockSupabaseClient({
      data: [
        {
          id: "job-old",
          title: "Older Role",
          company_name: "Acme",
          location_tags: ["india"],
          source: "naukri",
          url: "https://example.com/jobs/old",
          description: "Old.",
          min_years: 2,
          posted_at: "2026-04-10T00:00:00Z",
          job_scores: [{ ai_score: 0.85, overall_score: 0.85, ai_reasoning: null }],
          notifications_log: null,
        },
        {
          id: "job-fresh",
          title: "Fresh Role",
          company_name: "Acme",
          location_tags: ["india"],
          source: "naukri",
          url: "https://example.com/jobs/fresh",
          description: "Fresh.",
          min_years: 2,
          posted_at: "2026-04-16T20:00:00Z",
          job_scores: [{ ai_score: 0.85, overall_score: 0.85, ai_reasoning: null }],
          notifications_log: null,
        },
      ],
      error: null,
    });
    const repo = new SupabaseNotificationRepository(client);
    const result = await repo.findUnnotifiedMatches("role-selection-1", 0.8, 2, new Date("2026-04-17T00:00:00Z"));
    expect(result.map((r) => r.jobId)).toEqual(["job-fresh", "job-old"]);
  });

  it("findUnnotifiedMatches excludes a job with a to-one notifications_log object and keeps a null embed (#229)", async () => {
    const base = {
      company_name: "Acme",
      location_tags: ["uae"],
      source: "naukrigulf",
      url: "https://example.com/jobs/x",
      description: "Role.",
      min_years: 3,
      posted_at: "2026-11-27T00:00:00Z",
      job_scores: [{ ai_score: 0.9, overall_score: 0.9, ai_reasoning: null }],
    };
    const { client } = mockSupabaseClient({
      data: [
        { ...base, id: "job-notified", title: "Notified", notifications_log: { id: "notif-1" } },
        { ...base, id: "job-new", title: "New", notifications_log: null },
        { ...base, id: "job-legacy-array", title: "Array shape", notifications_log: [{ id: "notif-2" }] },
      ],
      error: null,
    });
    const repo = new SupabaseNotificationRepository(client);
    const result = await repo.findUnnotifiedMatches("role-selection-1", 0.8, 2, new Date("2026-11-28T00:00:00Z"));
    expect(result.map((r) => r.jobId)).toEqual(["job-new"]);
  });

  it("markNotified upserts onConflict 'job_id' ignoring duplicates", async () => {
    const { client, builder } = mockSupabaseClient({ data: null, error: null });
    const repo = new SupabaseNotificationRepository(client);

    await repo.markNotified("job-1");

    expect(builder.upsert).toHaveBeenCalledWith({ job_id: "job-1" }, { onConflict: "job_id", ignoreDuplicates: true });
  });

  it("markManyNotified upserts all ids in a single call, onConflict 'job_id' ignoring duplicates", async () => {
    const { client, builder } = mockSupabaseClient({ data: null, error: null });
    const repo = new SupabaseNotificationRepository(client);

    await repo.markManyNotified(["job-1", "job-2"]);

    expect(builder.upsert).toHaveBeenCalledWith(
      [{ job_id: "job-1" }, { job_id: "job-2" }],
      { onConflict: "job_id", ignoreDuplicates: true },
    );
  });

  it("markManyNotified does not query for an empty array", async () => {
    const { client, builders } = queuedSupabaseClient([]);
    const repo = new SupabaseNotificationRepository(client);

    await repo.markManyNotified([]);

    expect(builders).toHaveLength(0);
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
