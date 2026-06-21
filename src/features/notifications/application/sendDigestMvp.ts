import type { DigestSessionRepository } from "@/features/notifications/domain/DigestSessionRepository";
import type { NotificationRepository } from "@/features/notifications/domain/NotificationRepository";
import type { TelegramSender } from "@/features/notifications/domain/TelegramSender";
import type { JobMatch, NotificationPreferences } from "@/features/notifications/domain/types";
import { DIGEST_DISPLAY_LIMIT, STRONG_MATCH_THRESHOLD } from "@/features/notifications/domain/types";
import { validateNotifyThreshold } from "@/features/notifications/domain/validation";
import { bandMatches } from "./bandMatches";
import { buildDigestKeyboard } from "./buildDigestKeyboard";
import { filterMatches } from "./filterMatches";
import { formatDigestMvp } from "./formatDigestMvp";

export interface SendDigestMvpDeps {
  notificationRepository: NotificationRepository;
  telegramSender: TelegramSender;
  notifyThreshold: number;
  /** Optional include-filters applied before delivery. null or absent = notify all. */
  preferences?: NotificationPreferences | null;
  /** Pre-built dashboard URL for the keyboard button. Omit to hide the button. */
  dashboardUrl?: string;
  /** Saves worth-reviewing job IDs for Telegram pagination. Omit to skip persistence. */
  digestSessionRepository?: DigestSessionRepository;
}

export interface DigestMvpResult {
  strongCount: number;
  worthReviewingCount: number;
}

// Sends a single Telegram digest message with inline Apply / Worth-Reviewing
// / Dashboard buttons, then marks every included match as notified.
//
// Score banding (using STRONG_MATCH_THRESHOLD):
//   Strong Match  → ai_score >= STRONG_MATCH_THRESHOLD  (shown in message + Apply buttons)
//   Worth Reviewing → ai_score <  STRONG_MATCH_THRESHOLD  (callback button, paginated on tap)
//
// A send failure throws and leaves all jobs unmarked for retry on the next run.
// Returns 0 counts when there are no unnotified matches.
export async function sendDigestMvp(
  roleSelectionId: string,
  deps: SendDigestMvpDeps,
): Promise<DigestMvpResult> {
  validateNotifyThreshold(deps.notifyThreshold);

  const rawMatches = await deps.notificationRepository.findUnnotifiedMatches(
    roleSelectionId,
    deps.notifyThreshold,
  );
  const matches = deps.preferences ? filterMatches(rawMatches, deps.preferences) : rawMatches;

  if (matches.length === 0) return { strongCount: 0, worthReviewingCount: 0 };

  const { strongMatches, worthReviewing } = bandMatches(matches, STRONG_MATCH_THRESHOLD);

  const text = formatDigestMvp(strongMatches, worthReviewing.length, DIGEST_DISPLAY_LIMIT);
  const buttons = buildDigestKeyboard(strongMatches, worthReviewing.length, {
    showWorthReviewing: worthReviewing.length > 0,
    dashboardUrl: deps.dashboardUrl,
    displayLimit: DIGEST_DISPLAY_LIMIT,
  });

  await deps.telegramSender.sendMessageWithButtons(text, buttons);

  // Mark ALL matches (both bands) as notified to prevent re-delivery on the next cron run.
  for (const match of matches) {
    await deps.notificationRepository.markNotified(match.jobId);
  }

  // Persist worth-reviewing IDs so the webhook can paginate them on demand.
  if (deps.digestSessionRepository && worthReviewing.length > 0) {
    await deps.digestSessionRepository.save(
      roleSelectionId,
      worthReviewing.map((j: JobMatch) => j.jobId),
    );
  }

  return { strongCount: strongMatches.length, worthReviewingCount: worthReviewing.length };
}
