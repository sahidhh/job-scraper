export function validateApplicationContent(subject: string, body: string): void {
  if (body.trim().length === 0) {
    throw new Error("Application body cannot be empty.");
  }
  if (subject.length > 998) {
    // RFC 5322 soft line-length limit for a header field -- generous enough
    // that no real subject line hits it, just a sanity backstop.
    throw new Error("Subject is too long.");
  }
}
