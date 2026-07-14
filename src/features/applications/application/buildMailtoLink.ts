// Ports jobhunt/apply.py's mailto_link(). Pure and deterministic: opens the
// user's own mail client with the reviewed draft prefilled -- no message is
// ever sent server-side (scope.md's "Auto-apply / auto-send" exclusion).
export function buildMailtoLink(recipientEmail: string | null, subject: string, body: string): string {
  const to = recipientEmail ? encodeURIComponent(recipientEmail) : "";
  const params = new URLSearchParams({ subject, body });
  return `mailto:${to}?${params.toString()}`;
}
