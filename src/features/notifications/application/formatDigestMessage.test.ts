import { describe, expect, it } from "vitest";
import type { JobMatch } from "@/features/notifications/domain/types";
import { HIGH_MATCH_THRESHOLD, TELEGRAM_MAX_MESSAGE_LENGTH, formatDigestMessage, splitDigestChunks } from "./formatDigestMessage";

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
    employmentType: null,
    urgentHiring: false,
    salaryCurrency: null,
    salaryMin: null,
    salaryMax: null,
    salaryPeriod: null,
    ...overrides,
  };
}

describe("formatDigestMessage", () => {
  it("returns a no-matches message when the list is empty", () => {
    const message = formatDigestMessage([]);
    expect(message).toContain("No new matches");
  });

  it("includes the digest header", () => {
    const message = formatDigestMessage([makeMatch()]);
    expect(message).toContain("Jobs Digest");
  });

  it("places a high-score match under High Match section", () => {
    const message = formatDigestMessage([makeMatch({ aiScore: 0.9 })]);
    expect(message).toContain("High Match");
    expect(message).toContain("90%");
    expect(message).not.toContain("Medium Match");
  });

  it("places a medium-score match under Medium Match section", () => {
    const message = formatDigestMessage([makeMatch({ aiScore: 0.78 })]);
    expect(message).toContain("Medium Match");
    expect(message).toContain("78%");
    expect(message).not.toContain("High Match");
  });

  it("places matches in the correct section based on HIGH_MATCH_THRESHOLD", () => {
    const highMatch = makeMatch({ jobId: "job-1", title: "Senior Engineer", aiScore: HIGH_MATCH_THRESHOLD });
    const mediumMatch = makeMatch({ jobId: "job-2", title: "Junior Engineer", aiScore: HIGH_MATCH_THRESHOLD - 0.01 });
    const message = formatDigestMessage([highMatch, mediumMatch]);

    const highIdx = message.indexOf("High Match");
    const mediumIdx = message.indexOf("Medium Match");
    const seniorIdx = message.indexOf("Senior Engineer");
    const juniorIdx = message.indexOf("Junior Engineer");

    expect(highIdx).toBeGreaterThan(-1);
    expect(mediumIdx).toBeGreaterThan(highIdx);
    expect(seniorIdx).toBeLessThan(mediumIdx);
    expect(juniorIdx).toBeGreaterThan(mediumIdx);
  });

  it("lists unique companies in the New Companies section", () => {
    const matches = [
      makeMatch({ jobId: "job-1", companyName: "Acme Corp", aiScore: 0.9 }),
      makeMatch({ jobId: "job-2", companyName: "Stripe", aiScore: 0.78 }),
      makeMatch({ jobId: "job-3", companyName: "Acme Corp", aiScore: 0.76 }),
    ];
    const message = formatDigestMessage(matches);

    expect(message).toContain("New Companies");
    const companiesIdx = message.indexOf("New Companies");
    const afterCompanies = message.slice(companiesIdx);
    expect(afterCompanies).toContain("Acme Corp");
    expect(afterCompanies).toContain("Stripe");
    // Acme Corp should appear only once in the companies list
    expect(afterCompanies.indexOf("Acme Corp")).toBe(afterCompanies.lastIndexOf("Acme Corp"));
  });

  it("includes a Summary section with job count and high-value count", () => {
    const matches = [
      makeMatch({ jobId: "job-1", aiScore: 0.91 }),
      makeMatch({ jobId: "job-2", aiScore: 0.76 }),
    ];
    const message = formatDigestMessage(matches);

    expect(message).toContain("Summary");
    expect(message).toContain("2 jobs processed");
    expect(message).toContain("1 high-value job");
  });

  it("HTML-escapes untrusted fields in entries", () => {
    const match = makeMatch({
      title: "C++ <Senior> Engineer",
      companyName: "Acme & Co",
    });
    const message = formatDigestMessage([match]);

    expect(message).toContain("C++ &lt;Senior&gt; Engineer @ Acme &amp; Co");
    expect(message).not.toContain("C++ <Senior>");
  });

  it("capitalizes and joins multiple location tags", () => {
    const match = makeMatch({ locationTags: ["india", "remote"] });
    const message = formatDigestMessage([match]);

    expect(message).toContain("India, Remote");
  });
});

describe("splitDigestChunks", () => {
  it("returns a single chunk when text is within the limit", () => {
    const text = "short message";
    expect(splitDigestChunks(text)).toEqual(["short message"]);
  });

  it("splits long text into chunks at line boundaries", () => {
    const line = "a".repeat(100);
    const text = Array.from({ length: 50 }, () => line).join("\n");
    expect(text.length).toBeGreaterThan(TELEGRAM_MAX_MESSAGE_LENGTH);

    const chunks = splitDigestChunks(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(TELEGRAM_MAX_MESSAGE_LENGTH);
    }
    expect(chunks.join("\n")).toBe(text);
  });
});
