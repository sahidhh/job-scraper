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
});
