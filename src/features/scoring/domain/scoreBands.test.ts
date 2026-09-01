import { describe, expect, it } from "vitest";
import { AI_SCORE_MODERATE, AI_SCORE_SHRUG, AI_SCORE_STRONG, isAboveShrug } from "./scoreBands";

describe("scoreBands", () => {
  it("pins the band values fixed by AD-56", () => {
    // 0.75 is NOTIFY_THRESHOLD -- a green badge has to mean "this would have
    // pinged you". Retuning either needs the decision record amended first.
    expect(AI_SCORE_STRONG).toBe(0.75);
    expect(AI_SCORE_MODERATE).toBe(0.4);
  });

  it("pins the shrug value separately from the moderate band even though they coincide", () => {
    // They are equal today and mean different things: one is where a badge
    // turns amber, the other is the score the model emits when it declines to
    // judge (AD-69). A future re-measure moves one without the other, so
    // neither may be defined in terms of the other.
    expect(AI_SCORE_SHRUG).toBe(0.4);
  });

  it("treats the shrug value itself as not-above -- the cut is >, not >=", () => {
    // The whole point: 47% of the scored set sits on exactly this value, so a
    // >= cut would admit every one of them and filter nothing.
    expect(isAboveShrug(AI_SCORE_SHRUG)).toBe(false);
    expect(isAboveShrug(0.45)).toBe(true);
    expect(isAboveShrug(0.35)).toBe(false);
  });

  it("treats an unscored job as not weak -- absence of judgement is not a bad judgement", () => {
    expect(isAboveShrug(null)).toBe(true);
  });
});
