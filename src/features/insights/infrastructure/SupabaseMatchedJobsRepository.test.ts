import { describe, expect, it } from "vitest";
import { mockSupabaseClient, queuedSupabaseClient } from "@/shared/infrastructure/testing/supabaseQueryMock";
import { SupabaseMatchedJobsRepository } from "./SupabaseMatchedJobsRepository";

describe("SupabaseMatchedJobsRepository", () => {
  it("returns an empty array without querying when there are no expanded roles", async () => {
    const { client, builders } = queuedSupabaseClient([]);
    const repo = new SupabaseMatchedJobsRepository(client);

    expect(await repo.findRoleMatchedJobs("role-1", [])).toEqual([]);
    expect(builders).toHaveLength(0);
  });

  it("maps rows to MatchedJob, taking the scoped ai_score or null", async () => {
    const { client, builder } = mockSupabaseClient({
      data: [
        { title: "Senior React Dev", description: "React, Node", job_scores: [{ ai_score: 0.8, role_selection_id: "role-1" }] },
        { title: "Backend Dev", description: "Go", job_scores: [] },
      ],
      error: null,
    });
    const repo = new SupabaseMatchedJobsRepository(client);

    const result = await repo.findRoleMatchedJobs("role-1", ["React Developer"]);

    expect(result).toEqual([
      { title: "Senior React Dev", description: "React, Node", aiScore: 0.8 },
      { title: "Backend Dev", description: "Go", aiScore: null },
    ]);
    expect(builder.eq).toHaveBeenCalledWith("job_scores.role_selection_id", "role-1");
    expect(builder.or).toHaveBeenCalledWith(
      "title.ilike.%React Developer%,description.ilike.%React Developer%",
    );
  });

  it("getScrapeRuns maps scrape_run rows to ScrapeRunDataPoint", async () => {
    const { client, builder } = mockSupabaseClient({
      data: [
        { run_at: "2026-06-01T10:00:00Z", jobs_found: 12, source: "greenhouse" },
        { run_at: "2026-06-02T10:00:00Z", jobs_found: 8, source: "lever" },
      ],
      error: null,
    });
    const repo = new SupabaseMatchedJobsRepository(client);
    const result = await repo.getScrapeRuns();
    expect(result).toEqual([
      { runAt: "2026-06-01T10:00:00Z", jobsFound: 12, source: "greenhouse" },
      { runAt: "2026-06-02T10:00:00Z", jobsFound: 8, source: "lever" },
    ]);
    expect(builder.eq).toHaveBeenCalledWith("status", "success");
    expect(builder.order).toHaveBeenCalledWith("run_at", { ascending: true });
  });

  it("getAiScores returns non-null ai_score values for the role", async () => {
    const { client, builder } = mockSupabaseClient({
      data: [{ ai_score: 75 }, { ai_score: 90 }],
      error: null,
    });
    const repo = new SupabaseMatchedJobsRepository(client);
    const result = await repo.getAiScores("role-1");
    expect(result).toEqual([75, 90]);
    expect(builder.eq).toHaveBeenCalledWith("role_selection_id", "role-1");
    expect(builder.not).toHaveBeenCalledWith("ai_score", "is", null);
  });

  it("getStatusBreakdown counts statuses and adds New for unassigned jobs", async () => {
    const { client } = queuedSupabaseClient([
      {
        data: [
          { job_statuses: { label: "Interested", color: "#DBEAFE" } },
          { job_statuses: { label: "Applied", color: "#DCFCE7" } },
          { job_statuses: { label: "Interested", color: "#DBEAFE" } },
        ],
        error: null,
      },
      { data: null, error: null, count: 10 },
    ]);
    const repo = new SupabaseMatchedJobsRepository(client);
    const result = await repo.getStatusBreakdown();
    expect(result).toEqual(
      expect.arrayContaining([
        { label: "Interested", color: "#DBEAFE", count: 2 },
        { label: "Applied", color: "#DCFCE7", count: 1 },
        { label: "New", color: "#E5E7EB", count: 7 },
      ]),
    );
    expect(result[0]!.count).toBeGreaterThanOrEqual(result[1]!.count);
  });
});
