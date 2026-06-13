import { describe, expect, it } from "vitest";
import { mockSupabaseClient } from "@/shared/infrastructure/testing/supabaseQueryMock";
import type { Database } from "../../../../supabase/database.types";
import { SupabaseScrapeRunRepository } from "./SupabaseScrapeRunRepository";

type ScrapeRunRow = Database["public"]["Tables"]["scrape_runs"]["Row"];

const row: ScrapeRunRow = {
  id: "run-1",
  source: "greenhouse",
  status: "success",
  jobs_found: 12,
  error: null,
  run_at: "2026-01-01T00:00:00Z",
};

describe("SupabaseScrapeRunRepository", () => {
  it("recordRun inserts a row with error defaulted to null", async () => {
    const { client, builder } = mockSupabaseClient({ data: null, error: null });
    const repo = new SupabaseScrapeRunRepository(client);

    await repo.recordRun({ source: "greenhouse", status: "success", jobsFound: 12 });

    expect(builder.insert).toHaveBeenCalledWith({
      source: "greenhouse",
      status: "success",
      jobs_found: 12,
      error: null,
    });
  });

  it("listRecent orders by run_at desc and maps rows", async () => {
    const { client, builder } = mockSupabaseClient({ data: [row], error: null });
    const repo = new SupabaseScrapeRunRepository(client);

    const result = await repo.listRecent(10);

    expect(result).toEqual([
      {
        id: "run-1",
        source: "greenhouse",
        status: "success",
        jobsFound: 12,
        error: null,
        runAt: "2026-01-01T00:00:00Z",
      },
    ]);
    expect(builder.order).toHaveBeenCalledWith("run_at", { ascending: false });
    expect(builder.limit).toHaveBeenCalledWith(10);
  });
});
