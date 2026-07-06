import { timingSafeEqual } from "node:crypto";
import { buildJobHighlights, type JobHighlightSignals } from "@/features/notifications/application/buildJobHighlights";
import { STRONG_MATCH_THRESHOLD } from "@/features/notifications/domain/types";
import { requireEnv } from "@/shared/infrastructure/env";
import { fetchWithRetry } from "@/shared/infrastructure/http";
import { escapeHtml } from "@/shared/infrastructure/text";

const PAGE_SIZE = 5;

// Telegram gives the user's client a short window to receive an answer to
// callback_query before it gives up waiting -- this must fail fast (no
// retry) rather than hang, or the button spinner never resolves.
const ANSWER_CALLBACK_TIMEOUT_MS = 5_000;
// sendMessage/editMessage run after the callback is already answered, so a
// longer per-attempt timeout with one retry is fine here.
const SEND_MESSAGE_TIMEOUT_MS = 8_000;

export function isValidSecret(secret: string | undefined, header: string | null): boolean {
  if (!secret || !header) return false;
  const secretBuf = Buffer.from(secret);
  const headerBuf = Buffer.from(header);
  return secretBuf.length === headerBuf.length && timingSafeEqual(secretBuf, headerBuf);
}

// Answers Telegram's callback_query so the tapped button's loading spinner
// resolves. Uses requireEnv (throws loudly on a missing token) and a bounded
// timeout (no retry) instead of a raw, unbounded fetch -- previously a
// missing TELEGRAM_BOT_TOKEN silently no-opped here, and a slow/hanging
// fetch had no ceiling, so the button could be left spinning with nothing
// in the logs to explain why. Callers must catch: a thrown error here must
// not prevent the webhook from responding to Telegram's original request.
export async function answerCallbackQuery(id: string, text?: string): Promise<void> {
  const token = requireEnv("TELEGRAM_BOT_TOKEN");
  await fetchWithRetry(
    `https://api.telegram.org/bot${token}/answerCallbackQuery`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: id, ...(text ? { text } : {}) }),
    },
    { retries: 0, timeoutMs: ANSWER_CALLBACK_TIMEOUT_MS },
  );
}

export async function sendMessage(
  text: string,
  buttons: { text: string; callback_data?: string; url?: string }[][],
): Promise<number | null> {
  const token = requireEnv("TELEGRAM_BOT_TOKEN");
  const chatId = requireEnv("TELEGRAM_CHAT_ID");
  const res = await fetchWithRetry(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...(buttons.length > 0 ? { reply_markup: { inline_keyboard: buttons } } : {}),
      }),
    },
    { timeoutMs: SEND_MESSAGE_TIMEOUT_MS },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[webhook] sendMessage failed", { status: res.status, body });
    return null;
  }
  const body = (await res.json()) as { ok: boolean; result?: { message_id: number } };
  return body.result?.message_id ?? null;
}

export async function editMessage(
  messageId: number,
  text: string,
  buttons: { text: string; callback_data?: string; url?: string }[][],
): Promise<boolean> {
  const token = requireEnv("TELEGRAM_BOT_TOKEN");
  const chatId = requireEnv("TELEGRAM_CHAT_ID");
  const res = await fetchWithRetry(
    `https://api.telegram.org/bot${token}/editMessageText`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...(buttons.length > 0 ? { reply_markup: { inline_keyboard: buttons } } : {}),
      }),
    },
    { timeoutMs: SEND_MESSAGE_TIMEOUT_MS },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[webhook] editMessageText failed", { status: res.status, body });
    return false;
  }
  return true;
}

export function formatPage(
  jobs: ({ title: string; companyName: string; url: string; aiScore: number } & JobHighlightSignals)[],
  page: number,
  totalPages: number,
  total: number,
): string {
  const header = `📋 <b>Worth Reviewing</b> — Page ${page + 1}/${totalPages} (${total} total)\n`;
  const lines = jobs.map((j, i) => {
    const highlights = buildJobHighlights(j);
    const highlightLine = highlights.length > 0 ? `\n   ${escapeHtml(highlights.join(" · "))}` : "";
    return (
      `\n${page * PAGE_SIZE + i + 1}. <b>${escapeHtml(j.title)}</b> — ${escapeHtml(j.companyName)}\n` +
      `   Score: ${Math.round(j.aiScore * 100)}% | <a href="${escapeHtml(j.url)}">Apply</a>${highlightLine}`
    );
  });
  return header + lines.join("");
}

export function buildButtons(
  page: number,
  totalPages: number,
): { text: string; callback_data?: string; url?: string }[][] {
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  const navRow: { text: string; callback_data: string }[] = [];
  if (page > 0) navRow.push({ text: "← Prev", callback_data: `wr:${page - 1}` });
  if (page < totalPages - 1) navRow.push({ text: "Next →", callback_data: `wr:${page + 1}` });

  const rows: { text: string; callback_data?: string; url?: string }[][] = [];
  if (navRow.length > 0) rows.push(navRow);
  if (appUrl) rows.push([{ text: "📊 Dashboard", url: `${appUrl}/dashboard?minScore=${STRONG_MATCH_THRESHOLD}` }]);
  return rows;
}

export { PAGE_SIZE };
