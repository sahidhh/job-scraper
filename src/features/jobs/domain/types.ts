import type { JobSource, LocationTag } from "@/shared/domain/enums";

// Mirrors the `jobs` table (database.md §2).
export interface Job {
  id: string;
  source: JobSource;
  sourceJobId: string;
  companyId: string | null;
  companyName: string;
  title: string;
  locationRaw: string;
  locationTags: LocationTag[];
  description: string;
  url: string;
  postedAt: string | null;
  firstSeenAt: string;
  updatedAt: string;
}

// Input to JobRepository.upsertMany() -- a TaggedRawJob ready to persist.
// No `id`/`firstSeenAt`/`updatedAt`: the repository sets these on insert
// and preserves firstSeenAt on conflict (repositories.md §2).
export interface NormalizedJob {
  source: JobSource;
  sourceJobId: string;
  companyId: string | null;
  companyName: string;
  title: string;
  locationRaw: string;
  locationTags: LocationTag[];
  description: string;
  url: string;
  postedAt: string | null;
}

export interface UpsertResult {
  inserted: number;
  updated: number;
}

// Dashboard query filters (repositories.md §2).
export interface JobFilters {
  locationTags?: LocationTag[];
  sources?: JobSource[];
  minAiScore?: number;
}

// Job joined with its score for the active role_selection.
export interface JobWithScore extends Job {
  keywordScore: number | null;
  aiScore: number | null;
  aiReasoning: string | null;
}

// Result of findForDashboard: a limited page of jobs plus whether more rows
// exist beyond `limit` (repositories.md §2).
export interface JobsPage {
  jobs: JobWithScore[];
  hasMore: boolean;
}
