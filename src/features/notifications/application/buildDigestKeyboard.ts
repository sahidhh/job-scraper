import type { InlineKeyboardButton } from "@/features/notifications/domain/TelegramSender";
import type { JobMatch } from "@/features/notifications/domain/types";
import { DIGEST_DISPLAY_LIMIT } from "@/features/notifications/domain/types";

export interface DigestKeyboardOptions {
  /** Pre-signed URL for the Worth Reviewing follow-up route. Omit to hide the button. */
  worthReviewingUrl?: string;
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
//   ✓ Worth Reviewing (N)  (only when worthReviewingCount > 0 and worthReviewingUrl set)
//   📊 Dashboard           (only when dashboardUrl set)
export function buildDigestKeyboard(
  strongMatches: JobMatch[],
  worthReviewingCount: number,
  options: DigestKeyboardOptions = {},
): InlineKeyboardButton[][] {
  const { worthReviewingUrl, dashboardUrl, displayLimit = DIGEST_DISPLAY_LIMIT } = options;
  console.log(`[buildDigestKeyboard] inputs: strongMatchesCount=${strongMatches.length} worthReviewingCount=${worthReviewingCount} hasWorthReviewingUrl=${!!worthReviewingUrl} hasDashboardUrl=${!!dashboardUrl}`);
  const top = strongMatches.slice(0, displayLimit);
  const rows: InlineKeyboardButton[][] = [];

  // Apply buttons: two per row
  for (let i = 0; i < top.length; i += 2) {
    const row: InlineKeyboardButton[] = [
      { text: `Apply #${i + 1}`, url: top[i]!.url },
    ];
    if (top[i + 1]) {
      row.push({ text: `Apply #${i + 2}`, url: top[i + 1]!.url });
    }
    rows.push(row);
  }

  // Worth Reviewing button
  if (worthReviewingCount > 0 && worthReviewingUrl) {
    console.log(`[buildDigestKeyboard] worthReviewingUrl: ${worthReviewingUrl.substring(0, 80)}...`);
    rows.push([{ text: `✓ Worth Reviewing (${worthReviewingCount})`, url: worthReviewingUrl }]);
  }

  // Dashboard button
  if (dashboardUrl) {
    console.log(`[buildDigestKeyboard] dashboardUrl: ${dashboardUrl}`);
    rows.push([{ text: "📊 Dashboard", url: dashboardUrl }]);
  }

  console.log(`[buildDigestKeyboard] generated layout:`, rows.map(r => r.map(b => b.text)));
  return rows;
}
