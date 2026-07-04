import { describe, expect, it } from "vitest";
import { normalizeCompanyName } from "./normalizeCompanyName";

describe("normalizeCompanyName", () => {
  it("collapses legal-entity and regional-office variants to the same canonical name", () => {
    expect(normalizeCompanyName("Google")).toBe("Google");
    expect(normalizeCompanyName("Google LLC")).toBe("Google");
    expect(normalizeCompanyName("Google Inc.")).toBe("Google");
    expect(normalizeCompanyName("Google India")).toBe("Google");
  });

  it("strips multiple trailing suffixes", () => {
    expect(normalizeCompanyName("Acme Corp India")).toBe("Acme");
  });

  it("never strips the last remaining token", () => {
    expect(normalizeCompanyName("Inc")).toBe("Inc");
    expect(normalizeCompanyName("India")).toBe("India");
  });

  it("preserves multi-word company names", () => {
    expect(normalizeCompanyName("Big Lots Inc.")).toBe("Big Lots");
  });
});
