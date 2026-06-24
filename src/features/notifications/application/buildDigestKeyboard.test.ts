import { describe, expect, it } from "vitest";
import type { JobMatch } from "@/features/notifications/domain/types";
import { buildDigestKeyboard } from "./buildDigestKeyboard";

function makeMatch(overrides: Partial<JobMatch> = {}): JobMatch {
  return {
    jobId: "job-1",
    title: "Senior Engineer",
    companyName: "Acme",
    locationTags: ["remote"],
    source: "greenhouse",
    url: "https://example.com/jobs/1",
    aiScore: 0.90,
    aiReasoning: null,
    description: "",
    minYears: null,
    ...overrides,
  };
}

const DASHBOARD_URL = "https://app.example.com/dashboard?minScore=0.80";

describe("buildDigestKeyboard", () => {
  it("returns empty rows when there are no matches and no optional buttons", () => {
    const rows = buildDigestKeyboard([], 0, {});
    expect(rows).toEqual([]);
  });

  it("generates one row per match with Apply button", () => {
    const matches = [
      makeMatch({ jobId: "a", url: "https://a.com" }),
      makeMatch({ jobId: "b", url: "https://b.com" }),
      makeMatch({ jobId: "c", url: "https://c.com" }),
    ];
    const rows = buildDigestKeyboard(matches, 0, {});
    expect(rows).toHaveLength(3);
    expect(rows[0]![0]).toEqual({ text: "Apply #1", url: "https://a.com" });
    expect(rows[1]![0]).toEqual({ text: "Apply #2", url: "https://b.com" });
    expect(rows[2]![0]).toEqual({ text: "Apply #3", url: "https://c.com" });
  });

  it("adds 📧 Contact button when description contains a recruiter email", () => {
    const matches = [
      makeMatch({ url: "https://a.com", description: "Contact jane@startup.io for details." }),
    ];
    const rows = buildDigestKeyboard(matches, 0, {});
    expect(rows[0]).toHaveLength(2);
    expect(rows[0]![0]).toEqual({ text: "Apply #1", url: "https://a.com" });
    expect(rows[0]![1]).toEqual({ text: "📧 Contact", url: "mailto:jane@startup.io" });
  });

  it("omits 📧 Contact button when description has no email", () => {
    const matches = [makeMatch({ description: "Apply via our ATS." })];
    const rows = buildDigestKeyboard(matches, 0, {});
    expect(rows[0]).toHaveLength(1);
    expect(rows[0]![0]).toMatchObject({ text: "Apply #1" });
  });

  it("omits 📧 Contact button when description has only excluded email prefixes", () => {
    const matches = [makeMatch({ description: "Sent by noreply@ats.com" })];
    const rows = buildDigestKeyboard(matches, 0, {});
    expect(rows[0]).toHaveLength(1);
  });

  it("mixes rows — contact button only on matches with recruiter email", () => {
    const matches = [
      makeMatch({ jobId: "a", url: "https://a.com", description: "reach alice@corp.com" }),
      makeMatch({ jobId: "b", url: "https://b.com", description: "" }),
    ];
    const rows = buildDigestKeyboard(matches, 0, {});
    expect(rows[0]).toHaveLength(2); // has email
    expect(rows[1]).toHaveLength(1); // no email
  });

  it("respects displayLimit — does not generate Apply buttons beyond it", () => {
    const matches = Array.from({ length: 6 }, (_, i) =>
      makeMatch({ jobId: `job-${i}`, url: `https://example.com/${i}` }),
    );
    const rows = buildDigestKeyboard(matches, 0, { displayLimit: 3 });
    const applyButtons = rows.flat().filter((b) => "url" in b && (b as { text: string }).text.startsWith("Apply"));
    expect(applyButtons).toHaveLength(3);
  });

  it("appends a Worth Reviewing callback button when showWorthReviewing and count > 0", () => {
    const rows = buildDigestKeyboard([], 3, { showWorthReviewing: true });
    expect(rows).toHaveLength(1);
    expect(rows[0]![0]).toEqual({ text: "✓ Worth Reviewing (3)", callback_data: "wr:0" });
  });

  it("omits Worth Reviewing button when count is 0 even if showWorthReviewing is true", () => {
    const rows = buildDigestKeyboard([], 0, { showWorthReviewing: true });
    expect(rows).toHaveLength(0);
  });

  it("omits Worth Reviewing button when showWorthReviewing is absent", () => {
    const rows = buildDigestKeyboard([], 3, {});
    expect(rows).toHaveLength(0);
  });

  it("appends a Dashboard button when dashboardUrl is provided", () => {
    const rows = buildDigestKeyboard([], 0, { dashboardUrl: DASHBOARD_URL });
    expect(rows).toHaveLength(1);
    expect(rows[0]![0]).toEqual({ text: "📊 Dashboard", url: DASHBOARD_URL });
  });

  it("omits Dashboard button when dashboardUrl is absent", () => {
    const rows = buildDigestKeyboard([], 0, {});
    expect(rows).toHaveLength(0);
  });

  it("places Dashboard button after Worth Reviewing button", () => {
    const matches = [makeMatch()];
    const rows = buildDigestKeyboard(matches, 2, {
      showWorthReviewing: true,
      dashboardUrl: DASHBOARD_URL,
    });
    const lastRow = rows[rows.length - 1]!;
    expect((lastRow[0] as { text: string }).text).toBe("📊 Dashboard");
    const secondLast = rows[rows.length - 2]!;
    expect((secondLast[0] as { text: string }).text).toContain("Worth Reviewing");
  });

  it("full layout: 5 strong matches + worth reviewing + dashboard", () => {
    const matches = Array.from({ length: 5 }, (_, i) =>
      makeMatch({ jobId: `job-${i}`, url: `https://example.com/${i}` }),
    );
    const rows = buildDigestKeyboard(matches, 4, {
      showWorthReviewing: true,
      dashboardUrl: DASHBOARD_URL,
      displayLimit: 5,
    });
    // Rows: [Apply#1], [Apply#2], [Apply#3], [Apply#4], [Apply#5], [Worth Reviewing], [Dashboard]
    expect(rows).toHaveLength(7);
    expect(rows[0]![0]).toMatchObject({ text: "Apply #1" });
    expect(rows[4]![0]).toMatchObject({ text: "Apply #5" });
    expect((rows[5]![0] as { text: string }).text).toContain("Worth Reviewing");
    expect((rows[5]![0] as { callback_data: string }).callback_data).toBe("wr:0");
    expect((rows[6]![0] as { text: string }).text).toBe("📊 Dashboard");
  });
});
