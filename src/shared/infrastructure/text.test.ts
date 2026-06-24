import { describe, expect, it } from "vitest";
import { extractRecruiterEmail, normalizeWhitespace, stripHtml } from "./text";

describe("stripHtml", () => {
  it("converts block-level tags to line breaks", () => {
    expect(stripHtml("<p>First paragraph</p><p>Second paragraph</p>")).toBe(
      "First paragraph\nSecond paragraph",
    );
  });

  it("converts <br> tags to line breaks", () => {
    expect(stripHtml("Line one<br>Line two<br/>Line three")).toBe("Line one\nLine two\nLine three");
  });

  it("strips inline tags without adding line breaks", () => {
    expect(stripHtml("<strong>Bold</strong> and <em>italic</em> text")).toBe("Bold and italic text");
  });

  it("decodes common HTML entities", () => {
    expect(stripHtml("Tom &amp; Jerry &mdash; &quot;fun&quot;")).toBe('Tom & Jerry &mdash; "fun"');
  });

  it("collapses consecutive blank lines and trims the result", () => {
    expect(stripHtml("<p>One</p><p></p><p>Two</p>")).toBe("One\nTwo");
  });
});

describe("normalizeWhitespace", () => {
  it("trims and collapses repeated whitespace", () => {
    expect(normalizeWhitespace("  Senior   React\tDeveloper  \n")).toBe("Senior React Developer");
  });

  it("returns an empty string for whitespace-only input", () => {
    expect(normalizeWhitespace("   ")).toBe("");
  });
});

describe("extractRecruiterEmail", () => {
  it("returns null when no email present", () => {
    expect(extractRecruiterEmail("Apply via our website.")).toBeNull();
  });

  it("extracts a plain recruiter email", () => {
    expect(extractRecruiterEmail("Send CV to john.doe@techcorp.sg")).toBe("john.doe@techcorp.sg");
  });

  it("extracts email embedded in longer description", () => {
    const text = "We are looking for a senior engineer.\nContact us at hiring@startup.io for more info.";
    expect(extractRecruiterEmail(text)).toBe("hiring@startup.io");
  });

  it("skips noreply@ and returns null when no other email", () => {
    expect(extractRecruiterEmail("Sent from noreply@ats.com")).toBeNull();
  });

  it("skips support@ and returns null when no other email", () => {
    expect(extractRecruiterEmail("Questions? support@company.com")).toBeNull();
  });

  it("skips excluded prefix and returns next valid email", () => {
    const text = "noreply@ats.com is automated. Reach recruiter at jane@company.com";
    expect(extractRecruiterEmail(text)).toBe("jane@company.com");
  });

  it("skips all excluded prefixes: info, privacy, unsubscribe, careers, hello, contact", () => {
    const excluded = [
      "info@co.com",
      "privacy@co.com",
      "unsubscribe@co.com",
      "careers@co.com",
      "hello@co.com",
      "contact@co.com",
      "do-not-reply@co.com",
      "donotreply@co.com",
      "no-reply@co.com",
    ];
    for (const email of excluded) {
      expect(extractRecruiterEmail(email)).toBeNull();
    }
  });

  it("returns null for empty string", () => {
    expect(extractRecruiterEmail("")).toBeNull();
  });
});
