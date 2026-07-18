import { describe, expect, it } from "vitest";
import { toIsoFromUnixSeconds, toIsoOrNull, toRemoteLocationRaw } from "./normalize";

describe("toIsoOrNull", () => {
  it("returns null for empty/nullish values", () => {
    expect(toIsoOrNull(null)).toBeNull();
    expect(toIsoOrNull(undefined)).toBeNull();
    expect(toIsoOrNull("")).toBeNull();
  });

  it("returns null for unparseable dates", () => {
    expect(toIsoOrNull("not a date")).toBeNull();
  });

  it("normalizes a parseable date to ISO 8601", () => {
    expect(toIsoOrNull("2026-07-16T13:28:02")).toBe(new Date("2026-07-16T13:28:02").toISOString());
  });
});

describe("toIsoFromUnixSeconds", () => {
  it("returns null for null/undefined", () => {
    expect(toIsoFromUnixSeconds(null)).toBeNull();
    expect(toIsoFromUnixSeconds(undefined)).toBeNull();
  });

  it("treats the value as seconds (not milliseconds)", () => {
    // 1784387614s -> a 2026 date, not 1970.
    const iso = toIsoFromUnixSeconds(1784387614);
    expect(iso).toBe(new Date(1784387614 * 1000).toISOString());
    expect(iso?.startsWith("2026")).toBe(true);
  });
});

describe("toRemoteLocationRaw", () => {
  it("returns 'remote' for empty/whitespace/nullish input", () => {
    expect(toRemoteLocationRaw("")).toBe("remote");
    expect(toRemoteLocationRaw("   ")).toBe("remote");
    expect(toRemoteLocationRaw(null)).toBe("remote");
    expect(toRemoteLocationRaw(undefined)).toBe("remote");
  });

  it("prefixes a specific location so the geo-lock detector can see it", () => {
    expect(toRemoteLocationRaw("USA")).toBe("Remote - USA");
    expect(toRemoteLocationRaw("United States, Canada")).toBe("Remote - United States, Canada");
    expect(toRemoteLocationRaw("India")).toBe("Remote - India");
  });

  it("passes through values that already lead with 'Remote'", () => {
    expect(toRemoteLocationRaw("Remote - Germany")).toBe("Remote - Germany");
    expect(toRemoteLocationRaw("Remote")).toBe("Remote");
  });

  it("collapses surrounding/inner whitespace before prefixing", () => {
    expect(toRemoteLocationRaw("  New   Zealand  ")).toBe("Remote - New Zealand");
  });
});
