import { describe, expect, it, vi } from "vitest";
import type { ApplicationRepository } from "@/features/applications/domain/ApplicationRepository";
import type { Application } from "@/features/applications/domain/types";
import { updateApplicationContent } from "./updateApplicationContent";

const draft: Application = {
  id: "app-1",
  jobId: "job-1",
  resumeId: "resume-1",
  kind: "email",
  subject: "Old subject",
  body: "Old body",
  recipientEmail: null,
  status: "draft",
  model: "gemini-2.5-flash",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  sentAt: null,
};

function makeRepository(existing: Application | null): ApplicationRepository {
  return {
    getById: vi.fn().mockResolvedValue(existing),
    findByJobAndKind: vi.fn(),
    listByJob: vi.fn(),
    listPendingDrafts: vi.fn(),
    upsertDraft: vi.fn(),
    updateContent: vi.fn().mockResolvedValue({ ...existing, subject: "New subject", body: "New body" }),
    markSent: vi.fn(),
    markDismissed: vi.fn(),
  };
}

describe("updateApplicationContent", () => {
  it("updates a draft's subject and body", async () => {
    const repository = makeRepository(draft);

    const result = await updateApplicationContent("app-1", "New subject", "New body", { repository });

    expect(repository.updateContent).toHaveBeenCalledWith("app-1", "New subject", "New body");
    expect(result.subject).toBe("New subject");
  });

  it("rejects an empty body before touching the repository", async () => {
    const repository = makeRepository(draft);

    await expect(updateApplicationContent("app-1", "Subject", "  ", { repository })).rejects.toThrow("body cannot be empty");
    expect(repository.getById).not.toHaveBeenCalled();
  });

  it("throws when the application does not exist", async () => {
    const repository = makeRepository(null);

    await expect(updateApplicationContent("missing", "Subject", "Body", { repository })).rejects.toThrow("not found");
  });

  it("rejects editing a 'sent' application", async () => {
    const repository = makeRepository({ ...draft, status: "sent" });

    await expect(updateApplicationContent("app-1", "Subject", "Body", { repository })).rejects.toThrow("Only draft applications");
  });
});
