import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TelegramBotSender } from "./TelegramBotSender";

describe("TelegramBotSender", () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "12345";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  });

  it("posts the message to the Telegram Bot API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const sender = new TelegramBotSender();
    await sender.sendMessage("New match: Senior React Developer at Acme");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.telegram.org/bottest-token/sendMessage");

    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      chat_id: "12345",
      text: "New match: Senior React Developer at Acme",
      parse_mode: "HTML",
    });
  });

  it("sendMessageWithButtons includes reply_markup and disable_web_page_preview", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const buttons = [[{ text: "Apply #1", url: "https://example.com/job/1" }]];
    const sender = new TelegramBotSender();
    await sender.sendMessageWithButtons("📌 Job Matches", buttons);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.telegram.org/bottest-token/sendMessage");

    const body = JSON.parse(init.body as string);
    expect(body.text).toBe("📌 Job Matches");
    expect(body.parse_mode).toBe("HTML");
    expect(body.disable_web_page_preview).toBe(true);
    expect(body.reply_markup).toEqual({ inline_keyboard: buttons });
  });

  it("throws when Telegram responds with ok: false", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: false, description: "chat not found" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const sender = new TelegramBotSender();

    await expect(sender.sendMessage("hello")).rejects.toThrow("Telegram sendMessage failed: chat not found");
  });

  it("throws when the HTTP response is not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: false, description: "unauthorized" }), { status: 401 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const sender = new TelegramBotSender();

    await expect(sender.sendMessage("hello")).rejects.toThrow("Telegram sendMessage failed: unauthorized");
  });

  it("retries after the server-specified retry_after when rate-limited (429)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ok: false, description: "Too Many Requests: retry after 1", parameters: { retry_after: 1 } }),
          { status: 429 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();

    const sender = new TelegramBotSender();
    const sendPromise = sender.sendMessage("hello");
    await vi.advanceTimersByTimeAsync(1000);
    await sendPromise;

    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("throws if the retry after a 429 also fails", async () => {
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Response(
          JSON.stringify({ ok: false, description: "Too Many Requests: retry after 1", parameters: { retry_after: 1 } }),
          { status: 429 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();

    const sender = new TelegramBotSender();
    const sendPromise = sender.sendMessage("hello").catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(1000);
    const error = await sendPromise;

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Telegram sendMessage failed: Too Many Requests: retry after 1");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});
