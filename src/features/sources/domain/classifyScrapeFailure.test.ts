import { describe, expect, it } from "vitest";
import { classifyScrapeFailure } from "./classifyScrapeFailure";

describe("classifyScrapeFailure", () => {
  it("classifies an embedded 401 status as authentication", () => {
    expect(classifyScrapeFailure(new Error('Greenhouse board "x" returned 401'))).toBe("authentication");
  });

  it("classifies an embedded 403 status as blocked", () => {
    expect(classifyScrapeFailure(new Error('Lever board "x" returned 403'))).toBe("blocked");
  });

  it("classifies an embedded 404 status as not_found", () => {
    expect(classifyScrapeFailure(new Error('Ashby board "x" returned 404'))).toBe("not_found");
  });

  it("classifies an embedded 429 status as rate_limited", () => {
    expect(classifyScrapeFailure(new Error('Greenhouse board "x" returned 429'))).toBe("rate_limited");
  });

  it("classifies a timeout message", () => {
    expect(classifyScrapeFailure(new Error("fetch failed: request timed out"))).toBe("timeout");
    expect(classifyScrapeFailure(new Error("AbortError: The operation was aborted"))).toBe("timeout");
  });

  it("classifies a captcha message before other keyword rules", () => {
    expect(classifyScrapeFailure(new Error("Blocked by captcha challenge"))).toBe("captcha");
  });

  it("classifies a JSON/shape error as parsing", () => {
    expect(classifyScrapeFailure(new TypeError("body.jobs.map is not a function"))).toBe("parsing");
    expect(classifyScrapeFailure(new SyntaxError("Unexpected token < in JSON at position 0"))).toBe("parsing");
  });

  it("falls back to unknown for an unrecognized error", () => {
    expect(classifyScrapeFailure(new Error("something weird happened"))).toBe("unknown");
  });

  it("handles a non-Error thrown value without throwing", () => {
    expect(classifyScrapeFailure("plain string timeout")).toBe("timeout");
    expect(classifyScrapeFailure(undefined)).toBe("unknown");
  });
});
