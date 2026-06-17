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

    // retries: 0 — TelegramBotSender owns 429 retry logic below via retry_after;
    // letting fetchWithRetry also retry 429 causes a 2000ms internal delay that
    // conflicts with the retry_after-based wait.
    let response = await fetchWithRetry(url, init, { retries: 0 });
    let body = (await response.json()) as TelegramSendMessageResponse;

    if (response.status === 429 && body.parameters?.retry_after !== undefined) {
      await delay(Math.min(body.parameters.retry_after * 1000, MAX_RETRY_AFTER_MS));
      response = await fetchWithRetry(url, init, { retries: 0 });
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
