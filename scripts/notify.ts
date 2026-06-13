import { sendNotification } from "@/features/notifications/application/sendNotification";
import { SupabaseNotificationRepository } from "@/features/notifications/infrastructure/SupabaseNotificationRepository";
import { TelegramBotSender } from "@/features/notifications/infrastructure/TelegramBotSender";
import { SupabaseRoleRepository } from "@/features/roles/infrastructure/SupabaseRoleRepository";
import { optionalEnv } from "@/shared/infrastructure/env";
import { createSupabaseServiceClient } from "@/shared/infrastructure/supabaseClient";

// Cron entry point (AD-04): sends Telegram notifications for newly-scored
// matches above NOTIFY_THRESHOLD (scoring.md §4, AD-08).
async function main(): Promise<void> {
  const client = createSupabaseServiceClient();
  const roleRepository = new SupabaseRoleRepository(client);
  const notificationRepository = new SupabaseNotificationRepository(client);
  const telegramSender = new TelegramBotSender();

  const roleSelection = await roleRepository.getActiveSelection();
  if (!roleSelection) {
    console.log("[notify] no active role selection, skipping");
    return;
  }

  const notifyThreshold = Number(optionalEnv("NOTIFY_THRESHOLD", "0.75"));

  const sent = await sendNotification(roleSelection.id, {
    notificationRepository,
    telegramSender,
    notifyThreshold,
  });

  console.log(`[notify] sent ${sent} notification(s) for role selection ${roleSelection.id}`);
}

main().catch((err) => {
  console.error("[notify] fatal error:", err);
  process.exit(1);
});
