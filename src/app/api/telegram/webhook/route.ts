import { NextRequest, NextResponse } from "next/server";
import { SupabaseDigestSessionRepository } from "@/features/notifications/infrastructure/SupabaseDigestSessionRepository";
import { createSupabaseServiceClient } from "@/shared/infrastructure/supabaseClient";
import { PAGE_SIZE, buildButtons, formatPage, isValidSecret } from "./helpers";

// Telegram webhook endpoint — handles callback_query updates from inline keyboard buttons.
//
// Registration: run `npm run setup:webhook` once to register this URL with Telegram.
// Security: Telegram sends X-Telegram-Bot-Api-Secret-Token on every request (set during setWebhook).
//
// Supported callback_data:
//   "wr:N" — show page N (0-indexed, PAGE_SIZE jobs each) of the worth-reviewing list

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
  if (!isValidSecret(secret, header)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const cq = update.callback_query;
  console.log("[webhook] callback_query received", {
    id: cq?.id,
    data: cq?.data,
    messageId: cq?.message?.message_id,
    chatId: cq?.message?.chat?.id,
  });

  if (!cq || !cq.data?.startsWith("wr:")) {
    // Non-pagination update — ack and ignore
    if (cq) await answerCallbackQuery(cq.id);
    return new NextResponse("OK", { status: 200 });
  }

  const page = Math.max(0, parseInt(cq.data.split(":")[1] ?? "0", 10));
  console.log("[webhook] handling worth-reviewing page", page);

  // Answer immediately — Telegram shows loading spinner until this is called (10s timeout).
  // DB queries happen after so cold starts don't cause spinner to stick.
  await answerCallbackQuery(cq.id);
  console.log("[webhook] answerCallbackQuery sent");

  const client = createSupabaseServiceClient();
  const sessionRepo = new SupabaseDigestSessionRepository(client);
  const session = await sessionRepo.getLatest();
  console.log("[webhook] session lookup", {
    found: !!session,
    sessionId: session?.id,
    roleSelectionId: session?.roleSelectionId,
    resumeVersion: session?.resumeVersion,
    jobIdCount: session?.worthReviewingJobIds?.length ?? 0,
    paginationMessageId: session?.paginationMessageId ?? null,
  });

  if (!session || session.worthReviewingJobIds.length === 0) {
    console.log("[webhook] no session or empty job list — skipping");
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

  console.log("[webhook] job query result", {
    rowCount: jobRows?.length ?? 0,
    error: error?.message ?? null,
    resumeVersionFilter: session.resumeVersion,
    roleSelectionIdFilter: session.roleSelectionId,
  });

  if (error || !jobRows) {
    console.error("[webhook] job query failed", error);
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
    console.log("[webhook] sending new pagination message");
    const msgId = await sendMessage(botToken, chatId, text, buttons);
    console.log("[webhook] sendMessage result", { msgId });
    if (msgId) await sessionRepo.updatePaginationMessageId(session.id, msgId);
  } else {
    console.log("[webhook] editing existing pagination message", session.paginationMessageId);
    const editOk = await editMessage(botToken, chatId, session.paginationMessageId, text, buttons);
    console.log("[webhook] editMessage result", { ok: editOk });
  }

  return new NextResponse("OK", { status: 200 });
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
      ...(buttons.length > 0 ? { reply_markup: { inline_keyboard: buttons } } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[webhook] sendMessage failed", { status: res.status, body });
    return null;
  }
  const body = (await res.json()) as { ok: boolean; result?: { message_id: number } };
  return body.result?.message_id ?? null;
}

async function editMessage(
  token: string,
  chatId: string,
  messageId: number,
  text: string,
  buttons: unknown[][],
): Promise<boolean> {
  const res = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
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
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[webhook] editMessageText failed", { status: res.status, body });
    return false;
  }
  return true;
}
