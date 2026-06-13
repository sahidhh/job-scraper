import type { TelegramSender } from "@/features/notifications/domain/TelegramSender";
import { requireEnv } from "@/shared/infrastructure/env";
import { fetchWithRetry } from "@/shared/infrastructure/http";

interface TelegramSendMessageResponse {
  ok: boolean;
  description?: string;
  parameters?: { retry_after?: number };
}

// Telegram caps "retry after" waits so a single flood-controlled send can't
// stall the cron job for the duration of a long global flood wait.
const MAX_RETRY_AFTER_MS = 30_000;

// Telegram Bot API adapter (scoring.md §4, decisions.md AD-08). Throws on
// failure -- sendNotification has no fallback for an undeliverable message.
export class TelegramBotSender implements TelegramSender {
  async sendMessage(text: string): Promise<void> {
    const token = requireEnv("TELEGRAM_BOT_TOKEN");
    const chatId = requireEnv("TELEGRAM_CHAT_ID");
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    };

    let response = await fetchWithRetry(url, init);
    let body = (await response.json()) as TelegramSendMessageResponse;

    // Telegram's 429s carry a `retry_after` (seconds) in `parameters` --
    // fetchWithRetry treats 4xx as final, so retry once more here, waiting
    // the time Telegram asked for (capped).
    if (response.status === 429 && body.parameters?.retry_after !== undefined) {
      await delay(Math.min(body.parameters.retry_after * 1000, MAX_RETRY_AFTER_MS));
      response = await fetchWithRetry(url, init);
      body = (await response.json()) as TelegramSendMessageResponse;
    }

    if (!response.ok || !body.ok) {
      throw new Error(`Telegram sendMessage failed: ${body.description ?? response.status}`);
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
