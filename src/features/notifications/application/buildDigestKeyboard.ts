import type { InlineKeyboardButton } from "@/features/notifications/domain/TelegramSender";
import type { JobMatch } from "@/features/notifications/domain/types";
import { DIGEST_DISPLAY_LIMIT } from "@/features/notifications/domain/types";

export interface DigestKeyboardOptions {
  /** Show the "Worth Reviewing" callback button. Omit or false to hide. */
  showWorthReviewing?: boolean;
  /** Dashboard URL to open when the user taps the Dashboard button. Omit to hide. */
  dashboardUrl?: string;
  /** How many strong matches to generate Apply buttons for (default: DIGEST_DISPLAY_LIMIT). */
  displayLimit?: number;
}

// Builds the inline keyboard for the MVP digest message.
//
// Layout:
//   Apply #1 | Apply #2   (one row per pair of matches)
//   Apply #3 | Apply #4
//   Apply #5
//   ✓ Worth Reviewing (N)  (only when showWorthReviewing is true — triggers webhook pagination)
//   📊 Dashboard           (only when dashboardUrl set)
export function buildDigestKeyboard(
  strongMatches: JobMatch[],
  worthReviewingCount: number,
  options: DigestKeyboardOptions = {},
): InlineKeyboardButton[][] {
  const { showWorthReviewing, dashboardUrl, displayLimit = DIGEST_DISPLAY_LIMIT } = options;
  const top = strongMatches.slice(0, displayLimit);
  const rows: InlineKeyboardButton[][] = [];

  // One row per match: [Apply #N] only.
  // mailto: URLs are rejected by Telegram Bot API (BUTTON_URL_INVALID) — Contact button removed.
  for (let i = 0; i < top.length; i++) {
    const row: InlineKeyboardButton[] = [{ text: `Apply #${i + 1}`, url: top[i]!.url }];
    rows.push(row);
  }

  // Worth Reviewing button — callback_data triggers webhook pagination
  if (showWorthReviewing && worthReviewingCount > 0) {
    rows.push([{ text: `✓ Worth Reviewing (${worthReviewingCount})`, callback_data: "wr:0" }]);
  }

  // Dashboard button
  if (dashboardUrl) {
    rows.push([{ text: "📊 Dashboard", url: dashboardUrl }]);
  }

  return rows;
}
