// Ports jobhunt/apply.py's mailto_link(). Pure and deterministic: opens the
// user's own mail client with the reviewed draft prefilled -- no message is
// ever sent server-side (scope.md's "Auto-apply / auto-send" exclusion).
export function buildMailtoLink(recipientEmail: string | null, subject: string, body: string): string {
  // mailto follows RFC 6068, not form-encoding: spaces must be %20 and newlines
  // %0A. URLSearchParams uses application/x-www-form-urlencoded (space -> "+",
  // newlines mangled), which corrupts the draft ("Dear+Hiring+Team", no line
  // breaks). Percent-encode each field with encodeURIComponent instead.
  const to = recipientEmail ? encodeURIComponent(recipientEmail) : "";
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
