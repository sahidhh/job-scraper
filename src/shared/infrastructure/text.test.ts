import { describe, expect, it } from "vitest";
import { normalizeWhitespace, stripHtml } from "./text";

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

