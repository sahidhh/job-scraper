import { describe, expect, it } from "vitest";
import { parseMinYears } from "./parseMinYears";

describe("parseMinYears", () => {
  // --- basic patterns ---
  it("parses '5+ years'", () => {
    expect(parseMinYears("5+ years experience required")).toBe(5);
  });

  it("parses '3-5 years' as the minimum (3)", () => {
    expect(parseMinYears("Looking for 3-5 years of experience")).toBe(3);
  });

  it("parses 'minimum 4 years'", () => {
    expect(parseMinYears("minimum 4 years of experience")).toBe(4);
  });

  it("parses 'at least 4 years'", () => {
    expect(parseMinYears("at least 4 years in the field")).toBe(4);
  });

  it("parses '4 yrs'", () => {
    expect(parseMinYears("4 yrs experience")).toBe(4);
  });

  it("parses '10 years'", () => {
    expect(parseMinYears("10 years of software development")).toBe(10);
  });

  // --- unit variants ---
  it("accepts 'year' singular", () => {
    expect(parseMinYears("1 year experience")).toBe(1);
  });

  it("accepts 'yr' singular", () => {
    expect(parseMinYears("2 yr experience")).toBe(2);
  });

  // --- case insensitivity ---
  it("is case-insensitive for 'Years'", () => {
    expect(parseMinYears("5+ Years Experience")).toBe(5);
  });

  it("is case-insensitive for 'YRS'", () => {
    expect(parseMinYears("3 YRS experience")).toBe(3);
  });

  // --- null cases ---
  it("returns null for empty string", () => {
    expect(parseMinYears("")).toBeNull();
  });

  it("returns null when no years pattern and no seniority label present", () => {
    expect(parseMinYears("Software Engineer, strong communication skills")).toBeNull();
  });

  it("does not match unrelated numbers like 'React 18'", () => {
    expect(parseMinYears("React 18, Top 5 company, great culture")).toBeNull();
  });

  // NOTE: "Senior Developer required" previously expected null (numeric-only
  // implementation). With the seniority-label fallback, "senior" now maps to 5.
  it("maps standalone 'Senior' keyword to 5 via seniority fallback", () => {
    expect(parseMinYears("Senior Developer required")).toBe(5);
  });

  // --- clamping ---
  it("ignores matches > 20", () => {
    expect(parseMinYears("25 years experience")).toBeNull();
  });

  it("ignores negative matches (edge: '0 years' is ok)", () => {
    expect(parseMinYears("0 years experience")).toBe(0);
  });

  it("ignores the out-of-range value in a range like '21-25 years' and returns null", () => {
    expect(parseMinYears("21-25 years experience")).toBeNull();
  });

  // --- multiple matches -> smallest ---
  it("returns smallest when multiple valid matches exist", () => {
    expect(
      parseMinYears("2+ years frontend; 5+ years overall engineering experience"),
    ).toBe(2);
  });

  it("returns smallest from a mix of range and direct", () => {
    expect(parseMinYears("3-5 years backend, 1+ years scripting")).toBe(1);
  });

  // --- boundary ---
  it("accepts exactly 20 years", () => {
    expect(parseMinYears("20 years experience")).toBe(20);
  });

  it("returns null for 21 years (just above clamp)", () => {
    expect(parseMinYears("21 years experience")).toBeNull();
  });

  // --- seniority label fallback ---

  // entry-level / junior → 0
  it("maps 'entry level' to 0", () => {
    expect(parseMinYears("Entry Level Software Engineer\nGreat opportunity")).toBe(0);
  });

  it("maps 'entry-level' (hyphenated) to 0", () => {
    expect(parseMinYears("Entry-Level Developer\nNo experience needed")).toBe(0);
  });

  it("maps 'junior' to 0", () => {
    expect(parseMinYears("Junior Frontend Engineer\nBootcamp grads welcome")).toBe(0);
  });

  it("maps 'jr.' abbreviation to 0", () => {
    expect(parseMinYears("Jr. Developer\nFun role")).toBe(0);
  });

  it("maps 'jr' (no dot) to 0", () => {
    expect(parseMinYears("Jr Software Engineer\nExciting startup")).toBe(0);
  });

  // mid-level → 3
  it("maps 'mid-level' to 3", () => {
    expect(parseMinYears("Mid-Level Engineer\nSolid team")).toBe(3);
  });

  it("maps 'mid level' (spaced) to 3", () => {
    expect(parseMinYears("Mid Level Backend Developer\nRemote role")).toBe(3);
  });

  it("maps 'mid senior' to 3", () => {
    expect(parseMinYears("Mid Senior Engineer\nHybrid")).toBe(3);
  });

  // senior → 5
  it("maps 'Senior' title to 5", () => {
    expect(parseMinYears("Senior Engineer\nNo experience mentioned")).toBe(5);
  });

  it("maps 'sr.' abbreviation to 5", () => {
    expect(parseMinYears("Sr. Software Engineer\nGreat benefits")).toBe(5);
  });

  it("maps 'sr' (no dot) to 5", () => {
    expect(parseMinYears("Sr Software Engineer\nGreat benefits")).toBe(5);
  });

  // lead → 7
  it("maps 'Lead' title to 7", () => {
    expect(parseMinYears("Lead Engineer\nScaling team")).toBe(7);
  });

  it("maps 'Tech Lead' to 7", () => {
    expect(parseMinYears("Tech Lead\nArchitecture decisions")).toBe(7);
  });

  it("maps 'Team Lead' to 7", () => {
    expect(parseMinYears("Team Lead Software Engineer\nPeople management")).toBe(7);
  });

  // staff → 8
  it("maps 'Staff' (job level) to 8", () => {
    expect(parseMinYears("Staff Engineer\nHigh impact role")).toBe(8);
  });

  it("maps 'Staff Software Engineer' to 8", () => {
    expect(parseMinYears("Staff Software Engineer\nSystems work")).toBe(8);
  });

  // principal → 10
  it("maps 'Principal' title to 10", () => {
    expect(parseMinYears("Principal Engineer\nStrategic role")).toBe(10);
  });

  it("maps 'Principal Software Engineer' to 10", () => {
    expect(parseMinYears("Principal Software Engineer\nDeep technical")).toBe(10);
  });

  // --- title-first priority ---
  it("uses title segment over description for seniority", () => {
    // Title says Senior → 5; description has no numeric years
    expect(parseMinYears("Senior Engineer\nNo experience mentioned")).toBe(5);
  });

  it("falls back to description when title has no seniority label", () => {
    // Title is generic, body has senior label
    expect(parseMinYears("Software Engineer\nThis is a senior role")).toBe(5);
  });

  // --- numeric overrides seniority ---
  it("numeric years overrides seniority label", () => {
    // Senior → 5 but numeric says 3
    expect(parseMinYears("Senior Engineer\n3+ years experience required")).toBe(3);
  });

  it("numeric overrides principal seniority", () => {
    // Principal → 10 but explicit numeric is 8
    expect(parseMinYears("Principal Software Engineer\n8+ years required")).toBe(8);
  });

  // --- no false matches ---
  it("does not match 'leadership' as 'lead'", () => {
    expect(parseMinYears("Leadership skills required")).toBeNull();
  });

  it("does not match 'Assistant Manager' as any seniority label", () => {
    expect(parseMinYears("Assistant Manager")).toBeNull();
  });

  // --- edge cases ---
  it("edge: 'Jr. Developer' → 0", () => {
    expect(parseMinYears("Jr. Developer")).toBe(0);
  });

  it("highest seniority label wins when title contains multiple (Senior Principal → 10)", () => {
    expect(parseMinYears("Senior Principal Engineer\nDeep technical work")).toBe(10);
  });
});
