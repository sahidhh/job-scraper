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
      if (result.status === "warn") return { status: "warning", summary: result.detail };
      if (result.status === "fail") {
        return {
          status: "fail",
          summary: result.detail,
          recommendation: "Verify TELEGRAM_BOT_TOKEN is valid and the bot has not been blocked/deleted.",
        };
      }
      return { status: "pass", summary: result.detail };
    },
  };
}
