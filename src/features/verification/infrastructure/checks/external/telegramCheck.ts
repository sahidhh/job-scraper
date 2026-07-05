import { checkTelegramToken } from "@/shared/infrastructure/connectivityCheck";
import type { Check, CheckOutcome } from "@/features/verification/domain/types";

export function telegramConnectivityCheck(): Check {
  return {
    id: "external.telegram",
    name: "Telegram connectivity",
    category: "external",
    severity: "high",
    async run(): Promise<CheckOutcome> {
      const result = await checkTelegramToken();
      if (result.status === "warning") {
        return {
          status: "warning",
          summary: result.detail,
          suggestedFix: "See the \"Environment variables\" check; set TELEGRAM_BOT_TOKEN to enable this check.",
          affectedSubsystem: "Telegram notifications",
          severityOverride: "low",
        };
      }
      if (result.status === "fail") {
        return {
          status: "fail",
          summary: result.detail,
          probableCause: "TELEGRAM_BOT_TOKEN is invalid, or the bot was blocked/deleted by @BotFather.",
          suggestedFix: "Verify the token with @BotFather and confirm the bot still exists.",
          affectedSubsystem: "Telegram notifications",
        };
      }
      return { status: "pass", summary: result.detail };
    },
  };
}
