# State Model Investigation

**Date:** 2026-06-19
**Scope:** Supabase schema, domain types, and repository implementations relevant to
scoring and notification state. Read-only analysis — no code was changed.

---

## 1. Current Schema

Every table is covered in order of migration application.

### 1.1 `companies`

Source: `supabase/migrations/20260612000002_tables.sql` lines 9–16.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | `uuid` | N | `gen_random_uuid()` | PK |
| `name` | `text` | N | — | |
| `source` | `job_source` enum | N | — | `greenhouse\|lever\|ashby\|wellfound\|remoteok\|mycareersfuture` |
| `board_token` | `text` | Y | `null` | Null for Wellfound/RemoteOK/MCF |
| `active` | `boolean` | N | `true` | Soft-disable without delete |
| `created_at` | `timestamptz` | N | `now()` | |

Unique index: `(source, board_token) WHERE board_token IS NOT NULL`.
Partial index: `(source) WHERE active = true` for scrape-time lookups.

No state tracking columns beyond `active`.

---

### 1.2 `jobs`

Sources:
- Core columns — `20260612000002_tables.sql` lines 21–37
- `min_years` — `20260616000002_experience.sql` line 9
- `last_seen_at`, `is_active`, `inactive_reason` — `20260618000001_expired_job_detection.sql` lines 11–13

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | `uuid` | N | `gen_random_uuid()` | PK |
| `source` | `job_source` enum | N | — | |
| `source_job_id` | `text` | N | — | ATS-native ID |
| `company_id` | `uuid` | Y | `null` | FK → companies; `ON DELETE SET NULL` |
| `company_name` | `text` | N | — | Denormalized for display |
| `title` | `text` | N | — | |
| `location_raw` | `text` | N | `''` | |
| `location_tags` | `location_tag[]` | N | `'{}'` | `india\|singapore\|uae\|remote` |
| `description` | `text` | N | `''` | |
| `url` | `text` | N | — | |
| `posted_at` | `timestamptz` | Y | `null` | Nullable; not all boards provide it |
| `first_seen_at` | `timestamptz` | N | `now()` | Set on insert; never updated on conflict |
| `updated_at` | `timestamptz` | N | `now()` | Overwritten on every upsert |
| `last_seen_at` | `timestamptz` | N | `now()` | Overwritten on every upsert; expiration sweep reads this |
| `is_active` | `boolean` | N | `true` | Set to `false` by expiration sweep; re-activated on re-scrape |
| `inactive_reason` | `text` | Y | `null` | Only value today: `'expired'` |
| `min_years` | `integer` | Y | `null` | Soft experience signal; `NULL` = unknown |

Unique constraint: `(source, source_job_id)`.
Indexes: `GIN(location_tags)`, `(posted_at DESC)`, `(first_seen_at DESC)`, `(is_active)`.

No `notified_at` column. No column recording whether a job has been scored.

---

### 1.3 `resumes`

Sources:
- Core columns — `20260612000002_tables.sql` lines 43–50
- `version` — `20260618000002_resume_versioning.sql` line 9

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | `uuid` | N | `gen_random_uuid()` | PK |
| `file_path` | `text` | N | — | Supabase Storage path |
| `parsed_text` | `text` | N | `''` | |
| `skills` | `text[]` | N | `'{}'` | Canonical skill names |
| `uploaded_at` | `timestamptz` | N | `now()` | |
| `is_active` | `boolean` | N | `false` | Partial unique index enforces at-most-one active |
| `version` | `integer` | N | `1` (backfill: sequential) | Monotonically increasing; set by `set_active_resume()` |

Partial unique index: `(is_active) WHERE is_active = true`.

`version` is the key state field: it lets `job_scores` record which resume version a score was computed against, enabling stale-score detection.

---

### 1.4 `role_selections`

Source: `20260612000002_tables.sql` lines 56–62.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | `uuid` | N | `gen_random_uuid()` | PK |
| `primary_role` | `text` | N | — | User's typed role |
| `expanded_roles` | `text[]` | N | — | AI/seed-expanded list |
| `created_at` | `timestamptz` | N | `now()` | |
| `is_active` | `boolean` | N | `false` | Partial unique index enforces at-most-one active |

Partial unique index: `(is_active) WHERE is_active = true`.

History rows are preserved when the user changes role; only `is_active` changes. Each old `role_selection_id` remains in `job_scores` rows, so historical scores survive.

---

### 1.5 `role_expansion_map`

Source: `20260612000002_tables.sql` lines 66–72.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `role` | `text` | N | — | PK; normalized lowercase |
| `related_roles` | `text[]` | N | — | |
| `source` | `role_map_source` enum | N | — | `seed\|ai` |
| `updated_at` | `timestamptz` | N | `now()` | |

No state tracking. Pure lookup cache.

---

### 1.6 `job_scores`

Sources:
- Core columns — `20260612000002_tables.sql` lines 78–88
- `resume_version` — `20260618000002_resume_versioning.sql` line 24
- Unique constraint changed from `(job_id, role_selection_id)` → `(job_id, role_selection_id, resume_version)` — same migration lines 36–40

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | `uuid` | N | `gen_random_uuid()` | PK |
| `job_id` | `uuid` | N | — | FK → jobs; `ON DELETE CASCADE` |
| `role_selection_id` | `uuid` | N | — | FK → role_selections; `ON DELETE CASCADE` |
| `resume_version` | `integer` | N | `0` (backfill) | Which resume version this score was computed against; `0` = sentinel for pre-versioning rows |
| `keyword_score` | `numeric(5,4)` | N | — | `[0,1]`; stage 1, always set |
| `ai_score` | `numeric(5,4)` | Y | `null` | `[0,1]`; stage 2, null if AI call failed or job below threshold |
| `ai_reasoning` | `text` | Y | `null` | Short reasoning string from AI |
| `scored_at` | `timestamptz` | N | `now()` | Timestamp of the upsert |

Unique constraint: `(job_id, role_selection_id, resume_version)`.
Indexes: `(ai_score DESC NULLS LAST)`, `(role_selection_id)`.

`scored_at` is set on insert and not updated on partial re-upserts (because the upsert uses `ignoreDuplicates: false`, which means the row is replaced, so `scored_at` will be refreshed by the `DEFAULT now()` only on a new row insert, not on an UPDATE path). In practice this means `scored_at` records either the original insert time or the time of the last full overwrite.

`resume_version` is the critical field that prevents a score from one resume being treated as valid for a different resume.

There is **no `score_model` column** recording which OpenRouter model or which model version produced `ai_score`. Changing `OPENROUTER_MODEL` silently invalidates all existing scores without any schema signal.

There is **no `role_selection_version` or similar field** beyond `role_selection_id` itself. Changing the active role selection creates a new `role_selection_id`, which is sufficient.

---

### 1.7 `notifications_log`

Source: `20260612000002_tables.sql` lines 93–99.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | `uuid` | N | `gen_random_uuid()` | PK |
| `job_id` | `uuid` | N | — | FK → jobs; `ON DELETE CASCADE`; `UNIQUE` |
| `sent_at` | `timestamptz` | N | `now()` | |

Unique constraint: `(job_id)`.

This table is the sole notification persistence mechanism. One row per job, ever. There is no column for:
- which `role_selection_id` was active when the notification was sent
- which `ai_score` triggered the notification
- which delivery channel (Telegram chat ID) received the notification
- which `NOTIFY_MODE` (`individual` vs `digest`) was in effect

---

### 1.8 `scrape_runs`

Sources:
- Core columns — `20260612000002_tables.sql` lines 104–111
- Extended columns — `20260619000001_scrape_run_metrics.sql`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | `uuid` | N | `gen_random_uuid()` | PK |
| `source` | `job_source` enum | N | — | |
| `status` | `scrape_run_status` enum | N | — | `success\|partial\|failed` |
| `found_count` | `integer` | N | `0` | Renamed from `jobs_found` in `20260619000001` |
| `error` | `text` | Y | `null` | |
| `run_at` | `timestamptz` | N | `now()` | |
| `started_at` | `timestamptz` | Y | `null` | Added in `20260619000001` |
| `completed_at` | `timestamptz` | Y | `null` | Added in `20260619000001` |
| `duration_ms` | `integer` | Y | `null` | Added in `20260619000001` |
| `kept_count` | `integer` | Y | `null` | Post-location-filter count; added in `20260619000001` |
| `inserted_count` | `integer` | Y | `null` | Net-new rows; added in `20260619000001` |
| `updated_count` | `integer` | Y | `null` | Refreshed rows; added in `20260619000001` |
| `failed_count` | `integer` | N | `0` | Sub-run errors; added in `20260619000001` |
| `metadata` | `jsonb` | Y | `null` | Reserved; added in `20260619000001` |

Index: `(run_at DESC)`.

Observability log only. Not used by any pipeline logic; purely for the settings page display.

---

### 1.9 `job_statuses`

Source: `20260616000001_job_status.sql` lines 13–19, seeded in `seed.sql`.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | `uuid` | N | `gen_random_uuid()` | PK |
| `label` | `text` | N | — | Unique; seeded: New/Interested/Applied/Rejected/Archived |
| `color` | `text` | N | — | Mild hex color for UI badge |
| `sort_order` | `integer` | N | `0` | |
| `created_at` | `timestamptz` | N | `now()` | |

Config table. No state tracking columns.

---

### 1.10 `job_state`

Source: `20260616000001_job_status.sql` lines 26–30.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `job_id` | `uuid` | N | — | PK; FK → jobs; `ON DELETE CASCADE` |
| `status_id` | `uuid` | Y | `null` | FK → job_statuses; `ON DELETE SET NULL` |
| `updated_at` | `timestamptz` | N | `now()` | |

One row per job, with `job_id` as PK (enforces at-most-one status per job). No row = "unset", rendered as "New" in the UI.

`updated_at` tracks when the status was last changed but there is no history log — a job moved from "Interested" to "Applied" loses the timestamp of when it was "Interested".

---

### 1.11 `app_settings`

Source: `20260616000002_experience.sql` lines 15–18.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `key` | `text` | N | — | PK |
| `value` | `jsonb` | N | — | |
| `updated_at` | `timestamptz` | N | `now()` | |

Key/value store. Current keys in use:
- `desired_experience_years` — integer or absent
- `notification_preferences` — `NotificationPreferences` JSON blob (roles, skills, locations, experience range, sources)

---

### 1.12 `role_packs` / `role_pack_roles`

Source: `20260618000003_role_packs.sql`.

Pure configuration; no state tracking columns. Not relevant to scoring or notification state.

---

## 2. Existing State Tracking

### 2.1 Scoring: what prevents redundant scoring

`findUnscored()` (`SupabaseJobRepository.ts` lines 180–206) uses a two-step approach:

1. Query `job_scores` for all `job_id` values where `role_selection_id = active` AND `resume_version = current` AND `ai_score IS NOT NULL`.
2. Return all active jobs matching the role filter whose `id` is NOT in that exclusion set.

This means a job is considered "fully scored" if and only if it has a `job_scores` row with:
- matching `role_selection_id`
- matching `resume_version`
- non-null `ai_score`

Jobs with `ai_score IS NULL` (AI call failed) are included in `findUnscored()` for retry. This is correct per the documented retry semantics in `docs/scoring.md §3`.

`resume_version` is fully tracked: `resumes.version` (integer, monotonically increasing per `set_active_resume()`) is stored in `job_scores.resume_version`. The unique constraint `(job_id, role_selection_id, resume_version)` means each (job, role, resume-version) triple has its own row; old rows for prior resume versions are preserved but not included in "fully scored" queries.

`role_selection_id` is fully tracked: switching the active role creates a new UUID, so all jobs are "unscored" for the new role, which is the correct behavior.

### 2.2 Notifications: what prevents duplicate sends

Two mechanisms work in tandem (documented in `docs/features/notifications.md`):

1. **Table constraint** — `notifications_log(job_id)` has a `UNIQUE` constraint. `markNotified()` uses `upsert … ON CONFLICT (job_id) DO NOTHING` (`SupabaseNotificationRepository.ts` line 69–73).
2. **Query filter** — `findUnnotifiedMatches()` performs a left join from `jobs` to `notifications_log` and filters in-application-code on `(row.notifications_log?.length ?? 0) === 0` (`SupabaseNotificationRepository.ts` lines 49–50).

The at-most-once guarantee is per `job_id` for the lifetime of the data.

### 2.3 Job lifecycle state

`jobs` tracks:
- `first_seen_at` — immutable; set on first insert.
- `last_seen_at` — updated on every upsert; drives expiration sweep.
- `updated_at` — updated on every upsert; general-purpose change tracking.
- `is_active` / `inactive_reason` — set by the expiration sweep after `JOB_EXPIRATION_DAYS` without a `last_seen_at` touch.

`job_state` tracks user-assigned workflow status (New / Interested / Applied / Rejected / Archived) with `updated_at`.

---

## 3. Missing State Tracking

### 3.1 No per-notification context in `notifications_log`

`notifications_log` records that a notification was sent and when, but not:

- **`role_selection_id`** — which role was active when the notification was sent. If the user changes role, there is no way to tell which notifications were sent under the old role context vs the new one. This prevents queries like "show me all jobs I was notified about under my current role."

- **`ai_score_at_notification`** — the `ai_score` value at the time of notification. Because `job_scores.ai_score` is mutable (re-scored on resume change), the score that originally triggered a notification may differ from the current score shown in the dashboard.

- **`notify_threshold`** — the `NOTIFY_THRESHOLD` env var value used at send time. If the threshold is lowered, there is no record of why some jobs were notified earlier than others.

- **`channel`** — the Telegram chat ID used. Relevant if the user migrates to a different chat; historical log entries would be ambiguous.

- **`notify_mode`** — whether the notification was sent as `individual` or `digest`. Not currently needed, but would help with debugging duplicate/missed delivery.

### 3.2 No AI model version in `job_scores`

There is no `model` or `model_version` column in `job_scores`. When `OPENROUTER_MODEL` changes:
- All existing `job_scores` rows with `ai_score IS NOT NULL` appear "fully scored" and will NOT be re-scored by `findUnscored()`.
- The dashboard continues showing scores computed by the old model.
- There is no schema signal that a model change occurred; detection requires checking cron logs or env var history.

This is documented as a known limitation (`design/limitations.md §3.4`) but has no schema mitigation.

### 3.3 No `keyword_threshold` or `ai_threshold` recorded in `job_scores`

`KEYWORD_THRESHOLD` and `NOTIFY_THRESHOLD` are environment variables that can change between runs. `job_scores` does not record:
- The `KEYWORD_THRESHOLD` value that was in effect when the row was inserted (relevant to understand why some jobs have `ai_score IS NULL` — was the threshold different at score time?).

### 3.4 No `scored_at` update on re-score

`scored_at` is `DEFAULT now()` set at insert time. The upsert in `SupabaseScoreRepository.insertScore()` uses `ignoreDuplicates: false`, meaning on conflict the existing row is overwritten. Whether `scored_at` is refreshed depends on whether it is included in the update's column list. Looking at the upsert call (lines 10–24 of `SupabaseScoreRepository.ts`), only `keyword_score`, `ai_score`, and `ai_reasoning` are provided in the upsert object — `scored_at` is omitted. Supabase's `upsert` with `ignoreDuplicates: false` performs an `INSERT … ON CONFLICT … DO UPDATE SET` only for the columns supplied. Since `scored_at` is not supplied, it will NOT be updated on re-score; it retains the value from the original insert. This means `scored_at` records the first insert time, not the last re-score time. There is no `last_scored_at` column.

### 3.5 `hasScore()` does not filter by `resume_version`

`ScoreRepository.hasScore(jobId, roleSelectionId)` (`SupabaseScoreRepository.ts` lines 26–35) queries `job_scores` without filtering by `resume_version`. This method is defined in the interface (`ScoreRepository.ts` line 13) and used in at least one test fixture. If a caller uses `hasScore()` to gate scoring, it will incorrectly report `true` for a job that has only an old-resume-version score, allowing the job to be skipped despite needing re-scoring. However, in practice the scoring pipeline uses `findUnscored()` (which does filter by `resume_version` and `ai_score IS NOT NULL`) rather than `hasScore()` — `hasScore()` appears to be a vestigial or supplementary method not currently on the hot path.

### 3.6 No notification state for preference-filtered jobs

Jobs filtered out by `NotificationPreferences` (roles/skills/location/experience/source) are deliberately NOT marked as notified (`docs/tasks/notification-filters.md §Design Decision 7`). This is correct, but there is no schema mechanism to distinguish:
- Jobs that have never been candidates for notification (below `NOTIFY_THRESHOLD`)
- Jobs that are eligible but were filtered by preferences on a specific run

Both appear identical in the database. If preferences are never cleared, filtered-eligible jobs will be re-evaluated on every notify run forever, with no record of how many times they were considered and rejected.

---

## 4. Risks

### 4.1 Model change silently invalidates all scores

Risk level: **Medium**. Changing `OPENROUTER_MODEL` produces no schema change. All rows with `ai_score IS NOT NULL` are excluded from `findUnscored()` regardless of which model produced them. A score from a weak model will not be replaced by a better model unless:
- The user manually truncates `job_scores`, or
- A new `resume_version` is uploaded (which creates new unique-key triples but only forces re-score via `findUnscored()`'s exclusion logic).

### 4.2 `notifications_log` is job-lifetime, not role-lifetime

Risk level: **Low-Medium**. A job notified under role A will never be re-notified under role B (different `role_selection_id`). The `UNIQUE(job_id)` constraint treats notification as a one-time event for the entire life of a job row, independent of which role or score was active. For a user who frequently changes roles, this means genuinely relevant jobs may never be re-notified after a role switch.

### 4.3 `hasScore()` ignores `resume_version`

Risk level: **Low** (current). The method exists and is tested but does not appear to gate the scoring pipeline path (`findUnscored()` is used instead). However, if `hasScore()` is called in future features to guard against re-scoring, it will produce false positives for stale-resume-version rows.

### 4.4 `scored_at` is not updated on re-score

Risk level: **Low**. Dashboard queries do not display or sort by `scored_at`. It is present in the domain type (`JobScore.scoredAt`) but `JobWithScore` does not expose it to the UI. The field would become misleading if it were ever surfaced: a job scored on day 1 under resume v1, then re-scored on day 30 under resume v2, still shows `scored_at` of day 1.

### 4.5 Adding columns to `job_scores` may invalidate the unique constraint backfill

Risk level: **Low**. `20260618000002_resume_versioning.sql` already demonstrated this: adding `resume_version` required dropping and recreating the unique constraint. Any new column added to the unique key would require the same pattern. Columns added outside the key (e.g., `model`) are safe with a straightforward `ALTER TABLE … ADD COLUMN`.

### 4.6 `notifications_log` CASCADE delete on job delete

If a `jobs` row is ever hard-deleted (currently prevented by convention but not by constraint), the `notifications_log` row cascades away, and the job could theoretically be re-notified if re-scraped and re-inserted with the same ATS ID. The upsert on `(source, source_job_id)` would restore the same logical job but under a new `uuid` `id`, so the old `notifications_log` row (already deleted) would not match. This is an edge case for an unusual operation path.

---

## 5. Recommended Improvements

Ordered from simplest/highest-impact to more involved.

### 5.1 Add `role_selection_id` to `notifications_log` (add column — no constraint change)

**Why:** Allows querying "jobs notified under the current role." Enables a future feature to re-notify a job if the role changes significantly. Provides audit clarity without breaking the existing unique-per-job guarantee.

**How:** `ALTER TABLE notifications_log ADD COLUMN role_selection_id uuid REFERENCES role_selections(id) ON DELETE SET NULL;`

Nullable so existing rows are unaffected. `markNotified()` would pass the current `roleSelectionId`. No unique constraint change.

**Backward compatible:** Yes. Existing rows get `null`; new rows get the current role.

---

### 5.2 Add `ai_score_snapshot` to `notifications_log` (add column)

**Why:** Records the `ai_score` at the time of notification. The current score in `job_scores` may differ after a re-score (e.g., after a resume change). This makes the notification log self-contained.

**How:** `ALTER TABLE notifications_log ADD COLUMN ai_score_snapshot numeric(5,4);`

Nullable; populated by `markNotified()` which already receives the `JobMatch` (which includes `aiScore`).

**Backward compatible:** Yes.

---

### 5.3 Add `model` column to `job_scores` (add column)

**Why:** When `OPENROUTER_MODEL` changes, all existing fully-scored rows block re-scoring. With a `model` column, `findUnscored()` could optionally filter out rows scored by an outdated model, or the dashboard could flag stale model scores. This resolves the silent-invalidation risk (§4.1).

**How:** `ALTER TABLE job_scores ADD COLUMN model text;`

Nullable; set to the model string during stage-2 scoring. Existing rows get `null` (pre-model-tracking). A follow-up migration could add `model` to the unique key if per-model score history is desired, but that is a separate, larger change.

**Backward compatible:** Yes (column only; unique key unchanged).

---

### 5.4 Fix `hasScore()` to accept `resumeVersion` parameter (code only, no migration)

**Why:** The method currently ignores `resume_version` and will return `true` for a job with only a stale-resume score. This is not currently on the hot path, but if it is ever used as a gate, it will silently skip re-scoring.

**How:** Add `resumeVersion: number` parameter to `ScoreRepository.hasScore()` and add `.eq("resume_version", resumeVersion)` to the Supabase query in `SupabaseScoreRepository`. No schema change required.

**Backward compatible:** Yes (interface signature change only; callers must be updated).

---

### 5.5 Add `last_scored_at` to `job_scores` (add column, update upsert)

**Why:** `scored_at` records insert time, not last re-score time. Surfacing "last scored" on the dashboard would help users understand how fresh a score is.

**How:** `ALTER TABLE job_scores ADD COLUMN last_scored_at timestamptz;` and update `SupabaseScoreRepository.insertScore()` to include `last_scored_at: new Date().toISOString()` in the upsert payload. The existing `scored_at` column would then clearly mean "first scored" and the new column means "most recently scored."

Alternatively, rename `scored_at` → `first_scored_at` and add `last_scored_at`, but renaming a column in production requires a migration that drops and recreates dependent indexes/views.

**Backward compatible:** Yes (add column; existing rows get `null` for `last_scored_at`).

---

### 5.6 Add `notified_at` denormalization to `jobs` (add column — optional convenience)

**Why:** Would allow a single-table query to check notification status without joining `notifications_log`. The cost is data duplication (the authoritative record remains in `notifications_log`).

**Assessment:** The join is cheap (single-row join on indexed PK), and `notifications_log` is already used correctly. This improvement is low priority and adds maintenance burden (must keep in sync with `notifications_log`). Not recommended unless query performance on the notification join is measured to be a bottleneck.

---

## Key File Locations Referenced

| File | Purpose |
|------|---------|
| `supabase/migrations/20260612000002_tables.sql` | Core table definitions |
| `supabase/migrations/20260612000003_indexes.sql` | All indexes and partial-unique constraints |
| `supabase/migrations/20260618000001_expired_job_detection.sql` | `last_seen_at`, `is_active`, `inactive_reason` on jobs |
| `supabase/migrations/20260618000002_resume_versioning.sql` | `resume_version` on job_scores; unique key change |
| `supabase/migrations/20260616000001_job_status.sql` | `job_state`, `job_statuses` tables |
| `supabase/database.types.ts` | Generated TypeScript types for all tables |
| `src/features/jobs/infrastructure/SupabaseJobRepository.ts` | `findUnscored()` and `upsertMany()` implementations |
| `src/features/scoring/infrastructure/SupabaseScoreRepository.ts` | `insertScore()` and `hasScore()` implementations |
| `src/features/notifications/infrastructure/SupabaseNotificationRepository.ts` | `findUnnotifiedMatches()` and `markNotified()` |
| `src/features/jobs/domain/types.ts` | `Job`, `NormalizedJob`, `JobWithScore` domain types |
| `src/features/scoring/domain/types.ts` | `JobScore`, `NewJobScore` domain types |
| `src/features/notifications/domain/types.ts` | `JobMatch`, `NotificationPreferences`, `NotificationLogEntry` |
| `docs/scoring.md` | Scoring pipeline and retry semantics |
| `docs/features/notifications.md` | Notification deduplication architecture |
| `design/limitations.md` | Known technical debt including model-change gap |
| `design/erd.md` | Full ERD with all tables and relationships |
