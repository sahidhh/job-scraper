import { validateNotifyThreshold } from "@/features/notifications/domain/validation";
import { buildJobCardKeyboard } from "./buildJobCardKeyboard";
import { filterMatches } from "./filterMatches";
import { formatJobCard } from "./formatJobCard";
import type { SendNotificationDeps } from "./sendNotification";

export const MAX_DAILY_CARDS = 8;

export interface SendDailyCardsDeps extends SendNotificationDeps {
  now?: Date;
}

/**
 * Sends up to MAX_DAILY_CARDS (8) compact HTML job cards per day, ordered by
 * T009 ranking, and marks only successfully sent cards as notified.
 */
export async function sendDailyCards(roleSelectionId: string, deps: SendDailyCardsDeps): Promise<number> {
  validateNotifyThreshold(deps.notifyThreshold);

  const now = deps.now ?? new Date();
  const todayUtc = now.toISOString().slice(0, 10);
  const recent = await deps.notificationRepository.listRecent(MAX_DAILY_CARDS * 2);
  const sentTodayCount = recent.filter((item) => item.sentAt.slice(0, 10) === todayUtc).length;
  const remaining = Math.max(0, MAX_DAILY_CARDS - sentTodayCount);
  if (remaining === 0) return 0;

  const rawMatches = await deps.notificationRepository.findUnnotifiedMatches(
    roleSelectionId,
    deps.notifyThreshold,
    deps.resumeVersion,
  );
  const matches = deps.preferences ? filterMatches(rawMatches, deps.preferences) : rawMatches;
  const toSend = matches.slice(0, remaining);

  let sent = 0;
  for (const match of toSend) {
    try {
      const text = formatJobCard(match, now);
      const buttons = buildJobCardKeyboard(match);
      await deps.telegramSender.sendMessageWithButtons(text, buttons);
      await deps.notificationRepository.markNotified(match.jobId);
      sent += 1;
    } catch (error) {
      console.error(`sendDailyCards: failed to notify job ${match.jobId}`, error);
    }
  }

  return sent;
}
