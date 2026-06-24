import { describe, expect, it } from "vitest";
import { mockSupabaseClient } from "@/shared/infrastructure/testing/supabaseQueryMock";
import { SupabaseScoreRepository } from "./SupabaseScoreRepository";

describe("SupabaseScoreRepository", () => {
  it("insertScore upserts on (job_id, role_selection_id, resume_version) and updates on conflict (retryable null ai_score)", async () => {
    const { client, builder } = mockSupabaseClient({ data: null, error: null });
    const repo = new SupabaseScoreRepository(client);

    await repo.insertScore({
      jobId: "job-1",
      roleSelectionId: "role-selection-1",
      resumeVersion: 1,
      keywordScore: 1,
      aiScore: 0.85,
      aiReasoning: "Strong match",
      model: "openai/gpt-4o-mini",
    });

    expect(builder.upsert).toHaveBeenCalledWith(
      {
        job_id: "job-1",
        role_selection_id: "role-selection-1",
        resume_version: 1,
        keyword_score: 1,
        ai_score: 0.85,
        ai_reasoning: "Strong match",
        model: "openai/gpt-4o-mini",
        tokens_input: null,
        tokens_output: null,
        estimated_cost_usd: null,
      },
      { onConflict: "job_id,role_selection_id,resume_version", ignoreDuplicates: false },
    );
  });

  it("insertScore defaults missing ai fields and model to null", async () => {
    const { client, builder } = mockSupabaseClient({ data: null, error: null });
    const repo = new SupabaseScoreRepository(client);

    await repo.insertScore({ jobId: "job-1", roleSelectionId: "role-selection-1", resumeVersion: 1, keywordScore: 0 });

    expect(builder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ ai_score: null, ai_reasoning: null, model: null }),
      expect.anything(),
    );
  });

  it("hasScore returns true when count > 0 and filters by all three key columns", async () => {
    const { client, builder } = mockSupabaseClient({ data: null, error: null, count: 1 });
    const repo = new SupabaseScoreRepository(client);

    const result = await repo.hasScore("job-1", "role-selection-1", 2);

    expect(result).toBe(true);
    expect(builder.eq).toHaveBeenCalledWith("job_id", "job-1");
    expect(builder.eq).toHaveBeenCalledWith("role_selection_id", "role-selection-1");
    expect(builder.eq).toHaveBeenCalledWith("resume_version", 2);
  });

  it("hasScore returns false when count is 0", async () => {
    const { client } = mockSupabaseClient({ data: null, error: null, count: 0 });
    const repo = new SupabaseScoreRepository(client);

    const result = await repo.hasScore("job-1", "role-selection-1", 1);

    expect(result).toBe(false);
  });
});
