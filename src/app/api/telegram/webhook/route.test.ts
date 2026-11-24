import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mockAnswerCallbackQuery = vi.fn();
const mockEditMessage = vi.fn();

vi.mock("./helpers", () => ({
  PAGE_SIZE: 5,
  isValidSecret: (secret: string | undefined, header: string | null) => Boolean(secret && header && secret === header),
  answerCallbackQuery: (...args: unknown[]) => mockAnswerCallbackQuery(...args),
  editMessage: (...args: unknown[]) => mockEditMessage(...args),
  sendMessage: vi.fn(),
  formatPage: vi.fn(),
  buildButtons: vi.fn(),
}));

const mockFrom = vi.fn();
vi.mock("@/shared/infrastructure/supabaseClient", () => ({
  createSupabaseServiceClient: () => ({ from: mockFrom }),
}));

const JOB_ID = "123e4567-e89b-12d3-a456-426614174000";

function makeRequest(body: unknown, secret = "test-secret"): NextRequest {
  return new NextRequest("https://example.com/api/telegram/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "x-telegram-bot-api-secret-token": secret } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/telegram/webhook", () => {
  beforeEach(() => {
    process.env.TELEGRAM_CALLBACK_SECRET = "test-secret";
    mockAnswerCallbackQuery.mockReset().mockResolvedValue(undefined);
    mockEditMessage.mockReset().mockResolvedValue(true);
    mockFrom.mockReset();
  });

  afterEach(() => {
    delete process.env.TELEGRAM_CALLBACK_SECRET;
  });

  it("returns 401 when secret header is missing or invalid", async () => {
    const res = await POST(makeRequest({ callback_query: { id: "cq-1" } }, "wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("answers with Invalid action and returns 200 for malformed st: payloads", async () => {
    const res = await POST(
      makeRequest({
        callback_query: {
          id: "cq-bad",
          data: "st:applied:not-a-uuid",
          message: { message_id: 10, chat: { id: 1 } },
        },
      }),
    );

    expect(res.status).toBe(200);
    expect(mockAnswerCallbackQuery).toHaveBeenCalledWith("cq-bad", "Invalid action");
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockEditMessage).not.toHaveBeenCalled();
  });

  it("handles st:applied:<jobId> by upserting job_state with Applied status and editing the card", async () => {
    const singleMock = vi.fn().mockResolvedValue({ data: { id: "status-applied-id" }, error: null });
    const eqStatusMock = vi.fn().mockReturnValue({ single: singleMock });
    const selectStatusMock = vi.fn().mockReturnValue({ eq: eqStatusMock });
    const upsertMock = vi.fn().mockResolvedValue({ error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "job_statuses") return { select: selectStatusMock };
      if (table === "job_state") return { upsert: upsertMock };
      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await POST(
      makeRequest({
        callback_query: {
          id: "cq-app",
          data: `st:applied:${JOB_ID}`,
          message: { message_id: 42, chat: { id: 1 }, text: "Engineer @ Acme & Co" },
        },
      }),
    );

    expect(res.status).toBe(200);
    expect(mockAnswerCallbackQuery).toHaveBeenCalledWith("cq-app", "Updating...");
    expect(eqStatusMock).toHaveBeenCalledWith("name", "Applied");
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ job_id: JOB_ID, status_id: "status-applied-id" }),
      { onConflict: "job_id" },
    );
    expect(mockEditMessage).toHaveBeenCalledWith(42, "Engineer @ Acme &amp; Co\n\n✅ Marked as <b>Applied</b>", []);
  });

  it("handles st:skipped:<jobId> by upserting job_state with Not Interested status and editing the card", async () => {
    const singleMock = vi.fn().mockResolvedValue({ data: { id: "status-not-interested-id" }, error: null });
    const eqStatusMock = vi.fn().mockReturnValue({ single: singleMock });
    const selectStatusMock = vi.fn().mockReturnValue({ eq: eqStatusMock });
    const upsertMock = vi.fn().mockResolvedValue({ error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "job_statuses") return { select: selectStatusMock };
      if (table === "job_state") return { upsert: upsertMock };
      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await POST(
      makeRequest({
        callback_query: {
          id: "cq-skip",
          data: `st:skipped:${JOB_ID}`,
          message: { message_id: 43, chat: { id: 1 }, text: "Engineer @ Acme" },
        },
      }),
    );

    expect(res.status).toBe(200);
    expect(eqStatusMock).toHaveBeenCalledWith("name", "Not Interested");
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ job_id: JOB_ID, status_id: "status-not-interested-id" }),
      { onConflict: "job_id" },
    );
    expect(mockEditMessage).toHaveBeenCalledWith(43, "Engineer @ Acme\n\n⏭️ Marked as <b>Skipped</b>", []);
  });

  it("handles st:closed:<jobId> by setting jobs.is_active = false and editing the card", async () => {
    const eqJobMock = vi.fn().mockResolvedValue({ error: null });
    const updateMock = vi.fn().mockReturnValue({ eq: eqJobMock });

    mockFrom.mockImplementation((table: string) => {
      if (table === "jobs") return { update: updateMock };
      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await POST(
      makeRequest({
        callback_query: {
          id: "cq-close",
          data: `st:closed:${JOB_ID}`,
          message: { message_id: 44, chat: { id: 1 }, text: "Engineer @ Acme" },
        },
      }),
    );

    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith({ is_active: false, inactive_reason: "closed" });
    expect(eqJobMock).toHaveBeenCalledWith("id", JOB_ID);
    expect(mockEditMessage).toHaveBeenCalledWith(44, "Engineer @ Acme\n\n🚫 Marked as <b>Closed</b>", []);
  });
});
