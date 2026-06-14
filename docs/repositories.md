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
  findForDashboard(roleSelectionId: string, filters: JobFilters): Promise<JobWithScore[]>;
}
```

**Responsibilities:** persistence and dedup of scraped postings; supplies candidate jobs to the scoring pipeline; supplies the dashboard's main query.

**Query patterns:**
- `upsertMany` → `insert into jobs (...) values (...) on conflict (source, source_job_id) do update set title = excluded.title, location_raw = excluded.location_raw, location_tags = excluded.location_tags, description = excluded.description, url = excluded.url, posted_at = excluded.posted_at, updated_at = now()`. Batched (e.g. 500 rows per statement) — `first_seen_at` is never in the `do update` clause, so it's preserved on conflict.
- `findUnscored(roleSelectionId, expandedRoles)` →
  ```sql
  select j.* from jobs j
  left join job_scores s
    on s.job_id = j.id and s.role_selection_id = $roleSelectionId
  where s.id is null
    and j.title ilike any (array[...expandedRoles patterns...])
  ```
- `findForDashboard(roleSelectionId, filters)` →
  ```sql
  select j.*, s.keyword_score, s.ai_score, s.ai_reasoning
  from jobs j
  left join job_scores s
    on s.job_id = j.id and s.role_selection_id = $roleSelectionId
  where j.location_tags && $filters.locationTags  -- if provided
    and j.source = any($filters.sources)          -- if provided
  order by s.ai_score desc nulls last, j.posted_at desc
  ```

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
  hasScore(jobId: string, roleSelectionId: string): Promise<boolean>;
}
```

**Responsibilities:** persist `job_scores` rows; idempotency check for `score.ts`.

**Query patterns:**
- `insertScore(score)` → `insert into job_scores (...) values (...) on conflict (job_id, role_selection_id) do nothing`. Combined with `JobRepository.findUnscored()` already filtering scored jobs, this `on conflict do nothing` is a defense-in-depth no-op in the common case.
- `hasScore(jobId, roleSelectionId)` → used only if a caller needs a point check outside the bulk `findUnscored` flow (e.g. future manual "re-score this job" action).

**Transaction boundaries:** none — single-row insert per job, independently idempotent.

## 6. NotificationRepository (`features/notifications`)

```ts
interface NotificationRepository {
  findUnnotifiedMatches(roleSelectionId: string, threshold: number): Promise<JobMatch[]>;
  markNotified(jobId: string): Promise<void>;
  listRecent(limit: number): Promise<NotificationLogItem[]>;
}
```

**Responsibilities:** finds jobs that crossed the AI-score notification threshold and haven't been sent yet; records the send; lists recent sends for `/settings`.

**Query patterns:**
- `findUnnotifiedMatches(roleSelectionId, threshold)` →
  ```sql
  select j.*, s.ai_score, s.ai_reasoning
  from job_scores s
  join jobs j on j.id = s.job_id
  left join notifications_log n on n.job_id = j.id
  where s.role_selection_id = $roleSelectionId
    and s.ai_score >= $threshold
    and n.id is null
  ```
- `markNotified(jobId)` → `insert into notifications_log (job_id) values ($jobId) on conflict (job_id) do nothing`.
- `listRecent(limit)` → `select n.id, n.job_id, n.sent_at, j.title, j.company_name, j.source from notifications_log n join jobs j on j.id = n.job_id order by n.sent_at desc limit $limit` (same shape as `ScrapeRunRepository.listRecent`, §7 below). Backs the read-only `NotificationsLogList` on `/settings`.

**Transaction boundaries:** `notify.ts` processes matches one at a time: send Telegram message, then `markNotified`. If the process crashes between send and mark, the next run could re-send that one job — acceptable for a personal tool (rare, and `on conflict do nothing` keeps `markNotified` itself idempotent). No DB transaction needed since each row's mark is independent and the external Telegram call can't be part of a DB transaction anyway.

## 7. ScrapeRunRepository (`features/sources` infrastructure, or shared)

```ts
interface ScrapeRunRepository {
  recordRun(run: NewScrapeRun): Promise<void>;
  listRecent(limit: number): Promise<ScrapeRun[]>;
}
```

**Responsibilities:** observability log written by `scrape.ts`, read by `/settings`.

**Query patterns:**
- `recordRun(run)` → single insert per source per cron run.
- `listRecent(limit)` → `select * from scrape_runs order by run_at desc limit $limit`.

**Transaction boundaries:** none.

## 8. Cross-Feature Read Note

`NotificationRepository.findUnnotifiedMatches` and `JobRepository.findForDashboard` both join across `jobs`, `job_scores`, and (for notifications) `notifications_log` — tables "owned" by different features. This is acceptable: **the repository pattern abstracts data access for the *application* layer, not at the SQL level**. The database has no concept of feature boundaries; a repository may run any SQL needed to fulfill its interface contract. The boundary that must hold is at the TypeScript layer — `features/notifications/application` never imports `features/jobs/infrastructure` directly; it only calls its own `NotificationRepository`, whose Supabase implementation happens to query the `jobs` table.
