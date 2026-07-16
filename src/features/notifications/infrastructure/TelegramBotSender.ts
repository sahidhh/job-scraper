import type { InlineKeyboardButton, TelegramSender } from "@/features/notifications/domain/TelegramSender";
import { requireEnv } from "@/shared/infrastructure/env";
import { delay, fetchWithRetry } from "@/shared/infrastructure/http";

interface TelegramSendMessageResponse {
  ok: boolean;
  description?: string;
  parameters?: { retry_after?: number };
}

// Telegram caps "retry after" waits so a single flood-controlled send can't
// stall the cron job for the duration of a long global flood wait.
const MAX_RETRY_AFTER_MS = 30_000;

// Bounds a hung connect (e.g. the runner's TCP handshake to api.telegram.org
// never completing) instead of waiting on the OS-level timeout, and gives a
// single transient network-level failure (no HTTP response at all -- DNS
// hiccup, dropped handshake, ETIMEDOUT) one extra attempt before giving up.
const NETWORK_TIMEOUT_MS = 10_000;
const NETWORK_RETRY_DELAY_MS = 2_000;

// Telegram Bot API adapter (scoring.md §4, decisions.md AD-08). Throws on
// failure -- sendNotification has no fallback for an undeliverable message.
export class TelegramBotSender implements TelegramSender {
  async sendMessage(text: string): Promise<void> {
    await this.post({ text, parse_mode: "HTML" });
  }

  async sendMessageWithButtons(text: string, buttons: InlineKeyboardButton[][]): Promise<void> {
    await this.post({
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: buttons },
    });
  }

  private async post(payload: Record<string, unknown>): Promise<void> {
    const token = requireEnv("TELEGRAM_BOT_TOKEN");
    const chatId = requireEnv("TELEGRAM_CHAT_ID");
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, ...payload }),
    };

    let response = await this.sendOnce(url, init);
    let body = (await response.json()) as TelegramSendMessageResponse;

    if (response.status === 429 && body.parameters?.retry_after !== undefined) {
      await delay(Math.min(body.parameters.retry_after * 1000, MAX_RETRY_AFTER_MS));
      response = await this.sendOnce(url, init);
      body = (await response.json()) as TelegramSendMessageResponse;
    }

    if (!response.ok || !body.ok) {
      throw new Error(`Telegram sendMessage failed: ${body.description ?? response.status}`);
    }
  }

  // fetchWithRetry's own `retries` stays 0 here -- this class owns 429 retry
  // logic above via retry_after, and letting fetchWithRetry also retry 429
  // would race that with a flat 2000ms delay. The catch below is a separate,
  // one-shot retry for network-level failures only (nothing that reaches the
  // 429 branch above, since no response ever came back).
  private async sendOnce(url: string, init: RequestInit): Promise<Response> {
    const options = { retries: 0, timeoutMs: NETWORK_TIMEOUT_MS };
    try {
      return await fetchWithRetry(url, init, options);
    } catch {
      await delay(NETWORK_RETRY_DELAY_MS);
      return await fetchWithRetry(url, init, options);
    }
  }
}

