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

  it("returns null when no years pattern present", () => {
    expect(parseMinYears("Senior Software Engineer, strong communication skills")).toBeNull();
  });

  it("does not match unrelated numbers like 'React 18'", () => {
    expect(parseMinYears("React 18, Top 5 company, great culture")).toBeNull();
  });

  it("does not match standalone 'Senior' keyword", () => {
    expect(parseMinYears("Senior Developer required")).toBeNull();
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
});
