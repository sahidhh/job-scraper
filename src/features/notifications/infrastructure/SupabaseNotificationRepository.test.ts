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
          job_scores: [{ ai_score: 0.9, ai_reasoning: "Great fit" }],
          notifications_log: [{ id: "notif-1" }],
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
});
