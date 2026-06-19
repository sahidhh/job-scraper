import type { NotificationRepository } from "@/features/notifications/domain/NotificationRepository";
import type { TelegramSender } from "@/features/notifications/domain/TelegramSender";
import type { NotificationPreferences } from "@/features/notifications/domain/types";
import { validateNotifyThreshold } from "@/features/notifications/domain/validation";
import { filterMatches } from "./filterMatches";
import { formatDigestMessage, splitDigestChunks } from "./formatDigestMessage";

export interface SendDigestDeps {
  notificationRepository: NotificationRepository;
  telegramSender: TelegramSender;
  notifyThreshold: number;
  /** Optional include-filters applied before delivery. null or absent = notify all (default). */
  preferences?: NotificationPreferences | null;
}

// Sends a single Telegram digest message (split across multiple sends if the
// text exceeds the 4096-char Telegram limit) summarising all unnotified matches
// for roleSelectionId, then marks every included job as notified.
//
// Unlike sendNotification (one message per job), this batches all matches into
// one digest. A failure while sending a chunk aborts the remaining chunks and
// leaves all jobs unmarked so the next cron run can retry the full digest.
//
// Returns the number of jobs included in the digest (0 if nothing to send).
export async function sendDigest(roleSelectionId: string, deps: SendDigestDeps): Promise<number> {
  validateNotifyThreshold(deps.notifyThreshold);

  const rawMatches = await deps.notificationRepository.findUnnotifiedMatches(roleSelectionId, deps.notifyThreshold);
  const matches = deps.preferences ? filterMatches(rawMatches, deps.preferences) : rawMatches;

  if (matches.length === 0) return 0;

  const chunks = splitDigestChunks(formatDigestMessage(matches));
  for (const chunk of chunks) {
    await deps.telegramSender.sendMessage(chunk);
  }

  for (const match of matches) {
    await deps.notificationRepository.markNotified(match.jobId);
  }

  return matches.length;
}
