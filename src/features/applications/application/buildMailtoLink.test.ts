import { describe, expect, it } from "vitest";
import { buildMailtoLink } from "./buildMailtoLink";

describe("buildMailtoLink", () => {
  it("builds a mailto link with an encoded recipient, subject, and body", () => {
    const link = buildMailtoLink("recruiter@acme.example", "Application: Engineer", "Hello,\n\nBest,\nMe");

    expect(link.startsWith("mailto:recruiter%40acme.example?")).toBe(true);
    const query = new URLSearchParams(link.split("?")[1]);
    expect(query.get("subject")).toBe("Application: Engineer");
    expect(query.get("body")).toBe("Hello,\n\nBest,\nMe");
  });

  it("omits the recipient when none is known, leaving it for the user to fill in", () => {
    const link = buildMailtoLink(null, "Subject", "Body");

    expect(link.startsWith("mailto:?")).toBe(true);
  });
});
