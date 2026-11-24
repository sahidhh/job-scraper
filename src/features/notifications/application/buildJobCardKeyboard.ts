import type { InlineKeyboardButton } from "@/features/notifications/domain/TelegramSender";
import type { JobMatch } from "@/features/notifications/domain/types";

const TELEGRAM_CALLBACK_DATA_MAX_BYTES = 64;

function makeCallbackButton(text: string, callbackData: string): InlineKeyboardButton {
  if (Buffer.byteLength(callbackData, "utf8") > TELEGRAM_CALLBACK_DATA_MAX_BYTES) {
    throw new Error(
      `Telegram callback_data exceeds ${TELEGRAM_CALLBACK_DATA_MAX_BYTES} bytes: ${callbackData}`,
    );
  }
  return { text, callback_data: callbackData };
}

/**
 * Builds the 2-row inline keyboard for a Telegram job card:
 * Row 1: [🔗 Apply] (URL)
 * Row 2: [✅ Applied] [⏭️ Skip] [🚫 Closed] (callback_data)
 */
export function buildJobCardKeyboard(match: Pick<JobMatch, "jobId" | "url">): InlineKeyboardButton[][] {
  return [
    [{ text: "🔗 Apply", url: match.url }],
    [
      makeCallbackButton("✅ Applied", `st:applied:${match.jobId}`),
      makeCallbackButton("⏭️ Skip", `st:skipped:${match.jobId}`),
      makeCallbackButton("🚫 Closed", `st:closed:${match.jobId}`),
    ],
  ];
}
