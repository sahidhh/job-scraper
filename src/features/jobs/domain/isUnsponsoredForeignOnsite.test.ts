import { describe, expect, it } from "vitest";
import { isUnsponsoredForeignOnsite } from "./isUnsponsoredForeignOnsite";

describe("isUnsponsoredForeignOnsite", () => {
  it("matches a UAE onsite job that explicitly refuses sponsorship", () => {
    expect(isUnsponsoredForeignOnsite({ locationTags: ["uae"], visaSponsorship: false })).toBe(true);
  });

  it("matches a Singapore onsite job that explicitly refuses sponsorship", () => {
    expect(isUnsponsoredForeignOnsite({ locationTags: ["singapore"], visaSponsorship: false })).toBe(true);
  });

  it("keeps a foreign job that never mentions sponsorship", () => {
    // The whole point of the lenient rule: UAE employers sponsor by default
    // and rarely say so, so unknown must never be treated as a refusal.
    expect(isUnsponsoredForeignOnsite({ locationTags: ["uae"], visaSponsorship: null })).toBe(false);
  });

  it("keeps a foreign job that explicitly offers sponsorship", () => {
    expect(isUnsponsoredForeignOnsite({ locationTags: ["uae"], visaSponsorship: true })).toBe(false);
  });

  it("keeps an India job regardless of the sponsorship signal", () => {
    expect(isUnsponsoredForeignOnsite({ locationTags: ["india"], visaSponsorship: false })).toBe(false);
  });

  it("keeps a remote job even when it is also tagged with a foreign location", () => {
    // Remote is workable from India, so no visa is needed and the posting's
    // "no sponsorship" line is irrelevant.
    expect(isUnsponsoredForeignOnsite({ locationTags: ["uae", "remote"], visaSponsorship: false })).toBe(false);
  });

  it("keeps a job with no sponsorship field at all", () => {
    expect(isUnsponsoredForeignOnsite({ locationTags: ["uae"] })).toBe(false);
  });
});
