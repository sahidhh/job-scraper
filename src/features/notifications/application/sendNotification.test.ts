import { describe, expect, it, vi } from "vitest";
import type { NotificationRepository } from "@/features/notifications/domain/NotificationRepository";
import type { TelegramSender } from "@/features/notifications/domain/TelegramSender";
import type { JobMatch } from "@/features/notifications/domain/types";
import { DomainValidationError } from "@/shared/domain/errors";
import { sendNotification } from "./sendNotification";

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

function makeNotificationRepository(matches: JobMatch[] = []): NotificationRepository {
  return {
    findUnnotifiedMatches: vi.fn().mockResolvedValue(matches),
    markNotified: vi.fn().mockResolvedValue(undefined),
    listRecent: vi.fn().mockResolvedValue([]),
  };
}

function makeTelegramSender(): TelegramSender {
  return {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    sendMessageWithButtons: vi.fn().mockResolvedValue(undefined),
  };
}

describe("sendNotification", () => {
  it("sends a message and marks each unnotified match as notified", async () => {
    const matches = [makeMatch({ jobId: "job-1" }), makeMatch({ jobId: "job-2", title: "Backend Engineer" })];
    const notificationRepository = makeNotificationRepository(matches);
    const telegramSender = makeTelegramSender();

    const sent = await sendNotification("role-selection-1", {
      notificationRepository,
      telegramSender,
      notifyThreshold: 0.75,
    });

    expect(sent).toBe(2);
    expect(notificationRepository.findUnnotifiedMatches).toHaveBeenCalledWith("role-selection-1", 0.75);
    expect(telegramSender.sendMessage).toHaveBeenCalledTimes(2);
    expect(notificationRepository.markNotified).toHaveBeenCalledWith("job-1");
    expect(notificationRepository.markNotified).toHaveBeenCalledWith("job-2");
  });

  it("does nothing when there are no unnotified matches", async () => {
    const notificationRepository = makeNotificationRepository([]);
    const telegramSender = makeTelegramSender();

    const sent = await sendNotification("role-selection-1", {
      notificationRepository,
      telegramSender,
      notifyThreshold: 0.75,
    });

    expect(sent).toBe(0);
    expect(telegramSender.sendMessage).not.toHaveBeenCalled();
    expect(notificationRepository.markNotified).not.toHaveBeenCalled();
  });

  it("throws DomainValidationError for an out-of-range notifyThreshold", async () => {
    const notificationRepository = makeNotificationRepository();
    const telegramSender = makeTelegramSender();

    await expect(
      sendNotification("role-selection-1", {
        notificationRepository,
        telegramSender,
        notifyThreshold: 1.5,
      }),
    ).rejects.toThrow(DomainValidationError);
    expect(notificationRepository.findUnnotifiedMatches).not.toHaveBeenCalled();
  });

  it("isolates a failing send: later matches are still notified and the failure is logged, not thrown", async () => {
    const matches = [
      makeMatch({ jobId: "job-1" }),
      makeMatch({ jobId: "job-2", title: "Backend Engineer" }),
      makeMatch({ jobId: "job-3", title: "Platform Engineer" }),
    ];
    const notificationRepository = makeNotificationRepository(matches);
    const telegramSender: TelegramSender = {
      sendMessage: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("Telegram sendMessage failed: bad request"))
        .mockResolvedValueOnce(undefined),
      sendMessageWithButtons: vi.fn().mockResolvedValue(undefined),
    };
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const sent = await sendNotification("role-selection-1", {
      notificationRepository,
      telegramSender,
      notifyThreshold: 0.75,
    });

    expect(sent).toBe(2);
    expect(telegramSender.sendMessage).toHaveBeenCalledTimes(3);
    expect(notificationRepository.markNotified).toHaveBeenCalledWith("job-1");
    expect(notificationRepository.markNotified).not.toHaveBeenCalledWith("job-2");
    expect(notificationRepository.markNotified).toHaveBeenCalledWith("job-3");
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("job-2"),
      expect.any(Error),
    );

    consoleErrorSpy.mockRestore();
  });

  it("applies preferences filter before sending: filtered-out matches are skipped and not marked notified", async () => {
    const matches = [
      makeMatch({ jobId: "job-1", title: "Backend Engineer", locationTags: ["remote"] }),
      makeMatch({ jobId: "job-2", title: "Frontend Developer", locationTags: ["remote"] }),
    ];
    const notificationRepository = makeNotificationRepository(matches);
    const telegramSender = makeTelegramSender();

    const sent = await sendNotification("role-selection-1", {
      notificationRepository,
      telegramSender,
      notifyThreshold: 0.75,
      preferences: { roles: ["backend engineer"] },
    });

    expect(sent).toBe(1);
    expect(notificationRepository.markNotified).toHaveBeenCalledWith("job-1");
    expect(notificationRepository.markNotified).not.toHaveBeenCalledWith("job-2");
  });

  it("sends all matches when preferences is null (no filtering)", async () => {
    const matches = [makeMatch({ jobId: "job-1" }), makeMatch({ jobId: "job-2" })];
    const notificationRepository = makeNotificationRepository(matches);
    const telegramSender = makeTelegramSender();

    const sent = await sendNotification("role-selection-1", {
      notificationRepository,
      telegramSender,
      notifyThreshold: 0.75,
      preferences: null,
    });

    expect(sent).toBe(2);
  });
});
