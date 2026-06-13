# Performance Review Audit

Scope: query patterns in all `Supabase*Repository` implementations, dashboard data fetching, and notification matching, vs. `docs/database.md` indexes and `docs/repositories.md` query patterns.

---

## Findings

### 1. `upsertMany` runs extra SELECTs purely to compute an unused `{inserted, updated}` result

- **Severity:** Medium
- **File:** `src/features/jobs/infrastructure/SupabaseJobRepository.ts:70-122`
- **Location:** `upsertMany` (lines 70-93) batches input by `UPSERT_BATCH_SIZE = 500`, and for each batch calls the private `findExistingKeys(batch)` (lines 99-122) — which issues one `SELECT source_job_id` query per distinct `source` present in the batch — **before** performing the actual upsert, solely to classify each row as "inserted" vs "updated" for the returned `UpsertResult`.
- **Description:** Confirmed via grep that `UpsertResult.inserted` / `.updated` have **zero consumers** anywhere in `src/` — no caller reads these counts (not even for logging). The extra SELECT-before-upsert round trip(s) are pure overhead with no observable effect on behavior.
- **Why it matters:** Every ingestion run does up to (1 SELECT per distinct source per 500-row batch) + (1 upsert per batch) database round trips, when (1 upsert per batch) alone would suffice. For a scrape across 5 sources with thousands of jobs, this roughly doubles the database round trips for `upsertMany`, adding latency to the (currently nonexistent, per architecture-audit Finding #1) scrape pipeline for zero functional benefit, and consumes Supabase's request quota (cost-audit relevance).
- **Recommended fix:** Either (a) remove `findExistingKeys` and the `{inserted, updated}` distinction entirely — have `upsertMany` return `void` or just a total count from the upsert response — if no caller needs the breakdown; or (b) if the breakdown is genuinely wanted for future `scrape_runs` reporting (architecture-audit Finding #2), compute it from the upsert response itself (Postgres `INSERT ... ON CONFLICT ... RETURNING xmax` or comparing `created_at = updated_at` on the returned rows) rather than a separate pre-upsert SELECT.

---

### 2. `findForDashboard` applies `minAiScore` filter in JavaScript after fetch

- **Severity:** Low
- **File:** `src/features/jobs/infrastructure/SupabaseJobRepository.ts:146-173`
- **Location:** Lines 168-171 — after the Supabase query returns, the code does `.filter((job) => filters.minAiScore === undefined || (job.aiScore ?? 0) >= filters.minAiScore)` in JS.
- **Description:** `ai_score` lives on the joined `job_scores` table (`jobs` ⋈ `job_scores` via `role_selection_id`), and applying a `>=` filter on a joined/embedded table's column via PostgREST's `.gte()` on a nested select isn't directly expressible in a single `supabase-js` call the way a same-table column filter is — hence the post-fetch JS filter.
- **Why it matters:** When a user sets a high `minScore` filter on `/dashboard`, the database still returns and transmits every row matching `location`/`source` filters (potentially the full unfiltered set), and the score filter only trims the result client-side after the full payload has already been fetched. For a small personal job board this is unlikely to be a real bottleneck today, but it scales linearly with total job count rather than with the filtered result size, and wastes egress/bandwidth from Supabase.
- **Recommended fix:** Move this filter into the database via a Postgres view or RPC that joins `jobs`+`job_scores` and exposes `ai_score` as a queryable column, allowing `.gte("ai_score", filters.minAiScore)` server-side. Given the dataset size for a single-user app, this is a "nice to have" rather than urgent — document the current behavior's scaling characteristics in `repositories.md` if not changed.

---

### 3. `findUnnotifiedMatches` filters `notifications_log` embed in JS

- **Severity:** Low
- **File:** `src/features/notifications/infrastructure/SupabaseNotificationRepository.ts:38`
- **Location:** `findUnnotifiedMatches` selects `job_scores!inner(...)` joined with a `notifications_log(id)` embed, then filters `row.notifications_log.length === 0` in application code.
- **Description:** PostgREST embedded-resource filtering can't directly express "left join where the embedded collection is empty" (an anti-join) in a single `.select()`/`.filter()` call without a view or `not.exists` RPC, so every already-notified `job_scores` row above the AI-score threshold is fetched and then discarded in JS.
- **Why it matters:** Over time, `notifications_log` grows to roughly the same size as "all jobs ever matched," so this query's result set (before JS filtering) grows unbounded even though the useful output (newly-matched, unnotified jobs) stays small per run. Same class of issue as Finding #2 — currently fine at small scale, but doesn't scale gracefully.
- **Recommended fix:** Same pattern as Finding #2 — a Postgres view/RPC using `left join ... where notifications_log.id is null` (true anti-join) would let the database do the filtering and only return rows that actually need notifying.

---

### 4. `findUnscored`'s unbounded `NOT IN` list (cross-reference)

- **Severity:** Low
- **File:** `src/features/jobs/infrastructure/SupabaseJobRepository.ts:124-144`
- **Description:** Already detailed in `scraper-audit.md` Finding #2 — the `.not("id","in", "(...)")` exclusion list grows with the total number of previously-scored jobs for a role selection, with no pagination or anti-join alternative.
- **Why it matters / Recommended fix:** See `scraper-audit.md` Finding #2 (same root cause and fix as Finding #3 above — anti-join via view/RPC).

---

## Summary of Compliant Areas (no action needed)

- **Indexes**: every query pattern documented in `repositories.md` has a corresponding index from `20260612000003_indexes.sql` — `jobs_location_tags_idx` (GIN) supports `findForDashboard`'s location-tag filter, `jobs_posted_at_idx`/`jobs_first_seen_idx` support ordering, `job_scores_role_selection_idx` supports the `findUnscored`/`findUnnotifiedMatches` joins, `companies_source_token_uq`/`companies_active_idx` support scraper company lookups. No missing-index issue found.
- **`/settings` page** (`src/app/(protected)/settings/page.tsx`) correctly uses `Promise.all([companyRepository.list(), scrapeRunRepository.listRecent(20)])` for parallel independent fetches rather than sequential awaits — no N+1 here.
- **Batched upserts**: `upsertMany`'s `UPSERT_BATCH_SIZE = 500` chunking is a sound pattern for bulk ingestion (avoids single oversized payloads) — the issue is only the redundant pre-upsert SELECT (Finding #1), not the batching itself.
- **No N+1 query patterns found** in the dashboard/role/resume read paths — `findForDashboard`, `getActiveSelection`, and the active-resume fetch are each single queries (with the noted post-fetch JS filtering caveats above, which are extra-data-transferred issues, not N+1 issues).
- **`fetchWithRetry`** bounds scraper network calls to at most 2 attempts (1 retry) with a 2s backoff, and only retries on 5xx/network errors — avoids unbounded retry storms against third-party job boards.
- **OpenRouter timeout** (`REQUEST_TIMEOUT_MS = 15_000`) bounds AI call latency, preventing a hung request from stalling the scoring pipeline indefinitely.
