import { describe, expect, it } from "vitest";
import type { LocationTag } from "@/shared/domain/enums";
import { UNCONFIRMED_SPONSORSHIP_AI_CEILING, capAiScoreForEligibility } from "./capAiScore";

function job(locationTags: LocationTag[]): { locationTags: readonly LocationTag[] } {
  return { locationTags };
}

describe("capAiScoreForEligibility", () => {
  it("caps a high-scoring onsite Singapore role with unconfirmed sponsorship", () => {
    const result = capAiScoreForEligibility(job(["singapore"]), 1.0, false);
    expect(result.score).toBe(UNCONFIRMED_SPONSORSHIP_AI_CEILING);
    expect(result.capReason).toContain("without confirmed visa sponsorship");
    expect(result.capReason).toContain("singapore");
  });

  it("caps a high-scoring onsite UAE role with unconfirmed sponsorship", () => {
    const result = capAiScoreForEligibility(job(["uae"]), 0.9, false);
    expect(result.score).toBe(UNCONFIRMED_SPONSORSHIP_AI_CEILING);
    expect(result.capReason).toContain("uae");
  });

  it("does NOT cap when the posting confirms sponsorship", () => {
    const result = capAiScoreForEligibility(job(["singapore"]), 0.9, true);
    expect(result.score).toBe(0.9);
    expect(result.capReason).toBeNull();
  });

  it("does NOT cap a remote role (geo-lock is handled elsewhere)", () => {
    const result = capAiScoreForEligibility(job(["remote"]), 0.9, false);
    expect(result.score).toBe(0.9);
    expect(result.capReason).toBeNull();
  });

  it("does NOT cap an onsite India role (no sponsorship needed -- safety net)", () => {
    const result = capAiScoreForEligibility(job(["india"]), 0.9, false);
    expect(result.score).toBe(0.9);
    expect(result.capReason).toBeNull();
  });

  it("does NOT cap a Singapore role that also carries an India fallback tag", () => {
    // A multi-location "India / Singapore" posting: the candidate can take the
    // India-onsite version with no sponsorship, so it must not be capped.
    const result = capAiScoreForEligibility(job(["india", "singapore"]), 0.9, false);
    expect(result.score).toBe(0.9);
    expect(result.capReason).toBeNull();
  });

  it("does NOT cap a foreign-onsite role already at or below the ceiling", () => {
    const atCeiling = capAiScoreForEligibility(job(["singapore"]), UNCONFIRMED_SPONSORSHIP_AI_CEILING, false);
    expect(atCeiling.score).toBe(UNCONFIRMED_SPONSORSHIP_AI_CEILING);
    expect(atCeiling.capReason).toBeNull();

    const below = capAiScoreForEligibility(job(["singapore"]), 0.25, false);
    expect(below.score).toBe(0.25);
    expect(below.capReason).toBeNull();
  });

  it("does NOT cap when location is unknown (no foreign tag to key off)", () => {
    // An untagged onsite role can't be proven to need sponsorship, so it passes
    // through -- conservative, matching classifyEligibility's explicit-signal-only
    // philosophy.
    const result = capAiScoreForEligibility(job([]), 0.9, false);
    expect(result.score).toBe(0.9);
    expect(result.capReason).toBeNull();
  });
});
