import { describe, expect, it, vi } from "vitest";
import { mockSupabaseClient, queuedSupabaseClient } from "@/shared/infrastructure/testing/supabaseQueryMock";
import type { NormalizedJob } from "@/features/jobs/domain/types";
import { computeFingerprint } from "@/features/jobs/application/computeFingerprint";
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
  last_seen_at: "2026-06-01T00:00:00Z",
  updated_at: "2025-12-01T00:00:00Z",
  min_years: null,
  is_active: true,
  inactive_reason: null,
  canonical_company_name: "Acme",
  fingerprint: "test-fingerprint",
};

describe("SupabaseJobRepository", () => {
  describe("upsertMany", () => {
    it("counts existing keys as updated and the rest as inserted, omitting first_seen_at from the payload", async () => {
      const { client, builders } = queuedSupabaseClient([
        { data: [{ source_job_id: "1" }], error: null }, // existing-key lookup
        { data: [], error: null }, // fingerprint lookup for job "2" (no match)
        { data: null, error: null }, // upsert
      ]);
      const repo = new SupabaseJobRepository(client);

      const jobs = [makeJob({ sourceJobId: "1" }), makeJob({ sourceJobId: "2" })];
      const result = await repo.upsertMany(jobs);

      expect(result).toEqual({ inserted: 1, updated: 1, duplicates: 0 });

      expect(builders).toHaveLength(3);
      const [lookupBuilder, fingerprintBuilder, upsertBuilder] = builders as [
        Record<string, ReturnType<typeof vi.fn>>,
        Record<string, ReturnType<typeof vi.fn>>,
        Record<string, ReturnType<typeof vi.fn>>,
      ];
      expect(lookupBuilder.eq).toHaveBeenCalledWith("source", "greenhouse");
      expect(lookupBuilder.in).toHaveBeenCalledWith("source_job_id", ["1", "2"]);
      expect(fingerprintBuilder.in).toHaveBeenCalledWith("fingerprint", [computeFingerprint(makeJob({ sourceJobId: "2" }))]);

      const upsertCall = upsertBuilder.upsert!.mock.calls[0] as unknown[];
      const rows = upsertCall[0] as Record<string, unknown>[];
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row).not.toHaveProperty("first_seen_at");
        expect(row).toHaveProperty("updated_at");
        expect(row).toHaveProperty("last_seen_at");
        expect(row).toHaveProperty("is_active", true);
        expect(row).toHaveProperty("fingerprint");
        expect(row).toHaveProperty("canonical_company_name", "Acme");
      }
      expect(upsertCall[1]).toEqual({ onConflict: "source,source_job_id" });
    });

    it("returns zero counts for an empty input without querying", async () => {
      const { client, builders } = queuedSupabaseClient([]);
      const repo = new SupabaseJobRepository(client);

      const result = await repo.upsertMany([]);

      expect(result).toEqual({ inserted: 0, updated: 0, duplicates: 0 });
      expect(builders).toHaveLength(0);
    });

    it("skips inserting a job whose fingerprint matches an already-persisted job from a different source", async () => {
      const duplicateJob = makeJob({ source: "wellfound", sourceJobId: "99", url: "https://wellfound.com/jobs/99" });
      const { client, builders } = queuedSupabaseClient([
        { data: [], error: null }, // existing-key lookup: no (source, sourceJobId) match
        { data: [{ id: "job-1", fingerprint: computeFingerprint(duplicateJob) }], error: null }, // fingerprint match
        { data: null, error: null }, // job_duplicates upsert
        { data: null, error: null }, // canonical job last_seen_at touch
      ]);
      const repo = new SupabaseJobRepository(client);

      const result = await repo.upsertMany([duplicateJob]);

      expect(result).toEqual({ inserted: 0, updated: 0, duplicates: 1 });
      expect(builders).toHaveLength(4);

      const [, , duplicatesBuilder, touchBuilder] = builders as [
        Record<string, ReturnType<typeof vi.fn>>,
        Record<string, ReturnType<typeof vi.fn>>,
        Record<string, ReturnType<typeof vi.fn>>,
        Record<string, ReturnType<typeof vi.fn>>,
      ];

      const duplicateUpsertCall = duplicatesBuilder.upsert!.mock.calls[0] as unknown[];
      const duplicateRows = duplicateUpsertCall[0] as Record<string, unknown>[];
      expect(duplicateRows).toEqual([
        expect.objectContaining({
          canonical_job_id: "job-1",
          source: "wellfound",
          source_job_id: "99",
          url: "https://wellfound.com/jobs/99",
        }),
      ]);
      expect(duplicateUpsertCall[1]).toEqual({ onConflict: "source,source_job_id" });

      expect(touchBuilder.update).toHaveBeenCalledWith({ last_seen_at: expect.any(String) });
      expect(touchBuilder.in).toHaveBeenCalledWith("id", ["job-1"]);
    });
  });

  describe("findUnscored", () => {
    it("uses an OR filter to exclude fully-scored and keyword-skipped jobs via set difference", async () => {
      // Three queries: (1) done IDs, (2) candidate IDs, (3) full rows for eligible IDs.
      // job-2 is "done"; job-1 is the only eligible candidate.
      const { client, builders } = queuedSupabaseClient([
        { data: [{ job_id: "job-2" }], error: null }, // Query 1: done IDs
        { data: [{ id: "job-1" }], error: null },      // Query 2: candidate IDs
        { data: [jobRow], error: null },                // Query 3: chunk fetch for job-1
      ]);
      const repo = new SupabaseJobRepository(client);

      const result = await repo.findUnscored("role-selection-1", ["React Developer", "Frontend Engineer"], 1, 0.25);

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
          lastSeenAt: "2026-06-01T00:00:00Z",
          updatedAt: "2025-12-01T00:00:00Z",
          isActive: true,
          inactiveReason: null,
          minYears: null,
          canonicalCompanyName: "Acme",
          fingerprint: "test-fingerprint",
        },
      ]);

      expect(builders).toHaveLength(3);
      const [doneBuilder, candidatesBuilder, chunkBuilder] = builders as [
        Record<string, ReturnType<typeof vi.fn>>,
        Record<string, ReturnType<typeof vi.fn>>,
        Record<string, ReturnType<typeof vi.fn>>,
      ];

      // Query 1: done IDs query uses the scoring-loop-fix OR filter.
      expect(doneBuilder.eq).toHaveBeenCalledWith("role_selection_id", "role-selection-1");
      expect(doneBuilder.eq).toHaveBeenCalledWith("resume_version", 1);
      expect(doneBuilder.or).toHaveBeenCalledWith("ai_score.not.is.null,keyword_score.lt.0.25");

      // Query 2: candidates query selects only id (no large NOT IN in URL).
      expect(candidatesBuilder.select).toHaveBeenCalledWith("id");
      expect(candidatesBuilder.eq).toHaveBeenCalledWith("is_active", true);
      expect(candidatesBuilder.or).toHaveBeenCalledWith(
        "title.ilike.%React Developer%,description.ilike.%React Developer%,title.ilike.%Frontend Engineer%,description.ilike.%Frontend Engineer%",
      );
      expect(candidatesBuilder.not).not.toHaveBeenCalled();

      // Query 3: chunk fetch uses IN, not NOT IN.
      expect(chunkBuilder.in).toHaveBeenCalledWith("id", ["job-1"]);
    });

    it("includes jobs with keyword_score >= threshold and ai_score IS NULL (AI failure retry)", async () => {
      // Jobs where the keyword gate passed but AI failed have ai_score IS NULL.
      // They are NOT in the "done" set and must be retried — they appear in
      // candidateIds and end up in eligibleIds.
      const { client, builders } = queuedSupabaseClient([
        { data: [], error: null },              // Query 1: no done rows
        { data: [{ id: "job-1" }], error: null }, // Query 2: job-1 is a candidate
        { data: [jobRow], error: null },          // Query 3: chunk returns job-1
      ]);
      const repo = new SupabaseJobRepository(client);

      const result = await repo.findUnscored("role-selection-1", ["React Developer"], 1, 0.25);

      expect(result).toEqual([expect.objectContaining({ id: "job-1" })]);
      expect(builders).toHaveLength(3);

      // The chunk builder uses IN (inclusion), never NOT IN.
      const chunkBuilder = builders[2] as Record<string, ReturnType<typeof vi.fn>>;
      expect(chunkBuilder.in).toHaveBeenCalledWith("id", ["job-1"]);
      expect(chunkBuilder.not).not.toHaveBeenCalled();
    });

    it("returns an empty array without querying when there are no expanded roles", async () => {
      const { client, builders } = queuedSupabaseClient([]);
      const repo = new SupabaseJobRepository(client);

      expect(await repo.findUnscored("role-selection-1", [], 1, 0.25)).toEqual([]);
      expect(builders).toHaveLength(0);
    });

    it("strips PostgREST .or() filter syntax characters from role names", async () => {
      // No eligible jobs — candidateIds returns empty so no chunk query fires.
      const { client, builders } = queuedSupabaseClient([
        { data: [], error: null }, // Query 1: done IDs
        { data: [], error: null }, // Query 2: candidate IDs (empty → early return)
      ]);
      const repo = new SupabaseJobRepository(client);

      await repo.findUnscored("role-selection-1", ["Engineer, Backend (Remote)"], 1, 0.25);

      expect(builders).toHaveLength(2);
      const candidatesBuilder = builders[1] as Record<string, ReturnType<typeof vi.fn>>;
      expect(candidatesBuilder.or).toHaveBeenCalledWith(
        "title.ilike.%Engineer Backend Remote%,description.ilike.%Engineer Backend Remote%",
      );
    });

    it("returns an empty array without querying when every role is sanitized to empty", async () => {
      const { client, builders } = queuedSupabaseClient([]);
      const repo = new SupabaseJobRepository(client);

      expect(await repo.findUnscored("role-selection-1", ["(),.%*"], 1, 0.25)).toEqual([]);
      expect(builders).toHaveLength(0);
    });

    it("excludes done jobs via in-memory set difference without a NOT IN URL parameter", async () => {
      // Simulates a large done set: 3 done IDs, 2 eligible IDs.
      // The candidates query returns all 5; set difference yields only the 2 eligible.
      const doneIds = ["done-1", "done-2", "done-3"];
      const eligibleJobRows = [
        { ...jobRow, id: "eligible-1" },
        { ...jobRow, id: "eligible-2" },
      ];
      const { client, builders } = queuedSupabaseClient([
        { data: doneIds.map((id) => ({ job_id: id })), error: null },           // Query 1: done IDs
        {                                                                         // Query 2: all 5 candidates
          data: [...doneIds, "eligible-1", "eligible-2"].map((id) => ({ id })),
          error: null,
        },
        { data: eligibleJobRows, error: null },                                   // Query 3: chunk for 2 eligible
      ]);
      const repo = new SupabaseJobRepository(client);

      const result = await repo.findUnscored("role-selection-1", ["React Developer"], 1, 0.25);

      expect(result.map((j) => j.id)).toEqual(["eligible-1", "eligible-2"]);
      expect(builders).toHaveLength(3);

      // Candidates query must not use NOT IN — that's the URL-bloat root cause.
      const candidatesBuilder = builders[1] as Record<string, ReturnType<typeof vi.fn>>;
      expect(candidatesBuilder.not).not.toHaveBeenCalled();

      // Chunk query receives only the eligible IDs.
      const chunkBuilder = builders[2] as Record<string, ReturnType<typeof vi.fn>>;
      expect(chunkBuilder.in).toHaveBeenCalledWith("id", ["eligible-1", "eligible-2"]);
    });

    it("splits eligible IDs into multiple chunk queries when count exceeds CHUNK_SIZE", async () => {
      // 150 eligible IDs → chunk 1 (ids 0–99) + chunk 2 (ids 100–149) = 2 chunk queries.
      const eligibleIds = Array.from({ length: 150 }, (_, i) => `job-${i}`);
      const chunkRows1 = eligibleIds.slice(0, 100).map((id) => ({ ...jobRow, id }));
      const chunkRows2 = eligibleIds.slice(100).map((id) => ({ ...jobRow, id }));
      const { client, builders } = queuedSupabaseClient([
        { data: [], error: null },                                // Query 1: no done IDs
        { data: eligibleIds.map((id) => ({ id })), error: null }, // Query 2: 150 candidates
        { data: chunkRows1, error: null },                        // Query 3: chunk 1 (100 IDs)
        { data: chunkRows2, error: null },                        // Query 4: chunk 2 (50 IDs)
      ]);
      const repo = new SupabaseJobRepository(client);

      const result = await repo.findUnscored("role-selection-1", ["React Developer"], 1, 0.25);

      expect(result).toHaveLength(150);
      // 4 builders: done, candidates, chunk-1, chunk-2.
      expect(builders).toHaveLength(4);

      const chunk1Builder = builders[2] as Record<string, ReturnType<typeof vi.fn>>;
      const chunk2Builder = builders[3] as Record<string, ReturnType<typeof vi.fn>>;
      expect(chunk1Builder.in).toHaveBeenCalledWith("id", eligibleIds.slice(0, 100));
      expect(chunk2Builder.in).toHaveBeenCalledWith("id", eligibleIds.slice(100));
    });

    it("returns an empty array and skips chunk queries when all candidates are already done", async () => {
      // All candidates are in the done set → eligibleIds is empty → no chunk query.
      const { client, builders } = queuedSupabaseClient([
        { data: [{ job_id: "job-1" }], error: null },  // Query 1: job-1 is done
        { data: [{ id: "job-1" }], error: null },       // Query 2: job-1 is the only candidate
        // No Query 3 — eligibleIds is empty after set difference.
      ]);
      const repo = new SupabaseJobRepository(client);

      const result = await repo.findUnscored("role-selection-1", ["React Developer"], 1, 0.25);

      expect(result).toEqual([]);
      expect(builders).toHaveLength(2);
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
        1,
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
      expect(builder.eq).toHaveBeenCalledWith("job_scores.resume_version", 1);
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

      const result = await repo.findForDashboard("role-selection-1", {}, 50, 1);

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

      const result = await repo.findForDashboard("role-selection-1", { minAiScore: 0.8 }, 50, 1);

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

      const result = await repo.findForDashboard("role-selection-1", {}, 1, 1);

      expect(result.hasMore).toBe(true);
      expect(result.jobs).toHaveLength(1);
    });

    it("maps the joined status and excludes Archived jobs by default", async () => {
      const { client, builders } = queuedSupabaseClient([
        { data: { id: "status-archived" }, error: null }, // statusIdByLabel(Archived)
        { data: [{ job_id: "job-9" }], error: null }, // job ids currently Archived
        {
          data: [
            {
              ...jobRow,
              job_scores: [{ keyword_score: 0.5, ai_score: 0.8, ai_reasoning: "x" }],
              job_state: [{ status_id: "s1", job_statuses: { id: "s1", label: "Applied", color: "#DCFCE7" } }],
            },
          ],
          error: null,
        },
      ]);
      const repo = new SupabaseJobRepository(client);

      const result = await repo.findForDashboard("role-selection-1", {}, 50, 1);

      expect(result.jobs).toEqual([
        expect.objectContaining({ id: "job-1", statusId: "s1", statusLabel: "Applied", statusColor: "#DCFCE7" }),
      ]);

      const mainBuilder = builders[2] as Record<string, ReturnType<typeof vi.fn>>;
      expect(mainBuilder.not).toHaveBeenCalledWith("id", "in", "(job-9)");
    });

    it("restricts to jobs in the requested statuses when statusIds is given", async () => {
      const { client, builders } = queuedSupabaseClient([
        { data: [{ job_id: "job-1" }], error: null }, // job ids in status s1
        { data: [{ ...jobRow, job_scores: [], job_state: [] }], error: null }, // main query
      ]);
      const repo = new SupabaseJobRepository(client);

      await repo.findForDashboard("role-selection-1", { statusIds: ["s1"] }, 50, 1);

      const [stateBuilder, mainBuilder] = builders as [
        Record<string, ReturnType<typeof vi.fn>>,
        Record<string, ReturnType<typeof vi.fn>>,
      ];
      expect(stateBuilder.in).toHaveBeenCalledWith("status_id", ["s1"]);
      expect(mainBuilder.in).toHaveBeenCalledWith("id", ["job-1"]);
    });

    it("returns no jobs without a main query when no job is in the requested statuses", async () => {
      const { client, builders } = queuedSupabaseClient([
        { data: [], error: null }, // no job ids in the requested statuses
      ]);
      const repo = new SupabaseJobRepository(client);

      const result = await repo.findForDashboard("role-selection-1", { statusIds: ["s1"] }, 50, 1);

      expect(result).toEqual({ jobs: [], hasMore: false });
      expect(builders).toHaveLength(1);
    });

    it("skips the Archived-exclusion lookups when includeArchived is true", async () => {
      const { client, builder } = mockSupabaseClient({
        data: [{ ...jobRow, job_scores: [], job_state: [] }],
        error: null,
      });
      const repo = new SupabaseJobRepository(client);

      await repo.findForDashboard("role-selection-1", { includeArchived: true }, 50, 1);

      expect(builder.eq).not.toHaveBeenCalledWith("label", "Archived");
    });
  });

  describe("listStatuses", () => {
    it("maps status rows ordered by sort_order", async () => {
      const { client, builder } = mockSupabaseClient({
        data: [
          { id: "s0", label: "New", color: "#E5E7EB", sort_order: 0 },
          { id: "s1", label: "Applied", color: "#DCFCE7", sort_order: 2 },
        ],
        error: null,
      });
      const repo = new SupabaseJobRepository(client);

      const result = await repo.listStatuses();

      expect(result).toEqual([
        { id: "s0", label: "New", color: "#E5E7EB", sortOrder: 0 },
        { id: "s1", label: "Applied", color: "#DCFCE7", sortOrder: 2 },
      ]);
      expect(builder.order).toHaveBeenCalledWith("sort_order", { ascending: true });
    });
  });

  describe("setJobStatus", () => {
    it("upserts a job_state row per id on conflict of job_id", async () => {
      const { client, builder } = mockSupabaseClient({ data: null, error: null });
      const repo = new SupabaseJobRepository(client);

      await repo.setJobStatus(["job-1", "job-2"], "s1");

      const upsertCall = builder.upsert!.mock.calls[0] as unknown[];
      const rows = upsertCall[0] as Record<string, unknown>[];
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ job_id: "job-1", status_id: "s1" });
      expect(rows[1]).toMatchObject({ job_id: "job-2", status_id: "s1" });
      expect(rows[0]).toHaveProperty("updated_at");
      expect(upsertCall[1]).toEqual({ onConflict: "job_id" });
    });
  });

  describe("markExpiredJobs", () => {
    it("updates active jobs older than the cutoff and returns the count", async () => {
      const { client, builder } = mockSupabaseClient({
        data: [{ id: "job-old-1" }, { id: "job-old-2" }],
        error: null,
      });
      const repo = new SupabaseJobRepository(client);

      const count = await repo.markExpiredJobs(14);

      expect(count).toBe(2);
      expect(builder.update).toHaveBeenCalledWith({ is_active: false, inactive_reason: "expired" });
      expect(builder.eq).toHaveBeenCalledWith("is_active", true);
      expect(builder.lt).toHaveBeenCalledWith("last_seen_at", expect.any(String));
      expect(builder.select).toHaveBeenCalledWith("id");
    });

    it("returns 0 when no jobs meet the expiration threshold", async () => {
      const { client } = mockSupabaseClient({ data: [], error: null });
      const repo = new SupabaseJobRepository(client);

      const count = await repo.markExpiredJobs(14);

      expect(count).toBe(0);
    });
  });
});
