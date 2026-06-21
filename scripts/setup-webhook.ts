// One-time script: registers this app's /api/telegram/webhook endpoint with Telegram.
// Run after deploying: npm run setup:webhook
import { requireEnv } from "@/shared/infrastructure/env";

async function main(): Promise<void> {
  const token = requireEnv("TELEGRAM_BOT_TOKEN");
  const secret = requireEnv("TELEGRAM_CALLBACK_SECRET");
  const appUrl = requireEnv("APP_URL").replace(/\/$/, "");

  const webhookUrl = `${appUrl}/api/telegram/webhook`;
  const apiUrl = `https://api.telegram.org/bot${token}/setWebhook`;

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secret,
      allowed_updates: ["callback_query"],
    }),
  });

  const body = (await res.json()) as { ok: boolean; description?: string };
  if (!body.ok) {
    console.error("[setup-webhook] failed:", body.description);
    process.exit(1);
  }
  console.log(`[setup-webhook] registered: ${webhookUrl}`);
}

main().catch((err) => {
  console.error("[setup-webhook] fatal:", err);
  process.exit(1);
});
