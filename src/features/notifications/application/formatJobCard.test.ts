import { describe, expect, it } from "vitest";
import type { JobMatch } from "@/features/notifications/domain/types";
import { formatJobCard } from "./formatJobCard";

function makeMatch(overrides: Partial<JobMatch> = {}): JobMatch {
  return {
    jobId: "job-1",
    title: "Senior React & Node Engineer",
    companyName: "Acme <Corp>",
    locationTags: ["remote", "india"],
    source: "naukri",
    url: "https://example.com/jobs/1",
    aiScore: 0.85,
    overallScore: 0.9,
    postedAt: "2026-04-16T20:00:00Z",
    aiReasoning: null,
    description: "React",
    minYears: 4,
    employmentType: "full_time",
    urgentHiring: true,
    salaryCurrency: "INR",
    salaryMin: 2000000,
    salaryMax: 3000000,
    salaryPeriod: "yearly",
    ...overrides,
  };
}

describe("formatJobCard", () => {
  it("formats HTML-escaped title, company, location, minYears, score, <24h badge, and highlights", () => {
    const now = new Date("2026-04-17T00:00:00Z");
    const card = formatJobCard(makeMatch(), now);

    expect(card).toContain("<b>Senior React &amp; Node Engineer</b>");
    expect(card).toContain("Acme &lt;Corp&gt; · Remote, India · 4+ yrs");
    expect(card).toContain("🎯 90% · 🆕 &lt;24h");
    expect(card).toContain("🌍 Remote · ⚡ Urgent hiring");
  });

  it("omits <24h badge when postedAt is older than 24h or null", () => {
    const now = new Date("2026-04-17T00:00:00Z");
    const card = formatJobCard(
      makeMatch({ postedAt: "2026-04-15T00:00:00Z", minYears: null, urgentHiring: false, locationTags: ["india"] }),
      now,
    );

    expect(card).not.toContain("🆕");
    expect(card).toContain("🎯 90%");
    expect(card).not.toContain("yrs");
  });
});
