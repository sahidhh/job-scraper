import { describe, expect, it } from "vitest";
import { classifyEligibility } from "./classifyEligibility";

function makeJob(overrides: { locationRaw?: string; locationTags?: ("india" | "singapore" | "uae" | "remote")[]; description?: string }) {
  return {
    locationRaw: overrides.locationRaw ?? "Remote",
    locationTags: overrides.locationTags ?? ["remote"],
    description: overrides.description ?? "Build things with Python and TypeScript.",
  };
}

describe("classifyEligibility", () => {
  // Eligibility table row 1: remote-open (India/global/anywhere) -> KEEP
  it("keeps a remote-open job with no geo restriction", () => {
    const result = classifyEligibility(
      makeJob({
        locationRaw: "Remote (Anywhere)",
        locationTags: ["remote"],
        description: "Work from anywhere in the world. Python backend role.",
      }),
    );

    expect(result).toEqual({ eligible: true, code: null, reason: null });
  });

  // Eligibility table row 2: remote but geo-locked to a failing region -> EXCLUDE
  it("excludes a remote job geo-locked to US-only candidates", () => {
    const result = classifyEligibility(
      makeJob({
        locationRaw: "Remote (US)",
        locationTags: ["remote"],
        description: "This is a fully remote role. US residents only.",
      }),
    );

    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("us residents only");
  });

  // Eligibility table row 3: onsite + sponsorship-positive -> KEEP
  it("keeps an onsite job with a sponsorship-positive signal", () => {
    const result = classifyEligibility(
      makeJob({
        locationRaw: "Bengaluru, India",
        locationTags: ["india"],
        description: "Onsite role in Bengaluru. Visa sponsorship available for the right candidate.",
      }),
    );

    expect(result).toEqual({ eligible: true, code: null, reason: null });
  });

  // Eligibility table row 4: onsite + explicit no-sponsorship signal -> EXCLUDE
  it("excludes an onsite job with an explicit no-sponsorship signal", () => {
    const result = classifyEligibility(
      makeJob({
        locationRaw: "Austin, TX",
        locationTags: [],
        description: "Onsite in Austin. We are not able to sponsor visas for this role.",
      }),
    );

    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("not able to sponsor");
  });

  // Eligibility table row 5: onsite-silent on sponsorship -> KEEP (eligibility
  // filter never excludes silence; the scoring prompt handles this as
  // "worth reviewing at best", not the eligibility gate).
  it("keeps an onsite job that never mentions sponsorship", () => {
    const result = classifyEligibility(
      makeJob({
        locationRaw: "Singapore",
        locationTags: ["singapore"],
        description: "Onsite role in Singapore. Build backend services in Python.",
      }),
    );

    expect(result).toEqual({ eligible: true, code: null, reason: null });
  });

  it("does not exclude a job mentioning India in a 'must reside in' style phrase", () => {
    const result = classifyEligibility(
      makeJob({
        locationRaw: "Remote (India)",
        locationTags: ["remote", "india"],
        description: "Fully remote. Candidates must reside in India for this role.",
      }),
    );

    expect(result).toEqual({ eligible: true, code: null, reason: null });
  });

  it("excludes an onsite job requiring citizens-only authorization", () => {
    const result = classifyEligibility(
      makeJob({
        locationRaw: "London, UK",
        locationTags: [],
        description: "Onsite in London. UK citizens only need apply.",
      }),
    );

    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("citizens only");
  });

  // Real production example (2026-07-17): "Remote - Poland" passed the
  // phrase-list geo-lock check (no matching phrase) but is structurally
  // restricted to one country -- this is the case that motivated the
  // country-lock detection below.
  it("excludes a remote job structurally restricted to a single country via 'Remote - <Country>'", () => {
    const result = classifyEligibility(
      makeJob({
        locationRaw: "Remote - Poland",
        locationTags: ["remote"],
        description: "Fully remote role, building backend services in Python.",
      }),
    );

    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("Remote - Poland");
    expect(result.reason).toContain("poland");
  });

  it("excludes a remote job restricted via 'Remote (<Country>)' parenthesized form", () => {
    const result = classifyEligibility(
      makeJob({
        locationRaw: "Remote (Germany)",
        locationTags: ["remote"],
        description: "Fully remote role.",
      }),
    );

    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("germany");
  });

  it("does not exclude 'Remote - Poland or India' since India is explicitly included", () => {
    const result = classifyEligibility(
      makeJob({
        locationRaw: "Remote - Poland or India",
        locationTags: ["remote", "india"],
        description: "Fully remote role.",
      }),
    );

    expect(result).toEqual({ eligible: true, code: null, reason: null });
  });

  it("does not exclude 'Remote (Worldwide)' or other generic-open qualifiers", () => {
    const result = classifyEligibility(
      makeJob({
        locationRaw: "Remote (Worldwide)",
        locationTags: ["remote"],
        description: "Fully remote role.",
      }),
    );

    expect(result).toEqual({ eligible: true, code: null, reason: null });
  });

  it("does not exclude a bare 'Remote' locationRaw with no qualifier", () => {
    const result = classifyEligibility(
      makeJob({
        locationRaw: "Remote",
        locationTags: ["remote"],
        description: "Fully remote role.",
      }),
    );

    expect(result).toEqual({ eligible: true, code: null, reason: null });
  });

  it("does not exclude a region name outside the curated country list (e.g. EMEA)", () => {
    const result = classifyEligibility(
      makeJob({
        locationRaw: "Remote - EMEA",
        locationTags: ["remote"],
        description: "Fully remote role.",
      }),
    );

    expect(result).toEqual({ eligible: true, code: null, reason: null });
  });

  it("does not match a country name buried inside a longer free-form locationRaw that doesn't start with 'Remote'", () => {
    const result = classifyEligibility(
      makeJob({
        locationRaw: "San Francisco, CA, New York, NY, Portland, OR, or Remote within Canada or United States",
        locationTags: ["remote"],
        description: "Backend role.",
      }),
    );

    expect(result).toEqual({ eligible: true, code: null, reason: null });
  });

  it("does not false-match 'us'/'uk' short codes inside unrelated country names (Russia, Ukraine)", () => {
    const russia = classifyEligibility(
      makeJob({ locationRaw: "Remote - Russia", locationTags: ["remote"], description: "Fully remote role." }),
    );
    // Russia itself isn't in the curated list, so this stays eligible --
    // the point of this test is that it must NOT be excluded via a stray
    // "us" substring match inside "Russia".
    expect(russia).toEqual({ eligible: true, code: null, reason: null });
  });

  it("treats hybrid postings as onsite for the sponsorship check", () => {
    const result = classifyEligibility(
      makeJob({
        locationRaw: "New York, NY (Hybrid)",
        locationTags: [],
        description: "Hybrid role, 3 days in office. Must have work authorization; we do not sponsor visas.",
      }),
    );

    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("do not sponsor");
  });
});
