import { describe, expect, it } from "vitest";
import { classifyScrapeFailure } from "@/features/sources/domain/classifyScrapeFailure";
import { SourceBlockedError } from "@/features/sources/domain/errors";
import { naukriGulfScraper } from "./NaukriGulfScraper";

describe("NaukriGulfScraper", () => {
  it("is registered as naukrigulf with requiresCompanyConfig: false and throws SourceBlockedError while stubbed", async () => {
    expect(naukriGulfScraper.source).toBe("naukrigulf");
    expect(naukriGulfScraper.requiresCompanyConfig).toBe(false);

    const err = await naukriGulfScraper.fetchJobs([], []).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SourceBlockedError);
    expect(classifyScrapeFailure(err)).toBe("blocked");
  });
});
