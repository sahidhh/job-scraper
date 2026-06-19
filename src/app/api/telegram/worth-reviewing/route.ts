import { NextRequest, NextResponse } from "next/server";

// Stateless callback endpoint for the "Worth Reviewing" inline keyboard button.
//
// Flow:
//   1. notify.ts sends digest message with a Worth Reviewing button whose URL
//      is signed as: {APP_URL}/api/telegram/worth-reviewing?msg={base64url}&token={secret}
//      The msg param contains the pre-formatted Telegram HTML (worth-reviewing jobs).
//   2. User taps the button → Telegram opens this URL in the in-app browser.
//   3. This route validates the token, decodes msg, posts to Telegram Bot API,
//      and returns a small success page.
//
// No Supabase access needed — the message content is embedded and signed in the URL.
// TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_CALLBACK_SECRET must be set in Vercel.

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const msg = searchParams.get("msg");
  const token = searchParams.get("token");

  const secret = process.env.TELEGRAM_CALLBACK_SECRET;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!msg || !token || !secret || !botToken || !chatId) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  if (token !== secret) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let text: string;
  try {
    text = Buffer.from(msg, "base64url").toString("utf8");
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const telegramRes = await fetch(telegramUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!telegramRes.ok) {
    return new NextResponse("Failed to send Telegram message", { status: 502 });
  }

  return new NextResponse(
    "<!doctype html><html><head><meta charset=utf-8><title>Sent</title></head>" +
      "<body style='font-family:sans-serif;padding:2rem'>" +
      "<h2>✓ Worth Reviewing jobs sent to Telegram.</h2>" +
      "</body></html>",
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
