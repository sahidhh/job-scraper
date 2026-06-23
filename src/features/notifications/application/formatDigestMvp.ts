import type { JobMatch } from "@/features/notifications/domain/types";
import { DIGEST_DISPLAY_LIMIT } from "@/features/notifications/domain/types";
import { capitalizeFirst, escapeHtml } from "@/shared/infrastructure/text";

// Formats the primary digest message shown with inline Apply buttons.
// Displays the counts for both bands, then lists top-N strong matches.
export function formatDigestMvp(
  strongMatches: JobMatch[],
  worthReviewingCount: number,
  displayLimit: number = DIGEST_DISPLAY_LIMIT,
): string {
  const top = strongMatches.slice(0, displayLimit);
  const lines: string[] = [];

  lines.push("📌 <b>Job Matches</b>");
  lines.push("");
  lines.push(`⭐ Strong Match: ${strongMatches.length}`);
  lines.push(`✓ Worth Reviewing: ${worthReviewingCount}`);

  if (top.length > 0) {
    lines.push("");
    lines.push(`Showing Top ${top.length} Strong Match${top.length === 1 ? "" : "es"}`);

    top.forEach((match, i) => {
      const location = match.locationTags.map(capitalizeFirst).join(", ");
      const expStr = match.minYears !== null ? `${match.minYears}+ yrs` : null;
      const meta = [escapeHtml(match.companyName), location, expStr].filter(Boolean).join(" · ");
      lines.push("");
      lines.push(`${i + 1}. <b>${escapeHtml(match.title)}</b>`);
      lines.push(`   ${meta}`);
    });
  } else {
    lines.push("");
    lines.push("No strong matches in this run.");
  }

  return lines.join("\n");
}

// Formats the follow-up message sent when the Worth Reviewing button is tapped.
// All untrusted fields are HTML-escaped.
export function formatWorthReviewingMessage(worthReviewing: JobMatch[]): string {
  if (worthReviewing.length === 0) return "✓ No worth-reviewing jobs at this time.";

  const lines: string[] = ["✓ <b>Worth Reviewing Jobs</b>", ""];

  worthReviewing.forEach((match, i) => {
    const percent = Math.round(match.aiScore * 100);
    const location = match.locationTags.map(capitalizeFirst).join(", ");
    const expStr = match.minYears !== null ? `${match.minYears}+ yrs` : null;
    const meta = [escapeHtml(match.companyName), location, expStr, `${percent}%`]
      .filter(Boolean)
      .join(" · ");
    lines.push(`${i + 1}. <b>${escapeHtml(match.title)}</b>`);
    lines.push(`   ${meta}`);
    lines.push("");
  });

  return lines.join("\n").trimEnd();
}

