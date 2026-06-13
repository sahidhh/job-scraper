import type { Company } from "@/features/companies/domain/types";
import type { JobSource } from "@/shared/domain/enums";
import type { RawJob } from "./types";

// One implementation per source (greenhouse, lever, ashby, wellfound,
// remoteok), registered in features/sources/registry.ts. scrapers.md §2.
export interface JobSourceScraper {
  readonly source: JobSource;

  // true for greenhouse/lever/ashby (per-company board_token required).
  // false for remoteok/wellfound (single feed, `companies` is ignored/[]).
  readonly requiresCompanyConfig: boolean;

  // For requiresCompanyConfig === true, the adapter loops `companies`
  // internally (per-company error isolation, scrapers.md §4) and returns
  // one combined RawJob[]. For false, `companies` is [].
  fetchJobs(companies: Company[]): Promise<RawJob[]>;
}
