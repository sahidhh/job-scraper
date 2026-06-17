import type { JobSourceScraper } from "@/features/sources/domain/JobSourceScraper";
import { ashbyScraper } from "./ashby/AshbyScraper";
import { greenhouseScraper } from "./greenhouse/GreenhouseScraper";
import { leverScraper } from "./lever/LeverScraper";
import { myCareersFutureScraper } from "./mycareersfuture/MyCareersFutureScraper";
import { remoteokScraper } from "./remoteok/RemoteOkScraper";
import { wellfoundScraper } from "./wellfound/WellfoundScraper";

// The only place that knows about all six adapters (scrapers.md §2).
// scripts/scrape.ts loops this array, passing each scraper the companies
// matching its `source`.
export const sourceScrapers: readonly JobSourceScraper[] = [
  greenhouseScraper,
  leverScraper,
  ashbyScraper,
  wellfoundScraper,
  remoteokScraper,
  myCareersFutureScraper,
];
