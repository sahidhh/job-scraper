import { SourceBlockedError } from "@/features/sources/domain/errors";
import type { JobSourceScraper } from "@/features/sources/domain/JobSourceScraper";
import type { RawJob } from "@/features/sources/domain/types";

// TODO: Implement live NaukriGulf scraping once a live response fixture is captured.
// Intentionally throws SourceBlockedError so unattended runs never self-block on NaukriGulf.
export const naukriGulfScraper: JobSourceScraper = {
  source: "naukrigulf",
  requiresCompanyConfig: false,

  async fetchJobs(): Promise<RawJob[]> {
    throw new SourceBlockedError(
      "naukrigulf",
      undefined,
      "NaukriGulf scraper is stubbed until a live fixture is captured (TODO)",
    );
  },
};
