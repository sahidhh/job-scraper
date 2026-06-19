import { sendDigest } from "@/features/notifications/application/sendDigest";
import { sendNotification } from "@/features/notifications/application/sendNotification";
import type { NotifyMode } from "@/features/notifications/domain/types";
import { SupabaseNotificationPreferencesRepository } from "@/features/notifications/infrastructure/SupabaseNotificationPreferencesRepository";
import { SupabaseNotificationRepository } from "@/features/notifications/infrastructure/SupabaseNotificationRepository";
import { TelegramBotSender } from "@/features/notifications/infrastructure/TelegramBotSender";
import { SupabaseRoleRepository } from "@/features/roles/infrastructure/SupabaseRoleRepository";
import { optionalEnv } from "@/shared/infrastructure/env";
import { createSupabaseServiceClient } from "@/shared/infrastructure/supabaseClient";

// Cron entry point (AD-04): sends Telegram notifications for newly-scored
// matches above NOTIFY_THRESHOLD (scoring.md §4, AD-08).
// NOTIFY_MODE controls delivery style:
//   individual (default) — one message per match, preserves pre-digest behaviour
//   digest               — single grouped message per run
async function main(): Promise<void> {
  const client = createSupabaseServiceClient();
  const roleRepository = new SupabaseRoleRepository(client);
  const notificationRepository = new SupabaseNotificationRepository(client);
  const preferencesRepository = new SupabaseNotificationPreferencesRepository(client);
  const telegramSender = new TelegramBotSender();

  const roleSelection = await roleRepository.getActiveSelection();
  if (!roleSelection) {
    console.log("[notify] no active role selection, skipping");
    return;
  }

  const notifyThreshold = Number(optionalEnv("NOTIFY_THRESHOLD", "0.75"));
  const rawMode = optionalEnv("NOTIFY_MODE", "individual");
  const notifyMode: NotifyMode = rawMode === "digest" ? "digest" : "individual";
  const preferences = await preferencesRepository.getPreferences();

  if (preferences) {
    console.log("[notify] applying notification preferences filter");
  }

  const deps = { notificationRepository, telegramSender, notifyThreshold, preferences };

  if (notifyMode === "digest") {
    const count = await sendDigest(roleSelection.id, deps);
    console.log(`[notify] digest sent for ${count} job(s) (role selection ${roleSelection.id})`);
  } else {
    const sent = await sendNotification(roleSelection.id, deps);
    console.log(`[notify] sent ${sent} notification(s) for role selection ${roleSelection.id}`);
  }
}

main().catch((err) => {
  console.error("[notify] fatal error:", err);
  process.exit(1);
});
