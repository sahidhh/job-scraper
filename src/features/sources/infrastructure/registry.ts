import type { JobSourceScraper } from "@/features/sources/domain/JobSourceScraper";
import { adzunaScraper } from "./adzuna/AdzunaScraper";
import { ashbyScraper } from "./ashby/AshbyScraper";
import { greenhouseScraper } from "./greenhouse/GreenhouseScraper";
import { jsearchScraper } from "./jsearch/JSearchScraper";
import { leverScraper } from "./lever/LeverScraper";
import { myCareersFutureScraper } from "./mycareersfuture/MyCareersFutureScraper";
import { remoteokScraper } from "./remoteok/RemoteOkScraper";
import { wellfoundScraper } from "./wellfound/WellfoundScraper";

// The only place that knows about every cron-driven adapter (scrapers.md
// §2). scripts/scrape.ts loops this array, passing each scraper the
// companies matching its `source`. `careers_url` (CareersUrlScraper.ts) is
// deliberately NOT here -- it's a manual-trigger-only source invoked via
// scripts/scrape-careers-url.ts, not this cron-wide registry (merge-workspace
// Phase 5, docs/decisions.md AD-35).
export const sourceScrapers: readonly JobSourceScraper[] = [
  greenhouseScraper,
  leverScraper,
  ashbyScraper,
  wellfoundScraper,
  remoteokScraper,
  myCareersFutureScraper,
  jsearchScraper,
  adzunaScraper,
];
