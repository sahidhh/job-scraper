import { describe, expect, it } from "vitest";
import { buildMailtoLink } from "./buildMailtoLink";

describe("buildMailtoLink", () => {
  it("percent-encodes the recipient, subject, and body per RFC 6068 (space -> %20, newline -> %0A)", () => {
    const link = buildMailtoLink("recruiter@acme.example", "Application: Engineer", "Dear Hiring Team,\n\nBest,\nMe");

    expect(link.startsWith("mailto:recruiter%40acme.example?")).toBe(true);
    // Spaces must be %20, never "+"; newlines must be %0A.
    expect(link).toContain("subject=Application%3A%20Engineer");
    expect(link).toContain("body=Dear%20Hiring%20Team%2C%0A%0ABest%2C%0AMe");
    expect(link).not.toContain("+");

    // Round-trips back to the original text via percent-decoding.
    const body = link.split("&body=")[1] ?? "";
    expect(decodeURIComponent(body)).toBe("Dear Hiring Team,\n\nBest,\nMe");
  });

  it("omits the recipient when none is known, leaving it for the user to fill in (never mailto:undefined)", () => {
    const link = buildMailtoLink(null, "Subject", "Body");

    expect(link.startsWith("mailto:?")).toBe(true);
    expect(link).not.toContain("undefined");
  });
});
