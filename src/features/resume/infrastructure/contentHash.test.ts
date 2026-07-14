import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { computeContentHash } from "./contentHash";

describe("computeContentHash", () => {
  it("returns the sha256 hex digest of the buffer's bytes", () => {
    const buffer = Buffer.from("hello resume");
    const expected = createHash("sha256").update(buffer).digest("hex");

    expect(computeContentHash(buffer)).toBe(expected);
  });

  it("is deterministic for identical bytes", () => {
    const a = Buffer.from("same content");
    const b = Buffer.from("same content");

    expect(computeContentHash(a)).toBe(computeContentHash(b));
  });

  it("differs for different bytes", () => {
    const a = Buffer.from("resume version A");
    const b = Buffer.from("resume version B");

    expect(computeContentHash(a)).not.toBe(computeContentHash(b));
  });
});
