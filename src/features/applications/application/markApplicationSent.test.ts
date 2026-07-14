import { describe, expect, it, vi } from "vitest";
import type { ApplicationRepository } from "@/features/applications/domain/ApplicationRepository";
import type { Application } from "@/features/applications/domain/types";
import { markApplicationSent } from "./markApplicationSent";

const draft: Application = {
  id: "app-1",
  jobId: "job-1",
  resumeId: "resume-1",
  kind: "email",
  subject: "Subject",
  body: "Body",
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
    updateContent: vi.fn(),
    markSent: vi.fn().mockResolvedValue({ ...draft, status: "sent", sentAt: "2026-01-02T00:00:00Z" }),
    markDismissed: vi.fn(),
  };
}

describe("markApplicationSent", () => {
  it("marks a draft as sent", async () => {
    const repository = makeRepository(draft);

    const result = await markApplicationSent("app-1", { repository });

    expect(repository.markSent).toHaveBeenCalledWith("app-1");
    expect(result.status).toBe("sent");
  });

  it("throws when the application does not exist", async () => {
    const repository = makeRepository(null);

    await expect(markApplicationSent("missing", { repository })).rejects.toThrow("not found");
  });

  it("rejects marking an already-sent application sent again", async () => {
    const repository = makeRepository({ ...draft, status: "sent" });

    await expect(markApplicationSent("app-1", { repository })).rejects.toThrow("Only draft applications");
  });

  it("rejects marking a dismissed application sent", async () => {
    const repository = makeRepository({ ...draft, status: "dismissed" });

    await expect(markApplicationSent("app-1", { repository })).rejects.toThrow("Only draft applications");
  });
});
