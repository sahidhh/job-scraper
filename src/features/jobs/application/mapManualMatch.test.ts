import { describe, expect, it } from "vitest";
import { type ManualMatchEntry, mapManualMatch } from "./mapManualMatch";

function makeEntry(overrides: Partial<ManualMatchEntry> = {}): ManualMatchEntry {
  return {
    id: "job-1",
    title: "Backend Engineer",
    company: "Acme",
    location: "Bengaluru, India",
    score: 88,
    link: "https://example.com/jobs/1",
    ...overrides,
  };
}

describe("mapManualMatch", () => {
  it("maps a full entry to a NormalizedJob-shaped insert", () => {
    const entry = makeEntry({ standout: "Great team", verify: "Confirm remote policy", requirements: "5 YOE" });

    const result = mapManualMatch(entry);

    expect(result).toEqual({
      source: "claude_routine",
      sourceJobId: "job-1",
      companyId: null,
      companyName: "Acme",
      title: "Backend Engineer",
      locationRaw: "Bengaluru, India",
      locationTags: ["india"],
      description: "5 YOE",
      url: "https://example.com/jobs/1",
      postedAt: null,
      manualScore: 88,
      manualStandout: "Great team",
      manualVerify: "Confirm remote policy",
      manualRequirements: "5 YOE",
    });
  });

  it("leaves manual narrative fields null when absent", () => {
    const result = mapManualMatch(makeEntry());

    expect(result.manualStandout).toBeNull();
    expect(result.manualVerify).toBeNull();
    expect(result.manualRequirements).toBeNull();
    expect(result.description).toBe("");
  });

  it("throws on missing id", () => {
    expect(() => mapManualMatch(makeEntry({ id: "" }))).toThrow(/id\/title\/company/);
  });

  it("throws on missing title", () => {
    expect(() => mapManualMatch(makeEntry({ title: "" }))).toThrow(/id\/title\/company/);
  });

  it("throws on missing company", () => {
    expect(() => mapManualMatch(makeEntry({ company: "" }))).toThrow(/id\/title\/company/);
  });
});
