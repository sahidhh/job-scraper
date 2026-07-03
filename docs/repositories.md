# Repositories

Each repository interface lives in `features/<feature>/domain/`, e.g. `features/jobs/domain/JobRepository.ts`. Implementations live in `features/<feature>/infrastructure/Supabase<X>Repository.ts`. `application` use-cases depend only on the interface.

Conventions:
- All methods return `Promise<...>`. Errors surface as thrown exceptions (mapped to typed errors in `shared/errors`), not as part of return values.
- All `id` fields are `string` (UUID).
- Types referenced (`Job`, `NormalizedJob`, `Resume`, `RoleSelection`, `JobScore`, `Company`, `ScrapeRun`) are defined in each feature's `domain/types.ts`.

## 1. CompanyRepository (`features/companies`)

```ts
interface CompanyRepository {
  listActive(source?: JobSource): Promise<Company[]>;
  list(): Promise<Company[]>;               // all, for /settings management
  create(input: NewCompany): Promise<Company>;
  update(id: string, input: Partial<NewCompany>): Promise<Company>;
  remove(id: string): Promise<void>;
}
```

**Responsibilities:** source of truth for which (source, board_token) pairs `scripts/scrape.ts` iterates, and CRUD backing for `/settings`.

**Query patterns:**
- `listActive(source)` → `select * from companies where active = true [and source = $1]`. Called once per source at the start of `scrape.ts`.
- `create/update/remove` → standard single-row writes for the settings UI.

**Transaction boundaries:** none — every operation is a single-row write with no dependent side effects.

## 2. JobRepository (`features/jobs`)

```ts
interface JobRepository {
  upsertMany(jobs: NormalizedJob[]): Promise<{ inserted: number; updated: number }>;
  findUnscored(roleSelectionId: string, expandedRoles: string[]): Promise<Job[]>;
  findForDashboard(roleSelectionId: string, filters: JobFilters, limit: number): Promise<{ jobs: JobWithScore[]; hasMore: boolean }>;
  countMatchingExpandedRoles(expandedRoles: string[]): Promise<number>;
  listStatuses(): Promise<JobStatus[]>;                       // P0: job_statuses, ordered by sort_order
  setJobStatus(jobIds: string[], statusId: string): Promise<void>; // P0: upsert job_state per id
}
```

**Status methods (P0, docs/plans/feature-roadmap.md Phase 1):**
- `listStatuses()` → `select id, label, color, sort_order from job_statuses order by sort_order`. Drives the per-row dropdown, bulk-action bar, and dashboard status filter.
- `setJobStatus(jobIds, statusId)` → `insert into job_state (job_id, status_id, updated_at) values (...) on conflict (job_id) do update set status_id = excluded.status_id, updated_at = excluded.updated_at`. One status per job; "archive" is just setting the `Archived` status (never a DELETE — the scrape upsert would re-insert a hard-deleted row).
- `findForDashboard` now also left-joins `job_state → job_statuses` to surface `statusId/statusLabel/statusColor` on each `JobWithScore`. Status *filtering* (`filters.statusIds`, `filters.includeArchived`) resolves to a set of `jobs.id` first (PostgREST filters on an embedded resource only null the embedding, they don't drop the parent row), mirroring the `findUnscored` ai-score exclusion. Archived jobs are excluded unless `includeArchived` is set; jobs with no `job_state` row are never Archived.

**Responsibilities:** persistence and dedup of scraped postings; supplies candidate jobs to the scoring pipeline; supplies the dashboard's main query.

**Query patterns:**
- `upsertMany` → `insert into jobs (...) values (...) on conflict (source, source_job_id) do update set title = excluded.title, location_raw = excluded.location_raw, location_tags = excluded.location_tags, description = excluded.description, url = excluded.url, posted_at = excluded.posted_at, updated_at = now()`. Batched (e.g. 500 rows per statement) — `first_seen_at` is never in the `do update` clause, so it's preserved on conflict.
- `findUnscored(roleSelectionId, expandedRoles)` →
  ```sql
  select j.* from jobs j
  left join job_scores s
    on s.job_id = j.id and s.role_selection_id = $roleSelectionId
  where (s.id is null or s.ai_score is null)
    and (j.title ilike any (array[...expandedRoles patterns...])
         or j.description ilike any (array[...expandedRoles patterns...]))
  ```
  Matches title *or* description, consistent with the scrape-time role filter (`jobMatchesRoles`, AD-15) — a job ingested on a description-only role match must still be selectable for scoring. Rows with an existing `job_scores` entry are included when `ai_score is null` (decisions.md AD-14 retry).
- `findForDashboard(roleSelectionId, filters, limit)` →
  ```sql
  select j.id, j.source, j.source_job_id, j.company_id, j.company_name, j.title,
         j.location_raw, j.location_tags, j.url, j.posted_at, j.first_seen_at, j.updated_at,
         s.keyword_score, s.ai_score, s.ai_reasoning
  from jobs j
  left join job_scores s
    on s.job_id = j.id and s.role_selection_id = $roleSelectionId
  where j.location_tags && $filters.locationTags  -- if provided
    and j.source = any($filters.sources)          -- if provided
    and s.ai_score >= $filters.minAiScore         -- if provided
  order by s.ai_score desc nulls last, j.posted_at desc
  limit $limit + 1
  ```
  Fetches `limit + 1` rows; the extra row (if present) is dropped from the
  returned `jobs` and only used to compute `hasMore` for the dashboard's
  "load more" control. `j.description` is intentionally excluded from the
  select (P1 #4 — never rendered by `JobRow`, and dropping it shrinks the
  dashboard's RSC payload), so `JobWithScore` is `Omit<Job, "description">`
  plus the score fields. `filters.minAiScore` (if set) is applied as a
  `gte` filter on the embedded `job_scores.ai_score` (P1 #5) — because
  `job_scores` is a `!left` join, this filter effectively requires a
  matching scored row, excluding unscored jobs from the result.
- `countMatchingExpandedRoles(expandedRoles)` →
  ```sql
  select count(*) from jobs j
  where (j.title ilike any($roleFilter) or j.description ilike any($roleFilter))
  ```
  Same title/description `ilike` predicate as `findUnscored` (shared via the
  `buildRoleFilter` helper), but with no `role_selection_id`/`ai_score`
  exclusion — counts every job currently matching the active role
  selection's `expandedRoles`, scored or not. A `head: true, count: "exact"`
  query (no rows returned). Used by the dashboard to show how many of the
  jobs in `jobs` are actually eligible for scoring under the active role
  selection, since `findForDashboard` itself applies no role filter
  (reports/dashboard-scoring-discrepancy.md) — the two numbers can diverge
  after a role-selection change, when jobs scraped under a previous
  selection's `expandedRoles` remain in `jobs` but no longer match the
  current ones.

**Transaction boundaries:** `upsertMany` is a single batched statement (or several batches, each independently atomic) — partial success across batches is acceptable since upsert is idempotent and the next cron run retries.

## 3. ResumeRepository (`features/resume`)

```ts
interface ResumeRepository {
  getActive(): Promise<Resume | null>;
  create(input: NewResume): Promise<Resume>;   // also deactivates previous active
  updateSkills(id: string, skills: string[]): Promise<Resume>;
}
```

**Responsibilities:** stores parsed resume + skills; enforces "one active resume."

**Query patterns:**
- `getActive()` → `select * from resumes where is_active = true limit 1`.
- `updateSkills(id, skills)` → `update resumes set skills = $skills where id = $id`.

**Transaction boundaries:** `create()` must (a) set any existing `is_active = true` row to `false`, then (b) insert the new row with `is_active = true` — in that order, so the partial unique index (`resumes_single_active_uq`) is never violated. Implemented as a **Postgres function** `set_active_resume(p_file_path text, p_parsed_text text, p_skills text[]) returns setof resumes` called via `supabase.rpc()`, so both steps run atomically in the database (the Supabase JS client has no multi-statement transaction API).

## 4. RoleRepository (`features/roles`)

```ts
interface RoleRepository {
  getExpansion(role: string): Promise<{ relatedRoles: string[]; source: 'seed' | 'ai' } | null>;
  saveExpansion(role: string, relatedRoles: string[], source: 'seed' | 'ai'): Promise<void>;
  getActiveSelection(): Promise<RoleSelection | null>;
  setActiveSelection(primaryRole: string, expandedRoles: string[]): Promise<RoleSelection>;
}
```

**Responsibilities:** role_expansion_map cache reads/writes; role_selections history + active pointer.

**Query patterns:**
- `getExpansion(role)` → `select related_roles, source from role_expansion_map where role = lower(trim($role))`.
- `saveExpansion(...)` → `insert into role_expansion_map (role, related_roles, source) values (...) on conflict (role) do update set related_roles = excluded.related_roles, source = excluded.source, updated_at = now()`.
- `getActiveSelection()` → `select * from role_selections where is_active = true limit 1`.

**Transaction boundaries:** `setActiveSelection()` follows the same deactivate-then-insert pattern as `ResumeRepository.create()`, via a Postgres function `set_active_role_selection(p_primary_role text, p_expanded_roles text[]) returns setof role_selections`.

## 5. ScoreRepository (`features/scoring`)

```ts
interface ScoreRepository {
  insertScore(score: NewJobScore): Promise<void>;
  hasScore(jobId: string, roleSelectionId: string, resumeVersion: number): Promise<boolean>;
  findAwaitingAi(roleSelectionId: string, resumeVersion: number, keywordThreshold: number): Promise<AwaitingScoreJob[]>;
}
```

**Responsibilities:** persist `job_scores` rows; idempotency check for `score.ts`; surface the AI-retry queue for monitoring (Phase 1 Task 6).

**Query patterns:**
- `insertScore(score)` → calls the `upsert_job_score` RPC (Phase 1 Task 6, `decisions.md` AD-19; supersedes the plain client-side `.upsert()` described in earlier revisions of this doc): `insert into job_scores (...) values (...) on conflict (job_id, role_selection_id, resume_version) do update set keyword_score/ai_score/ai_reasoning/model/tokens_*/estimated_cost_usd = excluded.*, retry_count = job_scores.retry_count + (1 if excluded.ai_score is null else 0)` (decisions.md AD-14 for the retryable-on-conflict behavior; AD-19 for the atomic `retry_count` increment). The update-on-conflict is what makes a retried row's `ai_score` actually get persisted when `JobRepository.findUnscored()` re-selects it; the RPC (rather than a plain upsert) is what lets `retry_count` increment in the same round trip without a read-modify-write per job.
- `hasScore(jobId, roleSelectionId, resumeVersion)` → used only if a caller needs a point check outside the bulk `findUnscored` flow (e.g. future manual "re-score this job" action).
- `findAwaitingAi(roleSelectionId, resumeVersion, keywordThreshold)` → `select job_id, scored_at, retry_count from job_scores where role_selection_id = $1 and resume_version = $2 and keyword_score >= $3 and ai_score is null order by scored_at asc`. Feeds `computeScoringQueueSummary`/`getScoringQueueReport` (Phase 1 Task 6).

**Transaction boundaries:** none — single-row RPC call per job, independently idempotent.

## 6. NotificationRepository (`features/notifications`)

```ts
interface NotificationRepository {
  findUnnotifiedMatches(roleSelectionId: string, threshold: number, resumeVersion: number): Promise<JobMatch[]>;
  markNotified(jobId: string): Promise<void>;
  markManyNotified(jobIds: string[]): Promise<void>;
  listRecent(limit: number): Promise<NotificationLogItem[]>;
}
```

**Responsibilities:** finds jobs that crossed the AI-score notification threshold and haven't been sent yet; records the send; lists recent sends for `/settings`.

**Query patterns:**
- `findUnnotifiedMatches(roleSelectionId, threshold, resumeVersion)` →
  ```sql
  select j.*, s.ai_score, s.ai_reasoning
  from job_scores s
  join jobs j on j.id = s.job_id
  left join notifications_log n on n.job_id = j.id
  where s.role_selection_id = $roleSelectionId
    and s.resume_version = $resumeVersion
    and s.ai_score >= $threshold
    and n.id is null
  ```
  `resumeVersion` scopes the join to the active resume's score rows so a job scored under a stale resume version never produces a duplicate result (AD-08).
- `markNotified(jobId)` → `insert into notifications_log (job_id) values ($jobId) on conflict (job_id) do nothing`. Used by `sendNotification` (one Telegram message per job -- each match's send+mark is independent).
- `markManyNotified(jobIds)` → same upsert, one call for all ids: `insert into notifications_log (job_id) values ($jobId1), ($jobId2), ... on conflict (job_id) do nothing`. Used by `sendDigest`/`sendDigestMvp` (one Telegram message covers every match, so marking must not leave the batch half-committed if a per-item write loop failed partway -- Phase 1 Task 4 verification, `decisions.md` AD-16 follow-up). No-op for an empty array.
- `listRecent(limit)` → `select n.id, n.job_id, n.sent_at, j.title, j.company_name, j.source from notifications_log n join jobs j on j.id = n.job_id order by n.sent_at desc limit $limit` (same shape as `ScrapeRunRepository.listRecent`, §7 below). Backs the read-only `NotificationsLogList` on `/settings`.

**Transaction boundaries:** `sendNotification` processes matches one at a time: send Telegram message, then `markNotified`. If the process crashes between send and mark, the next run could re-send that one job — acceptable for a personal tool (rare, and `on conflict do nothing` keeps `markNotified` itself idempotent). `sendDigest`/`sendDigestMvp` send one message covering many jobs, then call `markManyNotified` once for the whole batch, so the same crash-between-send-and-mark window applies to the entire digest atomically rather than job-by-job. No DB transaction needed in either case since the external Telegram call can't be part of a DB transaction anyway — idempotent `notifications_log` writes are what make at-least-once delivery safe to retry.

## 7. ScrapeRunRepository (`features/sources` infrastructure, or shared)

```ts
interface ScrapeRunRepository {
  recordRun(run: NewScrapeRun): Promise<void>;
  listRecent(limit: number): Promise<ScrapeRun[]>;
  listRecentBySource(source: JobSource, limit: number): Promise<ScrapeRun[]>;
}
```

**Responsibilities:** observability log written by `scrape.ts`, read by `/settings` and by `getSourceHealthReport` (Phase 1 Task 5/7).

**Query patterns:**
- `recordRun(run)` → single insert per source per cron run. Now includes `failure_category` (Phase 1 Task 5/7, `classifyScrapeFailure.ts`): set when `status='failed'`, or `'empty_feed'` when a successful run's adapter returned zero raw jobs.
- `listRecent(limit)` → `select * from scrape_runs order by run_at desc limit $limit`.
- `listRecentBySource(source, limit)` → same, plus `.eq('source', source)`. Feeds `computeSourceHealthSummary`/`getSourceHealthReport`, which work for every source including the feed-based ones (wellfound/remoteok/mycareersfuture) that have no `companies` row and so are invisible to `companies.health_status`.

**Transaction boundaries:** none.

## 7b. MatchedJobsRepository (`features/insights`, P1)

```ts
interface MatchedJobsRepository {
  findRoleMatchedJobs(roleSelectionId: string, expandedRoles: string[]): Promise<MatchedJob[]>;
  // MatchedJob = { title; description; aiScore: number | null }
}
```

**Responsibilities:** feeds the skill-gap / demand views (`/insights`). Returns role-matched jobs reduced to text + score; the page extracts skills at read time via the shared dictionary (no persisted `jobs.skills` column — recompute chosen over persist, see docs/plans/phase-p1-insights.md).

**Query pattern:** `select title, description, job_scores!left(ai_score, role_selection_id)` filtered by the same `.or(buildRoleFilter(expandedRoles))` predicate as `JobRepository`, scoped to the active role selection. Uses the shared `buildRoleFilter` from `shared/infrastructure/roleFilter.ts` (extracted from `SupabaseJobRepository` so both repos share it without crossing the no-cross-feature-infra rule).

## 7c. SettingsRepository (`features/settings`, P2)

```ts
interface SettingsRepository {
  getDesiredExperienceYears(): Promise<number | null>;
  setDesiredExperienceYears(years: number | null): Promise<void>;
}
```

**Responsibilities:** editable user settings backed by `app_settings` (key/value). `getDesiredExperienceYears` reads key `desired_experience_years` (returns null if unset or non-numeric). `setDesiredExperienceYears(null)` deletes the row (keeps "unset" distinct from "0"); a value upserts on conflict of `key`. The dashboard reads this as the default soft `maxYears` filter; `JobFilters.maxYears` applies `min_years.is.null,min_years.lte.N` so unknown-experience jobs always pass.

## 8. Cross-Feature Read Note

`NotificationRepository.findUnnotifiedMatches` and `JobRepository.findForDashboard` both join across `jobs`, `job_scores`, and (for notifications) `notifications_log` — tables "owned" by different features. This is acceptable: **the repository pattern abstracts data access for the *application* layer, not at the SQL level**. The database has no concept of feature boundaries; a repository may run any SQL needed to fulfill its interface contract. The boundary that must hold is at the TypeScript layer — `features/notifications/application` never imports `features/jobs/infrastructure` directly; it only calls its own `NotificationRepository`, whose Supabase implementation happens to query the `jobs` table.
