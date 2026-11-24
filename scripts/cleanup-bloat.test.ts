import { describe, expect, it } from "vitest";
import {
  parseCleanupMode,
  partitionBloatJobs,
  type CleanupJobRow,
  type ProtectedIds,
} from "./cleanup-bloat";

const NOW = new Date("2026-11-24T00:00:00Z");
const RECENT = "2026-11-20T00:00:00Z";
const OLD = "2026-11-01T00:00:00Z";
const ROLES = ["Backend Engineer", "Software Engineer"];

function makeJob(overrides: Partial<CleanupJobRow> = {}): CleanupJobRow {
  return {
    id: "job-1",
    title: "Backend Engineer",
    source: "greenhouse",
    min_years: 2,
    is_active: true,
    first_seen_at: RECENT,
    posted_at: RECENT,
    ...overrides,
  };
}

function emptyProtected(): ProtectedIds {
  return {
    jobStateIds: new Set(),
    applicationIds: new Set(),
    notificationIds: new Set(),
  };
}

describe("parseCleanupMode", () => {
  it("defaults to dry-run when --execute is not passed", () => {
    expect(parseCleanupMode([])).toEqual({ execute: false });
    expect(parseCleanupMode(["--dry-run"])).toEqual({ execute: false });
  });

  it("enables execute mode only when --execute is passed", () => {
    expect(parseCleanupMode(["--execute"])).toEqual({ execute: true });
  });
});

describe("partitionBloatJobs", () => {
  it("preserves all jobs referenced in job_state, applications, notifications_log, or routine_agent", () => {
    const jobs: CleanupJobRow[] = [
      makeJob({ id: "state-bloat", min_years: 8, title: "VP of Sales", first_seen_at: OLD }),
      makeJob({ id: "app-bloat", min_years: 10, title: "Account Executive", first_seen_at: OLD }),
      makeJob({ id: "notif-bloat", min_years: 6, title: "Product Manager", first_seen_at: OLD }),
      makeJob({ id: "routine-bloat", source: "routine_agent", min_years: 7, title: "Sales Lead" }),
    ];

    const protectedIds: ProtectedIds = {
      jobStateIds: new Set(["state-bloat"]),
      applicationIds: new Set(["app-bloat"]),
      notificationIds: new Set(["notif-bloat"]),
    };

    const result = partitionBloatJobs(jobs, protectedIds, ROLES, { now: NOW });

    expect(result.preservedIds).toEqual([
      "state-bloat",
      "app-bloat",
      "notif-bloat",
      "routine-bloat",
    ]);
    expect(result.toDeleteIds).toEqual([]);
    expect(result.toArchiveIds).toEqual([]);
  });

  it("selects untouched rows with min_years > 3 or non-matching titles for deletion", () => {
    const jobs: CleanupJobRow[] = [
      makeJob({ id: "senior-role", min_years: 5 }),
      makeJob({ id: "non-matching-role", title: "Account Executive", min_years: 1 }),
      makeJob({ id: "matching-junior", title: "Backend Engineer", min_years: 2 }),
      makeJob({ id: "matching-null-years", title: "Software Engineer", min_years: null }),
    ];

    const result = partitionBloatJobs(jobs, emptyProtected(), ROLES, { now: NOW });

    expect(result.toDeleteIds).toEqual(["senior-role", "non-matching-role"]);
    expect(result.toArchiveIds).toEqual([]);
    expect(result.preservedIds).toEqual([]);
  });

  it("archives untouched active rows older than maxAgeDays and is idempotent once archived", () => {
    const jobs: CleanupJobRow[] = [
      makeJob({ id: "old-active", first_seen_at: OLD, posted_at: OLD, is_active: true }),
      makeJob({ id: "old-already-archived", first_seen_at: OLD, posted_at: OLD, is_active: false }),
      makeJob({ id: "recent-active", first_seen_at: RECENT, posted_at: RECENT, is_active: true }),
    ];

    const result = partitionBloatJobs(jobs, emptyProtected(), ROLES, {
      maxAgeDays: 14,
      now: NOW,
    });

    expect(result.toDeleteIds).toEqual([]);
    expect(result.toArchiveIds).toEqual(["old-active"]);
  });
});
