import type { PendingApplicationDraft } from "@/features/applications/domain/types";
import { escapeHtml } from "@/shared/infrastructure/text";

// How many job lines to list by name before collapsing the rest into a
// "...and N more" tail -- mirrors DIGEST_DISPLAY_LIMIT's role (bound message
// size, not drop data).
const REMINDER_DISPLAY_LIMIT = 10;

// Formats the same HTML the job digest uses (formatDigestMessage.ts) so this
// reminder reads as part of the same notification family, not a bolted-on
// second style. Returns null when there's nothing to remind about, so the
// caller (notifyPendingDrafts.ts) can skip sending entirely.
export function formatPendingDraftsReminder(drafts: PendingApplicationDraft[]): string | null {
  if (drafts.length === 0) return null;

  const lines: string[] = [
    `📝 <b>${drafts.length} draft application${drafts.length === 1 ? "" : "s"} awaiting review</b>`,
    "",
  ];

  for (const draft of drafts.slice(0, REMINDER_DISPLAY_LIMIT)) {
    lines.push(`• ${escapeHtml(draft.jobTitle)} @ ${escapeHtml(draft.companyName)}`);
  }
  if (drafts.length > REMINDER_DISPLAY_LIMIT) {
    lines.push("", `...and ${drafts.length - REMINDER_DISPLAY_LIMIT} more`);
  }

  lines.push("", "Review and send from the dashboard.");
  return lines.join("\n");
}
