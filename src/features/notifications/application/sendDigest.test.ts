import { describe, expect, it, vi } from "vitest";
import type { NotificationRepository } from "@/features/notifications/domain/NotificationRepository";
import type { TelegramSender } from "@/features/notifications/domain/TelegramSender";
import type { JobMatch } from "@/features/notifications/domain/types";
import { DomainValidationError } from "@/shared/domain/errors";
import { sendDigest } from "./sendDigest";

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

function makeNotificationRepository(matches: JobMatch[] = []): NotificationRepository {
  return {
    findUnnotifiedMatches: vi.fn().mockResolvedValue(matches),
    markNotified: vi.fn().mockResolvedValue(undefined),
    markManyNotified: vi.fn().mockResolvedValue(undefined),
    listRecent: vi.fn().mockResolvedValue([]),
  };
}

function makeTelegramSender(): TelegramSender {
  return {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    sendMessageWithButtons: vi.fn().mockResolvedValue(undefined),
  };
}

describe("sendDigest", () => {
  it("sends one digest message and marks all matches as notified", async () => {
    const matches = [makeMatch({ jobId: "job-1" }), makeMatch({ jobId: "job-2", title: "Backend Engineer" })];
    const notificationRepository = makeNotificationRepository(matches);
    const telegramSender = makeTelegramSender();

    const count = await sendDigest("role-selection-1", {
      notificationRepository,
      telegramSender,
      notifyThreshold: 0.75,
      resumeVersion: 1,
    });

    expect(count).toBe(2);
    expect(telegramSender.sendMessage).toHaveBeenCalledTimes(1);
    expect(notificationRepository.markManyNotified).toHaveBeenCalledWith(["job-1", "job-2"]);
  });

  it("returns 0 and sends nothing when there are no unnotified matches", async () => {
    const notificationRepository = makeNotificationRepository([]);
    const telegramSender = makeTelegramSender();

    const count = await sendDigest("role-selection-1", {
      notificationRepository,
      telegramSender,
      notifyThreshold: 0.75,
      resumeVersion: 1,
    });

    expect(count).toBe(0);
    expect(telegramSender.sendMessage).not.toHaveBeenCalled();
    expect(notificationRepository.markManyNotified).not.toHaveBeenCalled();
  });

  it("throws DomainValidationError for an out-of-range notifyThreshold", async () => {
    await expect(
      sendDigest("role-selection-1", {
        notificationRepository: makeNotificationRepository(),
        telegramSender: makeTelegramSender(),
        notifyThreshold: 1.5,
        resumeVersion: 1,
      }),
    ).rejects.toThrow(DomainValidationError);
  });

  it("applies preferences filter before sending: filtered-out matches are not marked notified", async () => {
    const matches = [
      makeMatch({ jobId: "job-1", title: "Backend Engineer", locationTags: ["remote"] }),
      makeMatch({ jobId: "job-2", title: "Frontend Developer", locationTags: ["remote"] }),
    ];
    const notificationRepository = makeNotificationRepository(matches);
    const telegramSender = makeTelegramSender();

    const count = await sendDigest("role-selection-1", {
      notificationRepository,
      telegramSender,
      notifyThreshold: 0.75,
      resumeVersion: 1,
      preferences: { roles: ["backend engineer"] },
    });

    expect(count).toBe(1);
    expect(notificationRepository.markManyNotified).toHaveBeenCalledWith(["job-1"]);
  });

  it("sends all matches when preferences is null (no filtering)", async () => {
    const matches = [makeMatch({ jobId: "job-1" }), makeMatch({ jobId: "job-2" })];
    const notificationRepository = makeNotificationRepository(matches);
    const telegramSender = makeTelegramSender();

    const count = await sendDigest("role-selection-1", {
      notificationRepository,
      telegramSender,
      notifyThreshold: 0.75,
      resumeVersion: 1,
      preferences: null,
    });

    expect(count).toBe(2);
  });

  it("if send throws, no jobs are marked as notified (full retry on next run)", async () => {
    const matches = [makeMatch({ jobId: "job-1" }), makeMatch({ jobId: "job-2" })];
    const notificationRepository = makeNotificationRepository(matches);
    const telegramSender: TelegramSender = {
      sendMessage: vi.fn().mockRejectedValue(new Error("Telegram error")),
      sendMessageWithButtons: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      sendDigest("role-selection-1", {
        notificationRepository,
        telegramSender,
        notifyThreshold: 0.75,
        resumeVersion: 1,
      }),
    ).rejects.toThrow("Telegram error");

    expect(notificationRepository.markManyNotified).not.toHaveBeenCalled();
  });

  it("sends multiple Telegram messages when the digest exceeds the character limit", async () => {
    // Create enough matches to overflow the 4096-char Telegram limit
    const matches = Array.from({ length: 60 }, (_, i) =>
      makeMatch({
        jobId: `job-${i}`,
        title: `Senior Engineer ${i} at a company with a very long name`,
        companyName: `Company With A Very Long Name ${i}`,
        url: `https://example.com/jobs/${i}/a-very-long-path-that-takes-up-space`,
        aiScore: 0.8 + (i % 10) * 0.01,
      }),
    );
    const notificationRepository = makeNotificationRepository(matches);
    const telegramSender = makeTelegramSender();

    const count = await sendDigest("role-selection-1", {
      notificationRepository,
      telegramSender,
      notifyThreshold: 0.75,
      resumeVersion: 1,
    });

    expect(count).toBe(60);
    const callCount = (telegramSender.sendMessage as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(callCount).toBeGreaterThan(1);
    expect(notificationRepository.markManyNotified).toHaveBeenCalledWith(matches.map((m) => m.jobId));
  });
});
