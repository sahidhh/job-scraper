import { describe, expect, it, vi } from "vitest";
import type { DigestSessionRepository } from "@/features/notifications/domain/DigestSessionRepository";
import type { NotificationRepository } from "@/features/notifications/domain/NotificationRepository";
import type { TelegramSender } from "@/features/notifications/domain/TelegramSender";
import type { JobMatch } from "@/features/notifications/domain/types";
import { DomainValidationError } from "@/shared/domain/errors";
import { sendDigestMvp } from "./sendDigestMvp";

function makeMatch(overrides: Partial<JobMatch> = {}): JobMatch {
  return {
    jobId: "job-1",
    title: "Senior Backend Engineer",
    companyName: "Stripe",
    locationTags: ["singapore"],
    source: "greenhouse",
    url: "https://example.com/jobs/1",
    aiScore: 0.92,
    aiReasoning: null,
    description: "Build systems.",
    minYears: 3,
    ...overrides,
  };
}

function makeRepo(matches: JobMatch[] = []): NotificationRepository {
  return {
    findUnnotifiedMatches: vi.fn().mockResolvedValue(matches),
    markNotified: vi.fn().mockResolvedValue(undefined),
    listRecent: vi.fn().mockResolvedValue([]),
  };
}

function makeSender(): TelegramSender {
  return {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    sendMessageWithButtons: vi.fn().mockResolvedValue(undefined),
  };
}

function makeSessionRepo(): DigestSessionRepository {
  return {
    save: vi.fn().mockResolvedValue({ id: "session-1" }),
    getLatest: vi.fn().mockResolvedValue(null),
    updatePaginationMessageId: vi.fn().mockResolvedValue(undefined),
  };
}

describe("sendDigestMvp", () => {
  it("returns zero counts and sends nothing when there are no unnotified matches", async () => {
    const repo = makeRepo([]);
    const sender = makeSender();
    const result = await sendDigestMvp("role-1", {
      notificationRepository: repo,
      telegramSender: sender,
      notifyThreshold: 0.75,
    });
    expect(result).toEqual({ strongCount: 0, worthReviewingCount: 0 });
    expect(sender.sendMessageWithButtons).not.toHaveBeenCalled();
    expect(repo.markNotified).not.toHaveBeenCalled();
  });

  it("sends exactly one message with buttons and marks all matches as notified", async () => {
    const matches = [
      makeMatch({ jobId: "a", aiScore: 0.92 }),
      makeMatch({ jobId: "b", aiScore: 0.71 }),
    ];
    const repo = makeRepo(matches);
    const sender = makeSender();
    const result = await sendDigestMvp("role-1", {
      notificationRepository: repo,
      telegramSender: sender,
      notifyThreshold: 0.65,
    });
    expect(result).toEqual({ strongCount: 1, worthReviewingCount: 1 });
    expect(sender.sendMessageWithButtons).toHaveBeenCalledTimes(1);
    expect(repo.markNotified).toHaveBeenCalledWith("a");
    expect(repo.markNotified).toHaveBeenCalledWith("b");
    expect(repo.markNotified).toHaveBeenCalledTimes(2);
  });

  it("correctly bands strong vs worth-reviewing using STRONG_MATCH_THRESHOLD", async () => {
    const matches = [
      makeMatch({ jobId: "strong1", aiScore: 0.80 }),
      makeMatch({ jobId: "strong2", aiScore: 0.95 }),
      makeMatch({ jobId: "worth1", aiScore: 0.76 }),
      makeMatch({ jobId: "worth2", aiScore: 0.68 }),
    ];
    const repo = makeRepo(matches);
    const sender = makeSender();
    const result = await sendDigestMvp("role-1", {
      notificationRepository: repo,
      telegramSender: sender,
      notifyThreshold: 0.65,
    });
    expect(result.strongCount).toBe(2);
    expect(result.worthReviewingCount).toBe(2);
  });

  it("throws DomainValidationError for an out-of-range threshold", async () => {
    await expect(
      sendDigestMvp("role-1", {
        notificationRepository: makeRepo(),
        telegramSender: makeSender(),
        notifyThreshold: 1.5,
      }),
    ).rejects.toThrow(DomainValidationError);
  });

  it("does not mark any jobs notified if the send throws (full retry on next run)", async () => {
    const matches = [makeMatch({ jobId: "a" }), makeMatch({ jobId: "b" })];
    const repo = makeRepo(matches);
    const sender: TelegramSender = {
      sendMessage: vi.fn(),
      sendMessageWithButtons: vi.fn().mockRejectedValue(new Error("Telegram error")),
    };
    await expect(
      sendDigestMvp("role-1", {
        notificationRepository: repo,
        telegramSender: sender,
        notifyThreshold: 0.75,
      }),
    ).rejects.toThrow("Telegram error");
    expect(repo.markNotified).not.toHaveBeenCalled();
  });

  it("applies preferences filter before banding and sending", async () => {
    const matches = [
      makeMatch({ jobId: "back", title: "Backend Engineer", aiScore: 0.90 }),
      makeMatch({ jobId: "front", title: "Frontend Developer", aiScore: 0.85 }),
    ];
    const repo = makeRepo(matches);
    const sender = makeSender();
    const result = await sendDigestMvp("role-1", {
      notificationRepository: repo,
      telegramSender: sender,
      notifyThreshold: 0.75,
      preferences: { roles: ["backend engineer"] },
    });
    expect(result.strongCount).toBe(1);
    expect(repo.markNotified).toHaveBeenCalledWith("back");
    expect(repo.markNotified).not.toHaveBeenCalledWith("front");
  });

  it("saves worth-reviewing job IDs to digestSessionRepository when provided", async () => {
    const matches = [
      makeMatch({ jobId: "s", aiScore: 0.90 }),
      makeMatch({ jobId: "w", aiScore: 0.72 }),
    ];
    const repo = makeRepo(matches);
    const sender = makeSender();
    const sessionRepo = makeSessionRepo();

    await sendDigestMvp("role-1", {
      notificationRepository: repo,
      telegramSender: sender,
      notifyThreshold: 0.65,
      digestSessionRepository: sessionRepo,
    });

    expect(sessionRepo.save).toHaveBeenCalledWith("role-1", ["w"]);
  });

  it("skips session save when digestSessionRepository is not provided", async () => {
    const matches = [
      makeMatch({ jobId: "s", aiScore: 0.90 }),
      makeMatch({ jobId: "w", aiScore: 0.72 }),
    ];
    const repo = makeRepo(matches);
    const sender = makeSender();
    // No digestSessionRepository — should not throw
    await expect(
      sendDigestMvp("role-1", {
        notificationRepository: repo,
        telegramSender: sender,
        notifyThreshold: 0.65,
      }),
    ).resolves.toEqual({ strongCount: 1, worthReviewingCount: 1 });
  });

  it("shows Worth Reviewing callback button when worth-reviewing count > 0", async () => {
    const matches = [
      makeMatch({ jobId: "s", aiScore: 0.90 }),
      makeMatch({ jobId: "w", aiScore: 0.72 }),
    ];
    const repo = makeRepo(matches);
    const sender = makeSender();
    await sendDigestMvp("role-1", {
      notificationRepository: repo,
      telegramSender: sender,
      notifyThreshold: 0.65,
    });
    const [, buttons] = (sender.sendMessageWithButtons as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      { text: string; callback_data?: string }[][],
    ];
    const allButtons = buttons.flat();
    const wrButton = allButtons.find((b) => b.text.includes("Worth Reviewing"));
    expect(wrButton).toBeDefined();
    expect(wrButton?.callback_data).toBe("wr:0");
  });

  it("omits Worth Reviewing button when all matches are strong", async () => {
    const matches = [makeMatch({ jobId: "s", aiScore: 0.90 })];
    const repo = makeRepo(matches);
    const sender = makeSender();
    await sendDigestMvp("role-1", {
      notificationRepository: repo,
      telegramSender: sender,
      notifyThreshold: 0.75,
    });
    const [, buttons] = (sender.sendMessageWithButtons as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      { text: string }[][],
    ];
    const texts = buttons.flat().map((b) => b.text);
    expect(texts).not.toContain(expect.stringContaining("Worth Reviewing"));
  });

  it("sends null preferences as no filter (notify all)", async () => {
    const matches = [makeMatch({ jobId: "a" }), makeMatch({ jobId: "b" })];
    const repo = makeRepo(matches);
    const sender = makeSender();
    const result = await sendDigestMvp("role-1", {
      notificationRepository: repo,
      telegramSender: sender,
      notifyThreshold: 0.75,
      preferences: null,
    });
    expect(result.strongCount + result.worthReviewingCount).toBe(2);
  });
});
