import { describe, expect, it } from "vitest";
import { computeFingerprint } from "./computeFingerprint";

describe("computeFingerprint", () => {
  it("produces the same fingerprint for the same logical job across sources", () => {
    const a = computeFingerprint({ title: "Senior Backend Engineer", companyName: "Google LLC", locationTags: ["india"] });
    const b = computeFingerprint({ title: "Backend Engineer - Senior", companyName: "Google India", locationTags: ["india"] });
    expect(a).toBe(b);
  });

  it("is order-independent for location tags", () => {
    const a = computeFingerprint({ title: "Backend Engineer", companyName: "Acme", locationTags: ["india", "remote"] });
    const b = computeFingerprint({ title: "Backend Engineer", companyName: "Acme", locationTags: ["remote", "india"] });
    expect(a).toBe(b);
  });

  it("differs when the title is genuinely different", () => {
    const a = computeFingerprint({ title: "Backend Engineer", companyName: "Acme", locationTags: ["india"] });
    const b = computeFingerprint({ title: "Frontend Engineer", companyName: "Acme", locationTags: ["india"] });
    expect(a).not.toBe(b);
  });

  it("differs when the company is genuinely different", () => {
    const a = computeFingerprint({ title: "Backend Engineer", companyName: "Acme", locationTags: ["india"] });
    const b = computeFingerprint({ title: "Backend Engineer", companyName: "Other Co", locationTags: ["india"] });
    expect(a).not.toBe(b);
  });

  it("is a deterministic hex string", () => {
    const fp = computeFingerprint({ title: "Backend Engineer", companyName: "Acme", locationTags: ["india"] });
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });
});
