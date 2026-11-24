import { describe, expect, it, vi } from "vitest";
import type { NotificationRepository } from "@/features/notifications/domain/NotificationRepository";
import type { TelegramSender } from "@/features/notifications/domain/TelegramSender";
import type { JobMatch } from "@/features/notifications/domain/types";
import { MAX_DAILY_CARDS, sendDailyCards } from "./sendDailyCards";

function makeMatch(index: number): JobMatch {
  return {
    jobId: `job-${index}`,
    title: `Role ${index}`,
    companyName: "Acme",
    locationTags: ["remote"],
    source: "naukri",
    url: `https://example.com/jobs/${index}`,
    aiScore: 0.9,
    overallScore: 0.9,
    postedAt: "2026-04-16T20:00:00Z",
    aiReasoning: null,
    description: "React",
    minYears: 3,
    employmentType: "full_time",
    urgentHiring: false,
    salaryCurrency: null,
    salaryMin: null,
    salaryMax: null,
    salaryPeriod: null,
  };
}

describe("sendDailyCards", () => {
  it("caps delivery at 8 cards per day and marks only sent cards as notified", async () => {
    const matches = Array.from({ length: 10 }, (_, i) => makeMatch(i + 1));
    const notificationRepository: NotificationRepository = {
      findUnnotifiedMatches: vi.fn().mockResolvedValue(matches),
      markNotified: vi.fn().mockResolvedValue(undefined),
      markManyNotified: vi.fn().mockResolvedValue(undefined),
      listRecent: vi.fn().mockResolvedValue([
        { id: "n1", jobId: "old-1", jobTitle: "Old", companyName: "Co", source: "naukri", sentAt: "2026-04-17T01:00:00Z" },
      ]),
    };
    const telegramSender: TelegramSender = {
      sendMessage: vi.fn(),
      sendMessageWithButtons: vi.fn().mockResolvedValue(undefined),
    };

    const sent = await sendDailyCards("rs-1", {
      notificationRepository,
      telegramSender,
      notifyThreshold: 0.75,
      resumeVersion: 1,
      now: new Date("2026-04-17T03:00:00Z"),
    });

    expect(sent).toBe(MAX_DAILY_CARDS - 1);
    expect(telegramSender.sendMessageWithButtons).toHaveBeenCalledTimes(MAX_DAILY_CARDS - 1);
    expect(notificationRepository.markNotified).toHaveBeenCalledTimes(MAX_DAILY_CARDS - 1);
  });

  it("does not mark a card notified when Telegram send fails", async () => {
    const matches = [makeMatch(1), makeMatch(2)];
    const notificationRepository: NotificationRepository = {
      findUnnotifiedMatches: vi.fn().mockResolvedValue(matches),
      markNotified: vi.fn().mockResolvedValue(undefined),
      markManyNotified: vi.fn().mockResolvedValue(undefined),
      listRecent: vi.fn().mockResolvedValue([]),
    };
    const telegramSender: TelegramSender = {
      sendMessage: vi.fn(),
      sendMessageWithButtons: vi
        .fn()
        .mockRejectedValueOnce(new Error("Telegram 429"))
        .mockResolvedValueOnce(undefined),
    };

    const sent = await sendDailyCards("rs-1", {
      notificationRepository,
      telegramSender,
      notifyThreshold: 0.75,
      resumeVersion: 1,
      now: new Date("2026-04-17T03:00:00Z"),
    });

    expect(sent).toBe(1);
    expect(notificationRepository.markNotified).toHaveBeenCalledTimes(1);
    expect(notificationRepository.markNotified).toHaveBeenCalledWith("job-2");
  });
});
