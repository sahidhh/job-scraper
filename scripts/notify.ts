import { sendDigest } from "@/features/notifications/application/sendDigest";
import { formatWorthReviewingMessage } from "@/features/notifications/application/formatDigestMvp";
import { sendDigestMvp } from "@/features/notifications/application/sendDigestMvp";
import { sendNotification } from "@/features/notifications/application/sendNotification";
import type { JobMatch, NotifyMode } from "@/features/notifications/domain/types";
import { SupabaseNotificationPreferencesRepository } from "@/features/notifications/infrastructure/SupabaseNotificationPreferencesRepository";
import { SupabaseNotificationRepository } from "@/features/notifications/infrastructure/SupabaseNotificationRepository";
import { TelegramBotSender } from "@/features/notifications/infrastructure/TelegramBotSender";
import { SupabaseRoleRepository } from "@/features/roles/infrastructure/SupabaseRoleRepository";
import { optionalEnv, requireEnv } from "@/shared/infrastructure/env";
import { createSupabaseServiceClient } from "@/shared/infrastructure/supabaseClient";

// Cron entry point (AD-04): sends Telegram notifications for newly-scored
// matches above NOTIFY_THRESHOLD (scoring.md §4, AD-08).
// NOTIFY_MODE controls delivery style:
//   individual (default) — one message per match, preserves pre-digest behaviour
//   digest               — MVP digest with inline buttons (sendDigestMvp)
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
    // Build optional URLs for inline keyboard buttons.
    const appUrl = optionalEnv("APP_URL", "").replace(/\/$/, "");
    const callbackSecret = optionalEnv("TELEGRAM_CALLBACK_SECRET", "");
    const dashboardUrl = appUrl ? `${appUrl}/dashboard?minScore=0.80` : undefined;

    const buildWorthReviewingUrl = appUrl && callbackSecret
      ? (worthReviewing: JobMatch[]): string | undefined => {
          if (worthReviewing.length === 0) return undefined;
          const text = formatWorthReviewingMessage(worthReviewing);
          const msg = Buffer.from(text, "utf8").toString("base64url");
          return `${appUrl}/api/telegram/worth-reviewing?msg=${msg}&token=${encodeURIComponent(callbackSecret)}`;
        }
      : undefined;

    const result = await sendDigestMvp(roleSelection.id, {
      ...deps,
      dashboardUrl,
      buildWorthReviewingUrl,
    });
    console.log(
      `[notify] digest sent — ${result.strongCount} strong match(es), ` +
        `${result.worthReviewingCount} worth-reviewing (role selection ${roleSelection.id})`,
    );
  } else if (rawMode === "digest_legacy") {
    // Legacy digest format (pre-MVP): grouped text, no inline buttons.
    const count = await sendDigest(roleSelection.id, deps);
    console.log(`[notify] legacy digest sent for ${count} job(s) (role selection ${roleSelection.id})`);
  } else {
    const sent = await sendNotification(roleSelection.id, deps);
    console.log(`[notify] sent ${sent} notification(s) for role selection ${roleSelection.id}`);
  }
}

main().catch((err) => {
  console.error("[notify] fatal error:", err);
  process.exit(1);
});
