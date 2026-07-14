import { describe, expect, it } from "vitest";
import type { PendingApplicationDraft } from "@/features/applications/domain/types";
import { formatPendingDraftsReminder } from "./formatPendingDraftsReminder";

function draft(overrides: Partial<PendingApplicationDraft> = {}): PendingApplicationDraft {
  return {
    applicationId: "app-1",
    jobId: "job-1",
    jobTitle: "Software Engineer",
    companyName: "Acme",
    kind: "email",
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("formatPendingDraftsReminder", () => {
  it("returns null when there are no pending drafts", () => {
    expect(formatPendingDraftsReminder([])).toBeNull();
  });

  it("lists job title and company, HTML-escaped", () => {
    const message = formatPendingDraftsReminder([draft({ jobTitle: "C++ <Dev>", companyName: "A & B" })]);

    expect(message).toContain("C++ &lt;Dev&gt;");
    expect(message).toContain("A &amp; B");
    expect(message).toContain("1 draft application awaiting review");
  });

  it("pluralizes the header for multiple drafts", () => {
    const message = formatPendingDraftsReminder([draft(), draft({ applicationId: "app-2" })]);

    expect(message).toContain("2 draft applications awaiting review");
  });

  it("collapses beyond the display limit into a '...and N more' tail", () => {
    const drafts = Array.from({ length: 13 }, (_, i) => draft({ applicationId: `app-${i}`, jobTitle: `Job ${i}` }));

    const message = formatPendingDraftsReminder(drafts);

    expect(message).toContain("...and 3 more");
    expect(message).not.toContain("Job 12");
  });
});
