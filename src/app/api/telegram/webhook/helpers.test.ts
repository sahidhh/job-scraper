import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobHighlightSignals } from "@/features/notifications/application/buildJobHighlights";
import { answerCallbackQuery, buildButtons, editMessage, formatPage, isValidSecret, sendMessage } from "./helpers";

describe("isValidSecret", () => {
  it("accepts a header that matches the configured secret", () => {
    expect(isValidSecret("s3cret", "s3cret")).toBe(true);
  });

  it("rejects a header that does not match the configured secret", () => {
    expect(isValidSecret("s3cret", "wrong")).toBe(false);
  });

  it("rejects when the secret is not configured", () => {
    expect(isValidSecret(undefined, "s3cret")).toBe(false);
  });

  it("rejects when the header is missing", () => {
    expect(isValidSecret("s3cret", null)).toBe(false);
  });

  it("rejects a header of a different length without throwing", () => {
    expect(isValidSecret("s3cret", "s3cretlonger")).toBe(false);
  });
});

const NO_HIGHLIGHTS: JobHighlightSignals = {
  locationTags: [],
  urgentHiring: false,
  employmentType: null,
  salaryCurrency: null,
  salaryMin: null,
  salaryMax: null,
  salaryPeriod: null,
};

describe("formatPage", () => {
  it("HTML-escapes title and company name", () => {
    const text = formatPage(
      [{ title: "<b>Hacker</b>", companyName: "Acme & Co", url: "https://example.com/job/1", aiScore: 0.9, ...NO_HIGHLIGHTS }],
      0,
      1,
      1,
    );
    expect(text).toContain("&lt;b&gt;Hacker&lt;/b&gt;");
    expect(text).toContain("Acme &amp; Co");
  });

  it("escapes a quote in the job url so it cannot break out of the href attribute", () => {
    // Regression test: a scraped job URL containing a `"` used to be
    // interpolated raw into `<a href="...">`, letting it terminate the
    // attribute early and inject arbitrary Telegram-supported HTML tags.
    const maliciousUrl = 'https://example.com/job/1"><b>injected</b><a href="https://example.com';
    const text = formatPage(
      [{ title: "Engineer", companyName: "Acme", url: maliciousUrl, aiScore: 0.5, ...NO_HIGHLIGHTS }],
      0,
      1,
      1,
    );

    expect(text).not.toContain(`href="${maliciousUrl}"`);
    expect(text).toContain('href="https://example.com/job/1&quot;&gt;&lt;b&gt;injected&lt;/b&gt;&lt;a href=&quot;https://example.com"');
  });

  it("omits the highlight line entirely when a job has no notable signals", () => {
    const text = formatPage(
      [{ title: "Engineer", companyName: "Acme", url: "https://example.com/1", aiScore: 0.5, ...NO_HIGHLIGHTS }],
      0,
      1,
      1,
    );
    expect(text).not.toContain("🌍");
  });

  it("includes 'why this job' highlights, matching the individual/digest notification format", () => {
    // Regression: the webhook's paginated Worth Reviewing list previously
    // fetched only id/title/company_name/url/ai_score, so it never rendered
    // the same remote/urgent/salary/employment-type badges the primary
    // digest and individual-mode messages already show for every match.
    const text = formatPage(
      [
        {
          title: "Engineer",
          companyName: "Acme",
          url: "https://example.com/1",
          aiScore: 0.78,
          locationTags: ["remote"],
          urgentHiring: true,
          employmentType: "contract",
          salaryCurrency: "$",
          salaryMin: 80000,
          salaryMax: 100000,
          salaryPeriod: "yearly",
        },
      ],
      0,
      1,
      1,
    );
    expect(text).toContain("🌍 Remote");
    expect(text).toContain("⚡ Urgent hiring");
    expect(text).toContain("$80,000–100,000/yr");
    expect(text).toContain("📄 Contract");
  });
});

describe("answerCallbackQuery", () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    delete process.env.TELEGRAM_BOT_TOKEN;
  });

  it("throws immediately instead of silently no-opping when the bot token is missing", async () => {
    // Regression: this used to be `if (!token) return;` -- a missing
    // TELEGRAM_BOT_TOKEN silently skipped the Telegram API call, leaving
    // the tapped button's spinner with no acknowledgement and nothing in
    // the logs to explain why.
    delete process.env.TELEGRAM_BOT_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(answerCallbackQuery("cbq-1")).rejects.toThrow(/TELEGRAM_BOT_TOKEN/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts callback_query_id to Telegram's answerCallbackQuery endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await answerCallbackQuery("cbq-1", "hello");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.telegram.org/bottest-token/answerCallbackQuery");
    expect(JSON.parse(init.body as string)).toEqual({ callback_query_id: "cbq-1", text: "hello" });
  });

  it("does not hang indefinitely when the Telegram API never responds", async () => {
    // Regression: the original implementation used a bare `fetch()` with no
    // AbortController/timeout, so a hung connection to api.telegram.org
    // would leave the callback unanswered for as long as the network let it
    // — well past Telegram's own spinner-timeout window, with the failure
    // never surfacing anywhere.
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const promise = answerCallbackQuery("cbq-1").catch((err: unknown) => err);
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await promise;

    expect(result).toBeInstanceOf(Error);
    expect(fetchMock).toHaveBeenCalledTimes(1); // retries: 0 -- no point retrying past the ack window
  });
});

describe("sendMessage / editMessage", () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "12345";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  });

  it("sendMessage throws when the chat id is not configured", async () => {
    delete process.env.TELEGRAM_CHAT_ID;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendMessage("hi", [])).rejects.toThrow(/TELEGRAM_CHAT_ID/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sendMessage returns the new message id on success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const msgId = await sendMessage("hi", []);
    expect(msgId).toBe(42);
  });

  it("editMessage returns false (not throw) on a non-ok Telegram response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: false, description: "message not found" }), { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    const ok = await editMessage(1, "hi", []);
    expect(ok).toBe(false);
  });
});

describe("buildButtons", () => {
  it("shows only Next on the first page of multiple", () => {
    const rows = buildButtons(0, 3);
    expect(rows[0]).toEqual([{ text: "Next →", callback_data: "wr:1" }]);
  });

  it("shows Prev and Next on a middle page", () => {
    const rows = buildButtons(1, 3);
    expect(rows[0]).toEqual([
      { text: "← Prev", callback_data: "wr:0" },
      { text: "Next →", callback_data: "wr:2" },
    ]);
  });

  it("shows only Prev on the last page", () => {
    const rows = buildButtons(2, 3);
    expect(rows[0]).toEqual([{ text: "← Prev", callback_data: "wr:1" }]);
  });

  it("omits the nav row entirely for a single page", () => {
    const rows = buildButtons(0, 1);
    expect(rows.find((row) => row.some((btn) => "callback_data" in btn))).toBeUndefined();
  });
});
