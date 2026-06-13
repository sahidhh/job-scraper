import { describe, expect, it } from "vitest";
import { mockSupabaseClient } from "@/shared/infrastructure/testing/supabaseQueryMock";
import { SupabaseScoreRepository } from "./SupabaseScoreRepository";

describe("SupabaseScoreRepository", () => {
  it("insertScore upserts on (job_id, role_selection_id) and ignores duplicates", async () => {
    const { client, builder } = mockSupabaseClient({ data: null, error: null });
    const repo = new SupabaseScoreRepository(client);

    await repo.insertScore({
      jobId: "job-1",
      roleSelectionId: "role-selection-1",
      keywordScore: 1,
      aiScore: 0.85,
      aiReasoning: "Strong match",
    });

    expect(builder.upsert).toHaveBeenCalledWith(
      {
        job_id: "job-1",
        role_selection_id: "role-selection-1",
        keyword_score: 1,
        ai_score: 0.85,
        ai_reasoning: "Strong match",
      },
      { onConflict: "job_id,role_selection_id", ignoreDuplicates: true },
    );
  });

  it("insertScore defaults missing ai fields to null", async () => {
    const { client, builder } = mockSupabaseClient({ data: null, error: null });
    const repo = new SupabaseScoreRepository(client);

    await repo.insertScore({ jobId: "job-1", roleSelectionId: "role-selection-1", keywordScore: 0 });

    expect(builder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ ai_score: null, ai_reasoning: null }),
      expect.anything(),
    );
  });

  it("hasScore returns true when count > 0", async () => {
    const { client, builder } = mockSupabaseClient({ data: null, error: null, count: 1 });
    const repo = new SupabaseScoreRepository(client);

    const result = await repo.hasScore("job-1", "role-selection-1");

    expect(result).toBe(true);
    expect(builder.eq).toHaveBeenCalledWith("job_id", "job-1");
    expect(builder.eq).toHaveBeenCalledWith("role_selection_id", "role-selection-1");
  });

  it("hasScore returns false when count is 0", async () => {
    const { client } = mockSupabaseClient({ data: null, error: null, count: 0 });
    const repo = new SupabaseScoreRepository(client);

    const result = await repo.hasScore("job-1", "role-selection-1");

    expect(result).toBe(false);
  });
});
