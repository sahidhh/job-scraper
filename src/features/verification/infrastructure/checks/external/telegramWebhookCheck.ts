import type { Check, CheckOutcome } from "@/features/verification/domain/types";

const WEBHOOK_PATH = "/api/telegram/webhook";

/**
 * Coverage gap closed in the operational-excellence pass (Phase 4): the
 * Telegram webhook (`src/app/api/telegram/webhook/route.ts`, registered by
 * `npm run setup:webhook`) drives digest-mode "Worth Reviewing" pagination
 * but had zero verification coverage. Only meaningful when
 * NOTIFY_MODE=digest -- individual/digest_legacy modes never use the
 * webhook, so this is a clean pass (not a skip) for them rather than a
 * false-positive warning.
 */
export function telegramWebhookCheck(): Check {
  return {
    id: "external.telegram-webhook",
    name: "Telegram webhook registration",
    category: "external",
    severity: "medium",
    async run(): Promise<CheckOutcome> {
      const notifyMode = process.env.NOTIFY_MODE ?? "individual";
      if (notifyMode !== "digest") {
        return { status: "pass", summary: `Not applicable — NOTIFY_MODE=${notifyMode} doesn't use webhook pagination` };
      }

      const token = process.env.TELEGRAM_BOT_TOKEN;
      const appUrl = process.env.APP_URL?.replace(/\/$/, "");
      const callbackSecret = process.env.TELEGRAM_CALLBACK_SECRET;

      if (!token) {
        return {
          status: "warning",
          summary: "Skipped — TELEGRAM_BOT_TOKEN not set",
          suggestedFix: "See the \"Environment variables\" check for the underlying cause.",
          affectedSubsystem: "Telegram digest pagination",
          severityOverride: "low",
        };
      }

      if (!appUrl || !callbackSecret) {
        const missing = [!appUrl && "APP_URL", !callbackSecret && "TELEGRAM_CALLBACK_SECRET"].filter(Boolean).join(" and ");
        return {
          status: "warning",
          summary: `NOTIFY_MODE=digest but ${missing} not set — "Worth Reviewing" pagination buttons will not work`,
          probableCause: "Digest mode was enabled without finishing its webhook setup.",
          suggestedFix: `Set ${missing}, then run \`npm run setup:webhook\`.`,
          affectedSubsystem: "Telegram digest pagination",
          docReference: "design/api-reference.md §3.3",
        };
      }

      try {
        const response = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, { signal: AbortSignal.timeout(8000) });
        const body = (await response.json()) as { ok: boolean; result?: { url?: string } };
        if (!response.ok || !body.ok) {
          return {
            status: "fail",
            summary: "Could not fetch webhook info from Telegram",
            affectedSubsystem: "Telegram digest pagination",
          };
        }

        const expectedUrl = `${appUrl}${WEBHOOK_PATH}`;
        const registeredUrl = body.result?.url ?? "";
        if (registeredUrl !== expectedUrl) {
          return {
            status: "warning",
            summary: registeredUrl
              ? `Registered webhook (${registeredUrl}) doesn't match the expected URL (${expectedUrl})`
              : "No webhook is registered with Telegram",
            probableCause: "`npm run setup:webhook` was never run, or APP_URL changed since it was last run.",
            suggestedFix: "Run `npm run setup:webhook` to (re-)register the webhook URL.",
            affectedSubsystem: "Telegram digest pagination",
            docReference: "design/api-reference.md §3.3",
          };
        }
        return { status: "pass", summary: `Webhook correctly registered at ${expectedUrl}` };
      } catch (err) {
        return {
          status: "fail",
          summary: `Could not verify webhook registration: ${err instanceof Error ? err.message : String(err)}`,
          probableCause: "Network access to api.telegram.org is blocked, or the request timed out after 8s.",
          suggestedFix: "Check network access and https://status.telegram.org.",
          affectedSubsystem: "Telegram digest pagination",
        };
      }
    },
  };
}
