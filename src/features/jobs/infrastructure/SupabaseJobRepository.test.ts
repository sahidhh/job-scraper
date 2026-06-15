import { describe, expect, it, vi } from "vitest";
import { mockSupabaseClient, queuedSupabaseClient } from "@/shared/infrastructure/testing/supabaseQueryMock";
import type { NormalizedJob } from "@/features/jobs/domain/types";
import type { Database } from "../../../../supabase/database.types";
import { SupabaseJobRepository } from "./SupabaseJobRepository";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];

function makeJob(overrides: Partial<NormalizedJob> = {}): NormalizedJob {
  return {
    source: "greenhouse",
    sourceJobId: "1",
    companyId: "company-1",
    companyName: "Acme",
    title: "Senior React Developer",
    locationRaw: "Remote",
    locationTags: ["remote"],
    description: "Build things",
    url: "https://example.com/jobs/1",
    postedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const jobRow: JobRow = {
  id: "job-1",
  source: "greenhouse",
  source_job_id: "1",
  company_id: "company-1",
  company_name: "Acme",
  title: "Senior React Developer",
  location_raw: "Remote",
  location_tags: ["remote"],
  description: "Build things",
  url: "https://example.com/jobs/1",
  posted_at: "2026-01-01T00:00:00Z",
  first_seen_at: "2025-12-01T00:00:00Z",
  updated_at: "2025-12-01T00:00:00Z",
};

describe("SupabaseJobRepository", () => {
  describe("upsertMany", () => {
    it("counts existing keys as updated and the rest as inserted, omitting first_seen_at from the payload", async () => {
      const { client, builders } = queuedSupabaseClient([
        { data: [{ source_job_id: "1" }], error: null }, // existing-key lookup
        { data: null, error: null }, // upsert
      ]);
      const repo = new SupabaseJobRepository(client);

      const jobs = [makeJob({ sourceJobId: "1" }), makeJob({ sourceJobId: "2" })];
      const result = await repo.upsertMany(jobs);

      expect(result).toEqual({ inserted: 1, updated: 1 });

      expect(builders).toHaveLength(2);
      const [lookupBuilder, upsertBuilder] = builders as [
        Record<string, ReturnType<typeof vi.fn>>,
        Record<string, ReturnType<typeof vi.fn>>,
      ];
      expect(lookupBuilder.eq).toHaveBeenCalledWith("source", "greenhouse");
      expect(lookupBuilder.in).toHaveBeenCalledWith("source_job_id", ["1", "2"]);

      const upsertCall = upsertBuilder.upsert!.mock.calls[0] as unknown[];
      const rows = upsertCall[0] as Record<string, unknown>[];
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row).not.toHaveProperty("first_seen_at");
        expect(row).toHaveProperty("updated_at");
      }
      expect(upsertCall[1]).toEqual({ onConflict: "source,source_job_id" });
    });

    it("returns zero counts for an empty input without querying", async () => {
      const { client, builders } = queuedSupabaseClient([]);
      const repo = new SupabaseJobRepository(client);

      const result = await repo.upsertMany([]);

      expect(result).toEqual({ inserted: 0, updated: 0 });
      expect(builders).toHaveLength(0);
    });
  });

  describe("findUnscored", () => {
    it("excludes only jobs with an existing ai_score and filters by title", async () => {
      const { client, builders } = queuedSupabaseClient([
        { data: [{ job_id: "job-2" }], error: null }, // job_scores rows with ai_score set
        { data: [jobRow], error: null }, // matching jobs
      ]);
      const repo = new SupabaseJobRepository(client);

      const result = await repo.findUnscored("role-selection-1", ["React Developer", "Frontend Engineer"]);

      expect(result).toEqual([
        {
          id: "job-1",
          source: "greenhouse",
          sourceJobId: "1",
          companyId: "company-1",
          companyName: "Acme",
          title: "Senior React Developer",
          locationRaw: "Remote",
          locationTags: ["remote"],
          description: "Build things",
          url: "https://example.com/jobs/1",
          postedAt: "2026-01-01T00:00:00Z",
          firstSeenAt: "2025-12-01T00:00:00Z",
          updatedAt: "2025-12-01T00:00:00Z",
        },
      ]);

      expect(builders).toHaveLength(2);
      const [scoredBuilder, jobsBuilder] = builders as [
        Record<string, ReturnType<typeof vi.fn>>,
        Record<string, ReturnType<typeof vi.fn>>,
      ];
      expect(scoredBuilder.eq).toHaveBeenCalledWith("role_selection_id", "role-selection-1");
      expect(scoredBuilder.not).toHaveBeenCalledWith("ai_score", "is", null);
      expect(jobsBuilder.or).toHaveBeenCalledWith(
        "title.ilike.%React Developer%,description.ilike.%React Developer%,title.ilike.%Frontend Engineer%,description.ilike.%Frontend Engineer%",
      );
      expect(jobsBuilder.not).toHaveBeenCalledWith("id", "in", "(job-2)");
    });

    it("includes jobs whose job_scores row has ai_score IS NULL (retry)", async () => {
      // The "ai_score is not null" filter excludes only fully-scored rows,
      // so a job whose previous run left ai_score null is not in the
      // exclusion set and is re-fetched here for retry.
      const { client, builders } = queuedSupabaseClient([
        { data: [], error: null }, // no job_scores rows with ai_score set
        { data: [jobRow], error: null }, // matching jobs, including the null-ai_score one
      ]);
      const repo = new SupabaseJobRepository(client);

      const result = await repo.findUnscored("role-selection-1", ["React Developer"]);

      expect(result).toEqual([expect.objectContaining({ id: "job-1" })]);

      const [, jobsBuilder] = builders as [
        Record<string, ReturnType<typeof vi.fn>>,
        Record<string, ReturnType<typeof vi.fn>>,
      ];
      // No exclusion filter applied when there are no fully-scored ids.
      expect(jobsBuilder.not).not.toHaveBeenCalledWith("id", "in", expect.anything());
    });

    it("returns an empty array without querying when there are no expanded roles", async () => {
      const { client, builders } = queuedSupabaseClient([]);
      const repo = new SupabaseJobRepository(client);

      expect(await repo.findUnscored("role-selection-1", [])).toEqual([]);
      expect(builders).toHaveLength(0);
    });

    it("strips PostgREST .or() filter syntax characters from role names", async () => {
      const { client, builders } = queuedSupabaseClient([
        { data: [], error: null }, // scored job ids
        { data: [], error: null }, // matching jobs
      ]);
      const repo = new SupabaseJobRepository(client);

      await repo.findUnscored("role-selection-1", ["Engineer, Backend (Remote)"]);

      const [, jobsBuilder] = builders as [
        Record<string, ReturnType<typeof vi.fn>>,
        Record<string, ReturnType<typeof vi.fn>>,
      ];
      expect(jobsBuilder.or).toHaveBeenCalledWith(
        "title.ilike.%Engineer Backend Remote%,description.ilike.%Engineer Backend Remote%",
      );
    });

    it("returns an empty array without querying when every role is sanitized to empty", async () => {
      const { client, builders } = queuedSupabaseClient([]);
      const repo = new SupabaseJobRepository(client);

      expect(await repo.findUnscored("role-selection-1", ["(),.%*"])).toEqual([]);
      expect(builders).toHaveLength(0);
    });
  });

  describe("countMatchingExpandedRoles", () => {
    it("returns the exact count from a head-only query filtered by expanded roles", async () => {
      const { client, builder } = mockSupabaseClient({ data: null, error: null, count: 24 });
      const repo = new SupabaseJobRepository(client);

      const result = await repo.countMatchingExpandedRoles(["React Developer", "Frontend Engineer"]);

      expect(result).toBe(24);
      expect(builder.select).toHaveBeenCalledWith("id", { count: "exact", head: true });
      expect(builder.or).toHaveBeenCalledWith(
        "title.ilike.%React Developer%,description.ilike.%React Developer%,title.ilike.%Frontend Engineer%,description.ilike.%Frontend Engineer%",
      );
    });

    it("returns 0 without querying when there are no expanded roles", async () => {
      const { client, builders } = queuedSupabaseClient([]);
      const repo = new SupabaseJobRepository(client);

      expect(await repo.countMatchingExpandedRoles([])).toBe(0);
      expect(builders).toHaveLength(0);
    });

    it("returns 0 when count is null", async () => {
      const { client } = mockSupabaseClient({ data: null, error: null, count: null });
      const repo = new SupabaseJobRepository(client);

      expect(await repo.countMatchingExpandedRoles(["React Developer"])).toBe(0);
    });
  });

  describe("findForDashboard", () => {
    it("maps jobs joined with their score and applies location/source filters", async () => {
      const { client, builder } = mockSupabaseClient({
        data: [{ ...jobRow, job_scores: [{ keyword_score: 1, ai_score: 0.85, ai_reasoning: "Strong match" }] }],
        error: null,
      });
      const repo = new SupabaseJobRepository(client);

      const result = await repo.findForDashboard(
        "role-selection-1",
        { locationTags: ["remote"], sources: ["greenhouse"] },
        50,
      );

      expect(result).toEqual({
        jobs: [
          expect.objectContaining({
            id: "job-1",
            keywordScore: 1,
            aiScore: 0.85,
            aiReasoning: "Strong match",
          }),
        ],
        hasMore: false,
      });
      expect(builder.eq).toHaveBeenCalledWith("job_scores.role_selection_id", "role-selection-1");
      expect(builder.overlaps).toHaveBeenCalledWith("location_tags", ["remote"]);
      expect(builder.in).toHaveBeenCalledWith("source", ["greenhouse"]);
      expect(builder.limit).toHaveBeenCalledWith(51);
    });

    it("returns a job with null score fields when it has no job_scores row", async () => {
      const { client } = mockSupabaseClient({
        data: [{ ...jobRow, job_scores: [] }],
        error: null,
      });
      const repo = new SupabaseJobRepository(client);

      const result = await repo.findForDashboard("role-selection-1", {}, 50);

      expect(result.jobs).toEqual([
        expect.objectContaining({ keywordScore: null, aiScore: null, aiReasoning: null }),
      ]);
    });

    it("pushes minAiScore into the query as a gte filter on job_scores.ai_score", async () => {
      const { client, builder } = mockSupabaseClient({
        data: [{ ...jobRow, id: "job-high", job_scores: [{ keyword_score: 1, ai_score: 0.9, ai_reasoning: "Strong" }] }],
        error: null,
      });
      const repo = new SupabaseJobRepository(client);

      const result = await repo.findForDashboard("role-selection-1", { minAiScore: 0.8 }, 50);

      expect(result.jobs).toEqual([expect.objectContaining({ id: "job-high" })]);
      expect(builder.gte).toHaveBeenCalledWith("job_scores.ai_score", 0.8);
    });

    it("sets hasMore when more rows exist than the requested limit", async () => {
      const { client } = mockSupabaseClient({
        data: [
          { ...jobRow, id: "job-1", job_scores: [] },
          { ...jobRow, id: "job-2", job_scores: [] },
        ],
        error: null,
      });
      const repo = new SupabaseJobRepository(client);

      const result = await repo.findForDashboard("role-selection-1", {}, 1);

      expect(result.hasMore).toBe(true);
      expect(result.jobs).toHaveLength(1);
    });
  });
});
