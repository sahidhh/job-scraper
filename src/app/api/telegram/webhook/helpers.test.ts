import { describe, expect, it } from "vitest";
import { buildButtons, formatPage, isValidSecret } from "./helpers";

describe("isValidSecret", () => {
  it("accepts a header that matches the configured secret", () => {
    expect(isValidSecret("s3cret", "s3cret")).toBe(true);
  });

  it("rejects a header that does not match the configured secret", () => {
    expect(isValidSecret("s3cret", "wrong")).toBe(false);
  });

  it("rejects when the secret is not configured", () => {
    expect(isValidSecret(undefined, "s3cret")).toBe(false);
  });

  it("rejects when the header is missing", () => {
    expect(isValidSecret("s3cret", null)).toBe(false);
  });

  it("rejects a header of a different length without throwing", () => {
    expect(isValidSecret("s3cret", "s3cretlonger")).toBe(false);
  });
});

describe("formatPage", () => {
  it("HTML-escapes title and company name", () => {
    const text = formatPage(
      [{ title: "<b>Hacker</b>", companyName: "Acme & Co", url: "https://example.com/job/1", aiScore: 0.9 }],
      0,
      1,
      1,
    );
    expect(text).toContain("&lt;b&gt;Hacker&lt;/b&gt;");
    expect(text).toContain("Acme &amp; Co");
  });

  it("escapes a quote in the job url so it cannot break out of the href attribute", () => {
    // Regression test: a scraped job URL containing a `"` used to be
    // interpolated raw into `<a href="...">`, letting it terminate the
    // attribute early and inject arbitrary Telegram-supported HTML tags.
    const maliciousUrl = 'https://example.com/job/1"><b>injected</b><a href="https://example.com';
    const text = formatPage([{ title: "Engineer", companyName: "Acme", url: maliciousUrl, aiScore: 0.5 }], 0, 1, 1);

    expect(text).not.toContain(`href="${maliciousUrl}"`);
    expect(text).toContain('href="https://example.com/job/1&quot;&gt;&lt;b&gt;injected&lt;/b&gt;&lt;a href=&quot;https://example.com"');
  });
});

describe("buildButtons", () => {
  it("shows only Next on the first page of multiple", () => {
    const rows = buildButtons(0, 3);
    expect(rows[0]).toEqual([{ text: "Next →", callback_data: "wr:1" }]);
  });

  it("shows Prev and Next on a middle page", () => {
    const rows = buildButtons(1, 3);
    expect(rows[0]).toEqual([
      { text: "← Prev", callback_data: "wr:0" },
      { text: "Next →", callback_data: "wr:2" },
    ]);
  });

  it("shows only Prev on the last page", () => {
    const rows = buildButtons(2, 3);
    expect(rows[0]).toEqual([{ text: "← Prev", callback_data: "wr:1" }]);
  });

  it("omits the nav row entirely for a single page", () => {
    const rows = buildButtons(0, 1);
    expect(rows.find((row) => row.some((btn) => "callback_data" in btn))).toBeUndefined();
  });
});
