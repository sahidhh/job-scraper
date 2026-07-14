import { describe, expect, it, vi } from "vitest";
import { mockSupabaseClient, queuedSupabaseClient } from "@/shared/infrastructure/testing/supabaseQueryMock";
import { SupabaseScoreRepository } from "./SupabaseScoreRepository";

describe("SupabaseScoreRepository", () => {
  it("insertScore calls the upsert_job_score RPC with all fields", async () => {
    const { client } = mockSupabaseClient({ data: null, error: null });
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

    expect(vi.mocked(client.rpc)).toHaveBeenCalledWith("upsert_job_score", {
      p_job_id: "job-1",
      p_role_selection_id: "role-selection-1",
      p_resume_version: 1,
      p_keyword_score: 1,
      p_ai_score: 0.85,
      p_ai_reasoning: "Strong match",
      p_model: "openai/gpt-4o-mini",
      p_tokens_input: null,
      p_tokens_output: null,
      p_estimated_cost_usd: null,
      p_overall_score: null,
      p_overall_score_reasons: null,
      p_embedding_score: null,
    });
  });

  it("insertScore passes overallScore and overallScoreReasons through to the RPC", async () => {
    const { client } = mockSupabaseClient({ data: null, error: null });
    const repo = new SupabaseScoreRepository(client);

    await repo.insertScore({
      jobId: "job-1",
      roleSelectionId: "role-selection-1",
      resumeVersion: 1,
      keywordScore: 1,
      aiScore: 0.85,
      overallScore: 0.9,
      overallScoreReasons: ["preferred company"],
    });

    expect(vi.mocked(client.rpc)).toHaveBeenCalledWith(
      "upsert_job_score",
      expect.objectContaining({ p_overall_score: 0.9, p_overall_score_reasons: ["preferred company"] }),
    );
  });

  it("insertScore passes embeddingScore through to the RPC", async () => {
    const { client } = mockSupabaseClient({ data: null, error: null });
    const repo = new SupabaseScoreRepository(client);

    await repo.insertScore({
      jobId: "job-1",
      roleSelectionId: "role-selection-1",
      resumeVersion: 1,
      keywordScore: 1,
      aiScore: 0.85,
      embeddingScore: 0.72,
    });

    expect(vi.mocked(client.rpc)).toHaveBeenCalledWith(
      "upsert_job_score",
      expect.objectContaining({ p_embedding_score: 0.72 }),
    );
  });

  it("insertScore defaults missing ai fields and model to null", async () => {
    const { client } = mockSupabaseClient({ data: null, error: null });
    const repo = new SupabaseScoreRepository(client);

    await repo.insertScore({ jobId: "job-1", roleSelectionId: "role-selection-1", resumeVersion: 1, keywordScore: 0 });

    expect(vi.mocked(client.rpc)).toHaveBeenCalledWith(
      "upsert_job_score",
      expect.objectContaining({ p_ai_score: null, p_ai_reasoning: null, p_model: null }),
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

  describe("findAwaitingAi", () => {
    it("filters by role/version/keyword gate, excludes scored jobs, and orders oldest first", async () => {
      const { client, builder } = mockSupabaseClient({
        data: [{ job_id: "job-1", scored_at: "2026-01-01T00:00:00Z", retry_count: 3 }],
        error: null,
      });
      const repo = new SupabaseScoreRepository(client);

      const result = await repo.findAwaitingAi("role-selection-1", 1, 0.25);

      expect(result).toEqual([{ jobId: "job-1", scoredAt: "2026-01-01T00:00:00Z", retryCount: 3 }]);
      expect(builder.eq).toHaveBeenCalledWith("role_selection_id", "role-selection-1");
      expect(builder.eq).toHaveBeenCalledWith("resume_version", 1);
      expect(builder.gte).toHaveBeenCalledWith("keyword_score", 0.25);
      expect(builder.is).toHaveBeenCalledWith("ai_score", null);
      expect(builder.order).toHaveBeenCalledWith("scored_at", { ascending: true });
    });

    it("returns an empty array when nothing is awaiting AI", async () => {
      const { client } = queuedSupabaseClient([{ data: [], error: null }]);
      const repo = new SupabaseScoreRepository(client);

      expect(await repo.findAwaitingAi("role-selection-1", 1, 0.25)).toEqual([]);
    });
  });
});
