import { NextRequest, NextResponse } from "next/server";
import { SupabaseDigestSessionRepository } from "@/features/notifications/infrastructure/SupabaseDigestSessionRepository";
import { STRONG_MATCH_THRESHOLD } from "@/features/notifications/domain/types";
import { createSupabaseServiceClient } from "@/shared/infrastructure/supabaseClient";

// Telegram webhook endpoint — handles callback_query updates from inline keyboard buttons.
//
// Registration: run `npm run setup:webhook` once to register this URL with Telegram.
// Security: Telegram sends X-Telegram-Bot-Api-Secret-Token on every request (set during setWebhook).
//
// Supported callback_data:
//   "wr:N" — show page N (0-indexed, PAGE_SIZE jobs each) of the worth-reviewing list

const PAGE_SIZE = 5;

interface TelegramCallbackQuery {
  id: string;
  data?: string;
  message?: { message_id: number; chat: { id: number } };
}

interface TelegramUpdate {
  callback_query?: TelegramCallbackQuery;
}

interface JobRow {
  id: string;
  title: string;
  company_name: string;
  url: string;
  job_scores: { ai_score: number | null }[];
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.TELEGRAM_CALLBACK_SECRET;
  const header = req.headers.get("x-telegram-bot-api-secret-token");
  if (!secret || !header || header !== secret) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const cq = update.callback_query;
  if (!cq || !cq.data?.startsWith("wr:")) {
    // Non-pagination update — ack and ignore
    if (cq) await answerCallbackQuery(cq.id);
    return new NextResponse("OK", { status: 200 });
  }

  const page = Math.max(0, parseInt(cq.data.split(":")[1] ?? "0", 10));

  // Answer immediately — Telegram shows loading spinner until this is called (10s timeout).
  // DB queries happen after so cold starts don't cause spinner to stick.
  await answerCallbackQuery(cq.id);

  const client = createSupabaseServiceClient();
  const sessionRepo = new SupabaseDigestSessionRepository(client);
  const session = await sessionRepo.getLatest();

  if (!session || session.worthReviewingJobIds.length === 0) {
    return new NextResponse("OK", { status: 200 });
  }

  // Fetch job details for this session's worth-reviewing jobs
  const { data: jobRows, error } = await client
    .from("jobs")
    .select("id, title, company_name, url, job_scores!inner(ai_score)")
    .in("id", session.worthReviewingJobIds)
    .eq("job_scores.role_selection_id", session.roleSelectionId)
    .eq("job_scores.resume_version", session.resumeVersion)
    .returns<JobRow[]>();

  if (error || !jobRows) {
    return new NextResponse("OK", { status: 200 });
  }

  // Re-sort descending by score (DB order not guaranteed with .in())
  const jobs = jobRows
    .map((j) => ({
      id: j.id,
      title: j.title,
      companyName: j.company_name,
      url: j.url,
      aiScore: j.job_scores[0]?.ai_score ?? 0,
    }))
    .sort((a, b) => b.aiScore - a.aiScore);

  const totalPages = Math.max(1, Math.ceil(jobs.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageJobs = jobs.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const text = formatPage(pageJobs, safePage, totalPages, jobs.length);
  const buttons = buildButtons(safePage, totalPages);

  const botToken = process.env.TELEGRAM_BOT_TOKEN!;
  const chatId = process.env.TELEGRAM_CHAT_ID!;

  if (!session.paginationMessageId) {
    const msgId = await sendMessage(botToken, chatId, text, buttons);
    if (msgId) await sessionRepo.updatePaginationMessageId(session.id, msgId);
  } else {
    await editMessage(botToken, chatId, session.paginationMessageId, text, buttons);
  }

  return new NextResponse("OK", { status: 200 });
}

function formatPage(
  jobs: { title: string; companyName: string; url: string; aiScore: number }[],
  page: number,
  totalPages: number,
  total: number,
): string {
  const header = `📋 <b>Worth Reviewing</b> — Page ${page + 1}/${totalPages} (${total} total)\n`;
  const lines = jobs.map(
    (j, i) =>
      `\n${page * PAGE_SIZE + i + 1}. <b>${escHtml(j.title)}</b> — ${escHtml(j.companyName)}\n` +
      `   Score: ${Math.round(j.aiScore * 100)}% | <a href="${j.url}">Apply</a>`,
  );
  return header + lines.join("");
}

function buildButtons(
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

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function answerCallbackQuery(id: string, text?: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: id, ...(text ? { text } : {}) }),
  });
}

async function sendMessage(
  token: string,
  chatId: string,
  text: string,
  buttons: unknown[][],
): Promise<number | null> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: buttons },
    }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { ok: boolean; result?: { message_id: number } };
  return body.result?.message_id ?? null;
}

async function editMessage(
  token: string,
  chatId: string,
  messageId: number,
  text: string,
  buttons: unknown[][],
): Promise<void> {
  await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: buttons },
    }),
  });
}
