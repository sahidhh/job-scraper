import { describe, expect, it } from "vitest";
import {
  AI_SCORE_MODERATE,
  AI_SCORE_STRONG,
  formatScore,
  pendingScoreLabel,
  scoreBadgeVariant,
} from "./jobScore";

describe("formatScore", () => {
  it("renders a fraction as a whole percentage", () => {
    expect(formatScore(0.83)).toBe("83%");
    expect(formatScore(1)).toBe("100%");
    expect(formatScore(0)).toBe("0%");
  });

  it("renders an em dash when there is no score", () => {
    expect(formatScore(null)).toBe("—");
  });
});

describe("scoreBadgeVariant", () => {
  // Bands are fixed by docs/decisions.md AD-56 -- 0.75 is NOTIFY_THRESHOLD.
  it("keeps the AD-56 bands", () => {
    expect(AI_SCORE_STRONG).toBe(0.75);
    expect(AI_SCORE_MODERATE).toBe(0.4);
  });

  it("is success at and above 0.75", () => {
    expect(scoreBadgeVariant(0.75)).toBe("success");
    expect(scoreBadgeVariant(0.99)).toBe("success");
  });

  it("is warning from 0.40 up to but not including 0.75", () => {
    expect(scoreBadgeVariant(0.4)).toBe("warning");
    expect(scoreBadgeVariant(0.74)).toBe("warning");
  });

  it("is outline below 0.40", () => {
    expect(scoreBadgeVariant(0.39)).toBe("outline");
    expect(scoreBadgeVariant(0)).toBe("outline");
  });
});

describe("pendingScoreLabel", () => {
  it("carries the keyword score inline", () => {
    expect(pendingScoreLabel(0.42)).toBe("Pending · 42%");
  });

  it("is bare Pending when there is no keyword score either", () => {
    expect(pendingScoreLabel(null)).toBe("Pending");
  });
});
