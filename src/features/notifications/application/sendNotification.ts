import type { NotificationRepository } from "@/features/notifications/domain/NotificationRepository";
import type { TelegramSender } from "@/features/notifications/domain/TelegramSender";
import type { NotificationPreferences } from "@/features/notifications/domain/types";
import { validateNotifyThreshold } from "@/features/notifications/domain/validation";
import { filterMatches } from "./filterMatches";
import { formatMatchMessage } from "./formatMatchMessage";

export interface SendNotificationDeps {
  notificationRepository: NotificationRepository;
  telegramSender: TelegramSender;
  notifyThreshold: number;
  /** Active resume version; scopes the job_scores join to prevent duplicate results. */
  resumeVersion: number;
  /** Optional include-filters applied before delivery. null or absent = notify all (default). */
  preferences?: NotificationPreferences | null;
}

// Sends one Telegram message per unnotified match for roleSelectionId
// (scoring.md §4, decisions.md AD-08) and marks each as notified.
// Returns the number of messages sent.
//
// Each match is isolated in its own try/catch: a send failure for one match
// (e.g. a rejected Telegram payload or a transient API error) is logged and
// skipped rather than aborting the loop, so it doesn't permanently block
// markNotified for every match behind it on this and future runs
// (maintainability-audit.md Finding #1).
export async function sendNotification(roleSelectionId: string, deps: SendNotificationDeps): Promise<number> {
  validateNotifyThreshold(deps.notifyThreshold);

  const rawMatches = await deps.notificationRepository.findUnnotifiedMatches(roleSelectionId, deps.notifyThreshold, deps.resumeVersion);
  const matches = deps.preferences ? filterMatches(rawMatches, deps.preferences) : rawMatches;

  let sent = 0;
  for (const match of matches) {
    try {
      const message = formatMatchMessage(match);
      await deps.telegramSender.sendMessage(message);
      await deps.notificationRepository.markNotified(match.jobId);
      sent += 1;
    } catch (error) {
      console.error(`sendNotification: failed to notify job ${match.jobId}`, error);
    }
  }

  return sent;
}
