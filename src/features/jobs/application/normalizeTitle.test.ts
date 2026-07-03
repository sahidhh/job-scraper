import { describe, expect, it } from "vitest";
import { normalizeTitle } from "./normalizeTitle";

describe("normalizeTitle", () => {
  it("collapses seniority variants of the same title to one canonical form", () => {
    const canonical = normalizeTitle("Backend Engineer");
    expect(normalizeTitle("Senior Backend Engineer")).toBe(canonical);
    expect(normalizeTitle("Backend Engineer - Senior")).toBe(canonical);
    expect(normalizeTitle("Sr Backend Engineer")).toBe(canonical);
  });

  it("lowercases and strips punctuation", () => {
    expect(normalizeTitle("Full-Stack Engineer (Remote)")).toBe("full stack engineer remote");
  });

  it("collapses repeated whitespace", () => {
    expect(normalizeTitle("Backend   Engineer")).toBe("backend engineer");
  });

  it("expands common abbreviations", () => {
    expect(normalizeTitle("QA Eng")).toBe("quality assurance engineer");
  });

  it("returns an empty string for a title that is only seniority noise", () => {
    expect(normalizeTitle("Senior")).toBe("");
  });
});
