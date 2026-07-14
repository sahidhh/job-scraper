import { describe, expect, it } from "vitest";
import { chunkText, normalizeWhitespace, stripHtml, truncateText } from "./text";

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

  it("strips script and style block content, not just the tags", () => {
    const html = "<style>.a{color:red}</style><p>Real content</p><script>alert('x')</script>";
    expect(stripHtml(html)).toBe("Real content");
  });

  it("strips noscript block content", () => {
    expect(stripHtml("<noscript>Enable JS</noscript><p>Visible</p>")).toBe("Visible");
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

describe("truncateText", () => {
  it("returns text unchanged when at or under the limit", () => {
    expect(truncateText("hello", 5)).toBe("hello");
    expect(truncateText("hello", 10)).toBe("hello");
  });

  it("slices and appends a truncation marker when over the limit", () => {
    expect(truncateText("hello world", 5)).toBe("hello... [truncated]");
  });

  it("handles empty string", () => {
    expect(truncateText("", 10)).toBe("");
  });
});

describe("chunkText", () => {
  it("returns a single chunk when at or under the limit", () => {
    expect(chunkText("hello", 10)).toEqual(["hello"]);
  });

  it("splits into multiple chunks without dropping any content", () => {
    const text = "a".repeat(25);
    const chunks = chunkText(text, 10);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe(text);
  });

  it("prefers to break at the last newline before the cap", () => {
    const text = `${"a".repeat(8)}\n${"b".repeat(8)}`;
    const chunks = chunkText(text, 10);
    expect(chunks).toEqual(["aaaaaaaa", "bbbbbbbb"]);
  });

  it("still makes forward progress when no newline exists before the cap", () => {
    const text = "a".repeat(30);
    const chunks = chunkText(text, 10);
    expect(chunks).toEqual(["a".repeat(10), "a".repeat(10), "a".repeat(10)]);
  });

  it("handles empty string", () => {
    expect(chunkText("", 10)).toEqual([""]);
  });
});

