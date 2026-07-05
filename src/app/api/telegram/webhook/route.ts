import { NextRequest, NextResponse } from "next/server";
import type { EmploymentType } from "@/features/jobs/domain/extractJobAttributes";
import type { SalaryPeriod } from "@/features/jobs/domain/extractSalary";
import { SupabaseDigestSessionRepository } from "@/features/notifications/infrastructure/SupabaseDigestSessionRepository";
import type { LocationTag } from "@/shared/domain/enums";
import { createSupabaseServiceClient } from "@/shared/infrastructure/supabaseClient";
import {
  PAGE_SIZE,
  answerCallbackQuery,
  buildButtons,
  editMessage,
  formatPage,
  isValidSecret,
  sendMessage,
} from "./helpers";

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
  location_tags: LocationTag[];
  urgent_hiring: boolean;
  employment_type: EmploymentType | null;
  salary_currency: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: SalaryPeriod | null;
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
    // Non-pagination update — ack and ignore. A failed ack must not crash
    // the handler; Telegram already gets a 200 either way.
    if (cq) {
      try {
        await answerCallbackQuery(cq.id);
      } catch (err) {
        console.error("[webhook] answerCallbackQuery failed", err);
      }
    }
    return new NextResponse("OK", { status: 200 });
  }

  const page = Math.max(0, parseInt(cq.data.split(":")[1] ?? "0", 10));
  console.log("[webhook] handling worth-reviewing page", page);

  // Everything below is best-effort: the callback is answered first (so the
  // button spinner resolves regardless of what happens next), and any
  // failure afterward — including in the ack itself — is caught rather than
  // left as an unhandled rejection, so the webhook always responds cleanly
  // instead of leaving Telegram to fall back on its own timeout.
  try {
    // Answer immediately — Telegram shows a loading spinner on the tapped
    // button until this call reaches Telegram's servers (or its own ~10s
    // wait elapses). DB queries happen after so cold starts don't add to
    // that window. A missing TELEGRAM_BOT_TOKEN or a hung request now
    // surfaces here (bounded timeout, thrown error) instead of silently
    // leaving the button to spin forever with nothing in the logs.
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

    // Fetch job details for this session's worth-reviewing jobs. Includes
    // the same deterministic attribute columns (location/urgency/employment
    // type/salary) that the individual and primary-digest messages already
    // use for "why this job" highlights (buildJobHighlights.ts) -- no extra
    // query, just wider column selection on the query that already runs.
    const { data: jobRows, error } = await client
      .from("jobs")
      .select(
        "id, title, company_name, url, location_tags, urgent_hiring, employment_type, salary_currency, salary_min, salary_max, salary_period, job_scores!inner(ai_score)",
      )
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
        locationTags: j.location_tags,
        urgentHiring: j.urgent_hiring,
        employmentType: j.employment_type,
        salaryCurrency: j.salary_currency,
        salaryMin: j.salary_min,
        salaryMax: j.salary_max,
        salaryPeriod: j.salary_period,
      }))
      .sort((a, b) => b.aiScore - a.aiScore);

    const totalPages = Math.max(1, Math.ceil(jobs.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages - 1);
    const pageJobs = jobs.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

    const text = formatPage(pageJobs, safePage, totalPages, jobs.length);
    const buttons = buildButtons(safePage, totalPages);

    if (!session.paginationMessageId) {
      console.log("[webhook] sending new pagination message");
      const msgId = await sendMessage(text, buttons);
      console.log("[webhook] sendMessage result", { msgId });
      if (msgId) await sessionRepo.updatePaginationMessageId(session.id, msgId);
    } else {
      console.log("[webhook] editing existing pagination message", session.paginationMessageId);
      const editOk = await editMessage(session.paginationMessageId, text, buttons);
      console.log("[webhook] editMessage result", { ok: editOk });
    }

    return new NextResponse("OK", { status: 200 });
  } catch (err) {
    console.error("[webhook] unexpected error handling worth-reviewing callback", err);
    return new NextResponse("OK", { status: 200 });
  }
}
