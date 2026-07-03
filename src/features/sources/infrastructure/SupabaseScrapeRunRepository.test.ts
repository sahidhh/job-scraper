import { describe, expect, it } from "vitest";
import { mockSupabaseClient } from "@/shared/infrastructure/testing/supabaseQueryMock";
import type { Database } from "../../../../supabase/database.types";
import { SupabaseScrapeRunRepository } from "./SupabaseScrapeRunRepository";

type ScrapeRunRow = Database["public"]["Tables"]["scrape_runs"]["Row"];

const row: ScrapeRunRow = {
  id: "run-1",
  source: "greenhouse",
  status: "success",
  found_count: 12,
  kept_count: 8,
  inserted_count: 3,
  updated_count: 5,
  duplicate_count: 1,
  failed_count: 0,
  failure_category: null,
  started_at: "2026-01-01T00:00:00Z",
  completed_at: "2026-01-01T00:00:01Z",
  duration_ms: 1000,
  error: null,
  metadata: null,
  run_at: "2026-01-01T00:00:00Z",
};

describe("SupabaseScrapeRunRepository", () => {
  it("recordRun inserts a row with all metric fields", async () => {
    const { client, builder } = mockSupabaseClient({ data: null, error: null });
    const repo = new SupabaseScrapeRunRepository(client);

    await repo.recordRun({
      source: "greenhouse",
      status: "success",
      foundCount: 12,
      keptCount: 8,
      insertedCount: 3,
      updatedCount: 5,
      duplicateCount: 1,
      failedCount: 0,
      failureCategory: "empty_feed",
      startedAt: "2026-01-01T00:00:00Z",
      completedAt: "2026-01-01T00:00:01Z",
      durationMs: 1000,
    });

    expect(builder.insert).toHaveBeenCalledWith({
      source: "greenhouse",
      status: "success",
      found_count: 12,
      kept_count: 8,
      inserted_count: 3,
      updated_count: 5,
      duplicate_count: 1,
      failed_count: 0,
      failure_category: "empty_feed",
      started_at: "2026-01-01T00:00:00Z",
      completed_at: "2026-01-01T00:00:01Z",
      duration_ms: 1000,
      error: null,
      metadata: null,
    });
  });

  it("recordRun defaults optional metric fields to null/0", async () => {
    const { client, builder } = mockSupabaseClient({ data: null, error: null });
    const repo = new SupabaseScrapeRunRepository(client);

    await repo.recordRun({ source: "greenhouse", status: "failed", foundCount: 0 });

    expect(builder.insert).toHaveBeenCalledWith({
      source: "greenhouse",
      status: "failed",
      found_count: 0,
      kept_count: null,
      inserted_count: null,
      updated_count: null,
      duplicate_count: null,
      failed_count: 0,
      failure_category: null,
      started_at: null,
      completed_at: null,
      duration_ms: null,
      error: null,
      metadata: null,
    });
  });

  it("listRecent orders by run_at desc and maps all metric fields", async () => {
    const { client, builder } = mockSupabaseClient({ data: [row], error: null });
    const repo = new SupabaseScrapeRunRepository(client);

    const result = await repo.listRecent(10);

    expect(result).toEqual([
      {
        id: "run-1",
        source: "greenhouse",
        status: "success",
        foundCount: 12,
        keptCount: 8,
        insertedCount: 3,
        updatedCount: 5,
        duplicateCount: 1,
        failedCount: 0,
        failureCategory: null,
        startedAt: "2026-01-01T00:00:00Z",
        completedAt: "2026-01-01T00:00:01Z",
        durationMs: 1000,
        error: null,
        metadata: null,
        runAt: "2026-01-01T00:00:00Z",
      },
    ]);
    expect(builder.order).toHaveBeenCalledWith("run_at", { ascending: false });
    expect(builder.limit).toHaveBeenCalledWith(10);
  });

  it("listRecentBySource filters by source, orders by run_at desc, and maps rows", async () => {
    const { client, builder } = mockSupabaseClient({ data: [row], error: null });
    const repo = new SupabaseScrapeRunRepository(client);

    const result = await repo.listRecentBySource("greenhouse", 20);

    expect(result).toEqual([expect.objectContaining({ id: "run-1", source: "greenhouse" })]);
    expect(builder.eq).toHaveBeenCalledWith("source", "greenhouse");
    expect(builder.order).toHaveBeenCalledWith("run_at", { ascending: false });
    expect(builder.limit).toHaveBeenCalledWith(20);
  });
});
