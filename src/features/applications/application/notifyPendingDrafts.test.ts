import { describe, expect, it, vi } from "vitest";
import type { ApplicationRepository } from "@/features/applications/domain/ApplicationRepository";
import type { PendingApplicationDraft } from "@/features/applications/domain/types";
import type { TelegramSender } from "@/features/notifications/domain/TelegramSender";
import { notifyPendingDrafts } from "./notifyPendingDrafts";

const pending: PendingApplicationDraft = {
  applicationId: "app-1",
  jobId: "job-1",
  jobTitle: "Software Engineer",
  companyName: "Acme",
  kind: "email",
  createdAt: "2026-01-01T00:00:00Z",
};

function makeDeps(drafts: PendingApplicationDraft[]) {
  const applicationRepository: ApplicationRepository = {
    getById: vi.fn(),
    findByJobAndKind: vi.fn(),
    listByJob: vi.fn(),
    listPendingDrafts: vi.fn().mockResolvedValue(drafts),
    upsertDraft: vi.fn(),
    updateContent: vi.fn(),
    markSent: vi.fn(),
    markDismissed: vi.fn(),
  };
  const telegramSender: TelegramSender = {
    sendMessage: vi.fn(),
    sendMessageWithButtons: vi.fn(),
  };
  return { applicationRepository, telegramSender };
}

describe("notifyPendingDrafts", () => {
  it("sends a reminder and returns the pending count", async () => {
    const deps = makeDeps([pending]);

    const count = await notifyPendingDrafts(deps);

    expect(deps.telegramSender.sendMessage).toHaveBeenCalledTimes(1);
    expect(count).toBe(1);
  });

  it("sends nothing when there are no pending drafts", async () => {
    const deps = makeDeps([]);

    const count = await notifyPendingDrafts(deps);

    expect(deps.telegramSender.sendMessage).not.toHaveBeenCalled();
    expect(count).toBe(0);
  });
});
