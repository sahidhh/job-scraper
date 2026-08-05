import { describe, expect, it } from "vitest";
import type { NormalizedJob } from "@/features/jobs/domain/types";
import { buildUpsertSql, sqlLocationTagArray, sqlString } from "./print-manual-matches-sql";

function makeJob(overrides: Partial<NormalizedJob> = {}): NormalizedJob {
  return {
    source: "claude_routine",
    sourceJobId: "job-1",
    companyId: null,
    companyName: "Acme",
    title: "Backend Engineer",
    locationRaw: "Chennai, India",
    locationTags: ["india"],
    description: "5 YOE",
    url: "https://example.com/jobs/1",
    postedAt: null,
    manualScore: 88,
    manualStandout: null,
    manualVerify: null,
    manualRequirements: null,
    ...overrides,
  };
}

describe("sqlString", () => {
  it("escapes single quotes", () => {
    expect(sqlString("O'Brien's Devs")).toBe("'O''Brien''s Devs'");
  });

  it("renders null as SQL null, not a quoted string", () => {
    expect(sqlString(null)).toBe("null");
  });
});

describe("sqlLocationTagArray", () => {
  it("renders an empty array as the empty location_tag[] literal", () => {
    expect(sqlLocationTagArray([])).toBe("'{}'::location_tag[]");
  });

  it("renders multiple tags as a cast ARRAY literal", () => {
    expect(sqlLocationTagArray(["india", "remote"])).toBe("ARRAY['india', 'remote']::location_tag[]");
  });
});

describe("buildUpsertSql", () => {
  it("throws on an empty job list rather than emitting invalid SQL", () => {
    expect(() => buildUpsertSql([])).toThrow(/no jobs/);
  });

  it("upserts on (source, source_job_id) and escapes embedded quotes", () => {
    const sql = buildUpsertSql([makeJob({ title: "Dev's Role" })]);

    expect(sql).toContain("on conflict (source, source_job_id) do update set");
    expect(sql).toContain("'Dev''s Role'");
    expect(sql).toContain("'claude_routine'");
  });

  it("includes one VALUES row per job", () => {
    const sql = buildUpsertSql([makeJob({ sourceJobId: "job-1" }), makeJob({ sourceJobId: "job-2" })]);

    expect(sql.match(/\('claude_routine'/g)).toHaveLength(2);
  });
});
