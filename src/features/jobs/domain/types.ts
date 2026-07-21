import type { IneligibleReason } from "@/features/scoring/domain/classifyEligibility";
import type { JobSource, LocationTag } from "@/shared/domain/enums";
import type { EmailCategory, EmailConfidence } from "./extractContactEmail";
import type { EmploymentType, SeniorityLevel, WorkArrangement } from "./extractJobAttributes";
import type { SalaryConfidence, SalaryPeriod } from "./extractSalary";

// Mirrors the `jobs` table (database.md §2).
export interface Job {
  id: string;
  source: JobSource;
  sourceJobId: string;
  companyId: string | null;
  companyName: string;
  // Deterministic normalization of companyName (legal suffix/regional
  // qualifier stripped, e.g. "Google LLC" -> "Google"). Computed at write
  // time by the repository -- see companies/domain/normalizeCompanyName.ts.
  canonicalCompanyName: string;
  title: string;
  locationRaw: string;
  locationTags: LocationTag[];
  description: string;
  url: string;
  postedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  updatedAt: string;
  isActive: boolean;
  inactiveReason: string | null;
  minYears: number | null;
  // Cross-source duplicate key (Phase 1 Task 1): sha256 of normalized
  // title + canonical company + sorted location tags. Computed at write
  // time -- see computeFingerprint.ts.
  fingerprint: string;
  // Best-effort contact email parsed from title+description at ingest
  // (Phase 2 Task 9) -- see extractContactEmail.ts. Null when none found.
  contactEmail: string | null;
  contactEmailCategory: EmailCategory | null;
  contactEmailConfidence: EmailConfidence | null;
  // Best-effort salary parsed from title+description at ingest (Phase 2
  // Task 10) -- see extractSalary.ts. All null when no salary text found;
  // salaryMin/Max/Currency/Period null but salaryConfidence 'low' for
  // explicit "Negotiable"/"Competitive" text with no figure.
  salaryCurrency: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryPeriod: SalaryPeriod | null;
  salaryConfidence: SalaryConfidence | null;
  // Deterministic job attributes parsed from title+description at ingest
  // (Phase 2 personal-intelligence polish) -- see extractJobAttributes.ts.
  employmentType: EmploymentType | null;
  seniority: SeniorityLevel | null;
  workArrangement: WorkArrangement | null;
  visaSponsorship: boolean | null;
  relocationAssistance: boolean | null;
  securityClearance: boolean;
  urgentHiring: boolean;
  // Why this posting can never be applied to, computed once at ingest by
  // classifyEligibility (AD-50). Null = eligible. Read by findUnscored (to
  // keep hard-excluded jobs out of the scoring queue permanently) and by the
  // dashboard's default-on "hide jobs I can't apply to" filter.
  ineligibleReason: IneligibleReason | null;
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
  // Best-effort minimum years of experience parsed from the posting at
  // ingest (P2). Optional on input; derived by ingestJobs, not the scraper.
  minYears?: number | null;
  // Best-effort contact email parsed from the posting at ingest (Phase 2
  // Task 9). Optional on input; derived by ingestJobs, not the scraper.
  contactEmail?: string | null;
  contactEmailCategory?: EmailCategory | null;
  contactEmailConfidence?: EmailConfidence | null;
  // Best-effort salary parsed from the posting at ingest (Phase 2 Task 10).
  // Optional on input; derived by ingestJobs, not the scraper.
  salaryCurrency?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryPeriod?: SalaryPeriod | null;
  salaryConfidence?: SalaryConfidence | null;
  // Best-effort job attributes parsed from the posting at ingest (Phase 2
  // personal-intelligence polish). Optional on input; derived by
  // ingestJobs, not the scraper.
  employmentType?: EmploymentType | null;
  seniority?: SeniorityLevel | null;
  workArrangement?: WorkArrangement | null;
  visaSponsorship?: boolean | null;
  relocationAssistance?: boolean | null;
  securityClearance?: boolean;
  urgentHiring?: boolean;
  // Eligibility verdict (AD-50). Optional on input; derived by ingestJobs
  // from classifyEligibility, not by the scraper.
  ineligibleReason?: IneligibleReason | null;
}

export interface UpsertResult {
  inserted: number;
  updated: number;
  // Jobs skipped because their fingerprint matched an already-persisted job
  // from a different source -- recorded in job_duplicates instead of
  // inserted as a new row (Phase 1 Task 1).
  duplicates: number;
}

// ingestJobs' own result: an UpsertResult plus the jobs it dropped before
// persisting anything, so a scrape run can report them (AD-50).
export interface IngestResult extends UpsertResult {
  // Foreign onsite/hybrid jobs discarded because the posting explicitly
  // refuses visa sponsorship and the `skip_unsponsored_foreign_jobs`
  // setting is on. Always 0 when the setting is off.
  skippedUnsponsored: number;
}

// A source rediscovery of an already-ingested logical job (job_duplicates
// table): the `jobs` row is never duplicated, this just preserves
// provenance for the other source(s) that also carry the same posting.
export interface JobDuplicate {
  canonicalJobId: string;
  source: JobSource;
  sourceJobId: string;
  url: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

// A user-assignable status (job_statuses table, P0). Seeded with mild
// colors; full CRUD deferred to a later phase.
export interface JobStatus {
  id: string;
  label: string;
  color: string;
  sortOrder: number;
}

export interface CreateStatusInput {
  label: string;
  color: string;
}

export interface UpdateStatusInput {
  label?: string;
  color?: string;
}

// Dashboard query filters (repositories.md §2).
export interface JobFilters {
  locationTags?: LocationTag[];
  sources?: JobSource[];
  // Keep only jobs tagged "remote" (hard narrowing; ANDs with locationTags).
  remoteOnly?: boolean;
  // Show jobs the candidate can never actually apply to (non-null
  // ineligible_reason: region-locked remote, or onsite refusing sponsorship).
  // Defaults to false -- unlike every other filter here, the *absence* of
  // this flag narrows the result set (AD-50).
  includeIneligible?: boolean;
  // Show jobs whose keyword score fell below KEYWORD_THRESHOLD. They were
  // skipped at the gate and will never receive an AI score for this
  // (role, resume), so they're hidden by default as noise. Same inverted
  // sense as includeIneligible (AD-51).
  includeLowMatch?: boolean;
  minAiScore?: number;
  // Restrict to jobs whose current status is one of these ids.
  statusIds?: string[];
  // Jobs whose status is "Archived" are hidden unless this is true.
  includeArchived?: boolean;
  // Keep jobs requiring at most this many years (P2, soft). Jobs with
  // min_years NULL ("unknown") always pass and are never excluded.
  maxYears?: number;
  // Free-text search matched against title OR company name (case-insensitive
  // substring). Structural PostgREST filter characters are stripped, same as
  // buildRoleFilter (shared/infrastructure/roleFilter.ts).
  search?: string;
  // Hide jobs whose company name contains any of these (case-insensitive
  // substring) -- muted companies, sourced from notification preferences'
  // excludeCompanies (features/notifications) so a "never show me this
  // company" mute is enforced consistently everywhere, not just in Telegram
  // alerts.
  excludeCompanies?: string[];
  // Hide jobs whose employment_type is one of these -- muted employment
  // types, sourced from notification preferences' excludeEmploymentTypes,
  // same "enforce everywhere, not just alerts" rationale as excludeCompanies.
  // A job with no determinable employment_type always passes (mirrors
  // NotificationPreferences' own "unknown type is never excluded" rule).
  excludeEmploymentTypes?: EmploymentType[];
  // Hide jobs whose title contains any of these (case-insensitive substring)
  // -- muted keywords, sourced from notification preferences' excludeKeywords.
  excludeKeywords?: string[];
}

// Job joined with its score for the active role_selection. Omits
// `description` -- the dashboard query doesn't select it (P1 #4, never
// rendered by JobRow).
type JobWithScoreOmittedKeys =
  | "description"
  | "fingerprint"
  | "canonicalCompanyName"
  | "contactEmail"
  | "contactEmailCategory"
  | "contactEmailConfidence"
  | "salaryCurrency"
  | "salaryMin"
  | "salaryMax"
  | "salaryPeriod"
  | "salaryConfidence"
  | "employmentType"
  | "seniority"
  | "workArrangement"
  | "visaSponsorship"
  | "relocationAssistance"
  | "securityClearance"
  | "urgentHiring";

export interface JobWithScore extends Omit<Job, JobWithScoreOmittedKeys> {
  keywordScore: number | null;
  aiScore: number | null;
  aiReasoning: string | null;
  // Composite ranking score (Theme 1): aiScore + configurable bonuses, or
  // null whenever aiScore is null. Drives the dashboard's default sort.
  overallScore: number | null;
  // Bonuses applied to reach overallScore (e.g. "preferred company"), for
  // display next to the score. Null/empty when none applied.
  overallScoreReasons: string[] | null;
  // Failed AI-scoring attempts for this (role, resume). Null when there's no
  // score row yet. Drives the retry cap's "gave up" bucket (AD-51).
  retryCount: number | null;
  minYears: number | null;
  // Current status (job_state join, P0). Null => unset, rendered as the
  // first seeded status (New) by the UI.
  statusId: string | null;
  statusLabel: string | null;
  statusColor: string | null;
}

// Result of findForDashboard: a limited page of jobs plus whether more rows
// exist beyond `limit` (repositories.md §2).
export interface JobsPage {
  jobs: JobWithScore[];
  hasMore: boolean;
  // Visible rows before the page slice -- what "showing 50 of N" means.
  // Bounded by DASHBOARD_FETCH_CAP.
  total: number;
  // Scoring breakdown of the filtered set. NOTE: computed *before* the
  // low-match visibility cut, so `stats.total` can exceed `total` above --
  // deliberately, since `stats.lowMatchCount` is what explains the gap
  // ("N low match hidden"). Every other filter is already applied.
  stats: JobStats;
}

// Scoring breakdown of a filtered job set. Computed from the rows the
// dashboard actually matched (computeJobStats), so the numbers always
// describe the list on screen -- the previous implementation counted every
// job_scores row in the database and ignored the filters entirely, which is
// how "50 jobs" ended up sitting next to "466 scored".
//
// The five buckets partition `total` exactly: every job is in exactly one.
export interface JobStats {
  // AI-scored: ai_score is set.
  scoredCount: number;
  // Genuinely queued for AI: cleared the keyword gate but the AI call hasn't
  // succeeded yet (failed/pending). score.ts retries these -- each retry is a
  // real, paid API call, which is why they're capped (see abandonedCount).
  awaitingAiCount: number;
  // Cleared the gate but the AI call failed MAX_AI_RETRIES times, so scoring
  // gave up to stop burning tokens (AD-51). Terminal, like lowMatchCount --
  // reported separately so a capped job is visible, not silently dropped.
  abandonedCount: number;
  // Keyword score below KEYWORD_THRESHOLD -- stage 2 was skipped on purpose
  // and will never run for this (role, resume). NOT "awaiting" anything.
  lowMatchCount: number;
  // Hard-excluded by eligibility, or never scored at all (outside the role
  // selection). Nothing is pending for these either.
  ineligibleCount: number;
  total: number;
}
