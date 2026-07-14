import type { ApplicationRepository } from "@/features/applications/domain/ApplicationRepository";
import type { TelegramSender } from "@/features/notifications/domain/TelegramSender";
import { formatPendingDraftsReminder } from "./formatPendingDraftsReminder";

export interface NotifyPendingDraftsDeps {
  applicationRepository: ApplicationRepository;
  telegramSender: TelegramSender;
}

// Surfaces draft applications awaiting review by reusing the existing
// Telegram delivery infra (TelegramSender, the same port sendDigest.ts and
// sendNotification.ts already send through) rather than a new notification
// channel (Phase 4 checklist). Called once per notify.ts cron run, after the
// job-match digest. Stateless by design: it reflects current pending-draft
// count every run, so it naturally stops once every draft is sent or
// dismissed -- no separate "already reminded" tracking needed.
export async function notifyPendingDrafts(deps: NotifyPendingDraftsDeps): Promise<number> {
  const drafts = await deps.applicationRepository.listPendingDrafts();
  const message = formatPendingDraftsReminder(drafts);
  if (!message) return 0;

  await deps.telegramSender.sendMessage(message);
  return drafts.length;
}
