import { describe, expect, it } from "vitest";
import type { JobMatch } from "@/features/notifications/domain/types";
import { formatMatchMessage } from "./formatMatchMessage";

function makeMatch(overrides: Partial<JobMatch> = {}): JobMatch {
  return {
    jobId: "job-1",
    title: "Senior React Developer",
    companyName: "Acme Corp",
    locationTags: ["remote"],
    source: "greenhouse",
    url: "https://example.com/jobs/123",
    aiScore: 0.87,
    aiReasoning: "Strong match on React and Node.js experience.",
    description: "We are looking for a Senior React Developer.",
    minYears: 3,
    ...overrides,
  };
}

describe("formatMatchMessage", () => {
  it("formats a match with score, title, location, reasoning, and url", () => {
    const message = formatMatchMessage(makeMatch());

    expect(message).toBe(
      [
        "🎯 New match (87%)",
        "Senior React Developer @ Acme Corp",
        "📍 Remote",
        "Strong match on React and Node.js experience.",
        "https://example.com/jobs/123",
      ].join("\n"),
    );
  });

  it("rounds the AI score to the nearest percent", () => {
    const message = formatMatchMessage(makeMatch({ aiScore: 0.755 }));

    expect(message).toContain("New match (76%)");
  });

  it("joins multiple location tags, each capitalized", () => {
    const message = formatMatchMessage(makeMatch({ locationTags: ["india", "remote"] }));

    expect(message).toContain("📍 India, Remote");
  });

  it("omits the reasoning line when aiReasoning is null", () => {
    const message = formatMatchMessage(makeMatch({ aiReasoning: null }));

    expect(message).toBe(
      [
        "🎯 New match (87%)",
        "Senior React Developer @ Acme Corp",
        "📍 Remote",
        "https://example.com/jobs/123",
      ].join("\n"),
    );
  });

  it("HTML-escapes &, <, > in title, companyName, and aiReasoning", () => {
    const message = formatMatchMessage(
      makeMatch({
        title: "C++ <Senior> Engineer",
        companyName: "Acme & Co",
        aiReasoning: "Strong match on <strong>React</strong> & Node.js",
      }),
    );

    expect(message).toContain("C++ &lt;Senior&gt; Engineer @ Acme &amp; Co");
    expect(message).toContain("Strong match on &lt;strong&gt;React&lt;/strong&gt; &amp; Node.js");
  });

  it("does not throw and leaves Markdown special characters untouched for a title with _, *, `, [", () => {
    const message = formatMatchMessage(makeMatch({ title: "Senior_Engineer * [Backend] `role`" }));

    expect(message).toContain("Senior_Engineer * [Backend] `role` @ Acme Corp");
  });
});
