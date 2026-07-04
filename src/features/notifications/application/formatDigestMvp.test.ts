import { describe, expect, it } from "vitest";
import type { JobMatch } from "@/features/notifications/domain/types";
import { STRONG_MATCH_THRESHOLD } from "@/features/notifications/domain/types";
import { formatDigestMvp, formatWorthReviewingMessage } from "./formatDigestMvp";

function makeMatch(overrides: Partial<JobMatch> = {}): JobMatch {
  return {
    jobId: "job-1",
    title: "Senior Backend Engineer",
    companyName: "Stripe",
    locationTags: ["singapore"],
    source: "greenhouse",
    url: "https://boards.greenhouse.io/stripe/jobs/1",
    aiScore: 0.92,
    aiReasoning: "Strong match.",
    description: "Build systems at scale.",
    minYears: 3,
    employmentType: null,
    urgentHiring: false,
    salaryCurrency: null,
    salaryMin: null,
    salaryMax: null,
    salaryPeriod: null,
    ...overrides,
  };
}

describe("formatDigestMvp", () => {
  it("includes the header and score-band counts", () => {
    const text = formatDigestMvp([makeMatch()], 2);
    expect(text).toContain("Job Matches");
    expect(text).toContain("Strong Match: 1");
    expect(text).toContain("Worth Reviewing: 2");
  });

  it("lists the job title and company for each top match", () => {
    const text = formatDigestMvp([makeMatch()], 0);
    expect(text).toContain("Senior Backend Engineer");
    expect(text).toContain("Stripe");
  });

  it("capitalizes and includes location tags", () => {
    const text = formatDigestMvp([makeMatch({ locationTags: ["india", "remote"] })], 0);
    expect(text).toContain("India");
    expect(text).toContain("Remote");
  });

  it("shows experience when minYears is set", () => {
    const text = formatDigestMvp([makeMatch({ minYears: 5 })], 0);
    expect(text).toContain("5+ yrs");
  });

  it("omits experience line when minYears is null", () => {
    const text = formatDigestMvp([makeMatch({ minYears: null })], 0);
    expect(text).not.toContain("yrs");
  });

  it("respects displayLimit and only shows top-N jobs", () => {
    const matches = Array.from({ length: 8 }, (_, i) =>
      makeMatch({ jobId: `job-${i}`, title: `Engineer ${i}`, aiScore: 0.9 - i * 0.01 }),
    );
    const text = formatDigestMvp(matches, 0, 3);
    expect(text).toContain("1.");
    expect(text).toContain("2.");
    expect(text).toContain("3.");
    expect(text).not.toContain("4.");
  });

  it("shows 'No strong matches' when strong list is empty", () => {
    const text = formatDigestMvp([], 3);
    expect(text).toContain("No strong matches");
  });

  it("HTML-escapes untrusted fields", () => {
    const match = makeMatch({ title: "C++ <Dev>", companyName: "Acme & Co" });
    const text = formatDigestMvp([match], 0);
    expect(text).toContain("C++ &lt;Dev&gt;");
    expect(text).toContain("Acme &amp; Co");
    expect(text).not.toContain("<Dev>");
  });

  it("shows 'Showing Top N Strong Match(es)' heading", () => {
    const text = formatDigestMvp([makeMatch()], 0);
    expect(text).toMatch(/Showing Top \d+ Strong Match/);
  });

  it("shows highlight badges (remote, urgent) for a top match when present", () => {
    const text = formatDigestMvp([makeMatch({ locationTags: ["remote"], urgentHiring: true })], 0);
    expect(text).toContain("\u{1F30D} Remote");
    expect(text).toContain("⚡ Urgent hiring");
  });

  it("uses threshold boundary: score exactly at STRONG_MATCH_THRESHOLD counts as strong", () => {
    // The caller (bandMatches) already split by threshold; formatDigestMvp just displays.
    // Verify that a 0.80 match appears in the strong section passed to the formatter.
    const match = makeMatch({ aiScore: STRONG_MATCH_THRESHOLD, title: "Boundary Job" });
    const text = formatDigestMvp([match], 0);
    expect(text).toContain("Boundary Job");
    expect(text).toContain("Strong Match: 1");
  });
});

describe("formatWorthReviewingMessage", () => {
  it("returns a no-jobs message for an empty list", () => {
    expect(formatWorthReviewingMessage([])).toContain("No worth-reviewing");
  });

  it("includes header and job titles", () => {
    const match = makeMatch({ title: "Full Stack Dev", aiScore: 0.72 });
    const text = formatWorthReviewingMessage([match]);
    expect(text).toContain("Worth Reviewing Jobs");
    expect(text).toContain("Full Stack Dev");
  });

  it("shows score percentage for each job", () => {
    const match = makeMatch({ aiScore: 0.71 });
    const text = formatWorthReviewingMessage([match]);
    expect(text).toContain("71%");
  });

  it("HTML-escapes untrusted fields", () => {
    const match = makeMatch({ title: "<Script>", companyName: "A & B" });
    const text = formatWorthReviewingMessage([match]);
    expect(text).toContain("&lt;Script&gt;");
    expect(text).toContain("A &amp; B");
  });

  it("shows highlight badges for a worth-reviewing job when present", () => {
    const match = makeMatch({ employmentType: "contract" });
    const text = formatWorthReviewingMessage([match]);
    expect(text).toContain("\u{1F4C4} Contract");
  });

  it("numbers multiple jobs sequentially", () => {
    const matches = [
      makeMatch({ jobId: "1", title: "Job A", aiScore: 0.78 }),
      makeMatch({ jobId: "2", title: "Job B", aiScore: 0.65 }),
    ];
    const text = formatWorthReviewingMessage(matches);
    expect(text).toContain("1. ");
    expect(text).toContain("2. ");
  });
});
