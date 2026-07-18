import { describe, expect, it, vi } from "vitest";
import type { ScrapeRunRepository } from "@/features/sources/domain/ScrapeRunRepository";
import type { ScrapeRun } from "@/features/sources/domain/types";
import { getSourceHealthReport } from "./getSourceHealthReport";

function makeRun(overrides: Partial<ScrapeRun> = {}): ScrapeRun {
  return {
    id: "run-1",
    source: "greenhouse",
    status: "success",
    foundCount: 10,
    keptCount: 8,
    insertedCount: 5,
    updatedCount: 3,
    duplicateCount: 0,
    failedCount: 0,
    failureCategory: null,
    startedAt: "2026-01-01T00:00:00Z",
    completedAt: "2026-01-01T00:00:01Z",
    durationMs: 1000,
    error: null,
    metadata: null,
    runAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("getSourceHealthReport", () => {
  it("returns one summary per registered source, queried independently", async () => {
    const scrapeRunRepository: ScrapeRunRepository = {
      recordRun: vi.fn(),
      listRecent: vi.fn(),
      listRecentBySource: vi.fn().mockImplementation((source: string) => Promise.resolve([makeRun({ source: source as never })])),
    };

    const report = await getSourceHealthReport(scrapeRunRepository);

    expect(report).toHaveLength(10);
    expect(report.map((r) => r.source).sort()).toEqual(
      ["adzuna", "ashby", "greenhouse", "himalayas", "jsearch", "lever", "mycareersfuture", "remoteok", "remotive", "wellfound"].sort(),
    );
    expect(scrapeRunRepository.listRecentBySource).toHaveBeenCalledWith("greenhouse", 20);
    expect(scrapeRunRepository.listRecentBySource).toHaveBeenCalledTimes(10);
  });

  it("honors a custom run window", async () => {
    const scrapeRunRepository: ScrapeRunRepository = {
      recordRun: vi.fn(),
      listRecent: vi.fn(),
      listRecentBySource: vi.fn().mockResolvedValue([]),
    };

    await getSourceHealthReport(scrapeRunRepository, 5);

    expect(scrapeRunRepository.listRecentBySource).toHaveBeenCalledWith("greenhouse", 5);
  });
});
