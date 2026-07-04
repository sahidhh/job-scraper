import { describe, expect, it } from "vitest";
import { deriveAtsCareerPageUrl } from "./deriveAtsCareerPage";

describe("deriveAtsCareerPageUrl", () => {
  it("derives the public greenhouse careers page from a board token", () => {
    expect(deriveAtsCareerPageUrl({ source: "greenhouse", boardToken: "acme" })).toBe(
      "https://boards.greenhouse.io/acme",
    );
  });

  it("derives the public lever careers page from a board token", () => {
    expect(deriveAtsCareerPageUrl({ source: "lever", boardToken: "acme" })).toBe("https://jobs.lever.co/acme");
  });

  it("derives the public ashby careers page from a board token", () => {
    expect(deriveAtsCareerPageUrl({ source: "ashby", boardToken: "acme" })).toBe("https://jobs.ashbyhq.com/acme");
  });

  it("returns null when boardToken is null", () => {
    expect(deriveAtsCareerPageUrl({ source: "greenhouse", boardToken: null })).toBeNull();
  });

  it("returns null for sources with no career-page template (aggregators)", () => {
    expect(deriveAtsCareerPageUrl({ source: "wellfound", boardToken: null })).toBeNull();
    expect(deriveAtsCareerPageUrl({ source: "remoteok", boardToken: null })).toBeNull();
    expect(deriveAtsCareerPageUrl({ source: "mycareersfuture", boardToken: null })).toBeNull();
  });
});
