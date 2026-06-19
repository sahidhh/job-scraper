# Notification Flow Investigation

**Symptom:** 74 Telegram notifications sent in a single run with 0 new jobs inserted and 80 jobs rescored.

---

## Current Flow (step-by-step)

1. **`scripts/notify.ts:16`** — `main()` entry point.
2. **`scripts/notify.ts:23`** — `roleRepository.getActiveSelection()` fetches the active `role_selections` row. Exits if none.
3. **`scripts/notify.ts:29`** — `NOTIFY_THRESHOLD` read from env (default `0.75`); `NOTIFY_MODE` read (default `individual`).
4. **`scripts/notify.ts:34`** — Optional `NotificationPreferences` loaded from `app_settings`.
5. **`scripts/notify.ts:44`** — (individual mode) `sendNotification(roleSelectionId, deps)` called.
   - **`src/features/notifications/application/sendNotification.ts:28`** — `notificationRepository.findUnnotifiedMatches(roleSelectionId, threshold)` called.
   - **`src/features/notifications/infrastructure/SupabaseNotificationRepository.ts:37-66`** — PostgREST query runs (see Selection Logic below). Returns `JobMatch[]`.
   - **`src/features/notifications/application/sendNotification.ts:29`** — If preferences set, `filterMatches()` applied in-memory.
   - **`src/features/notifications/application/sendNotification.ts:32-41`** — For each match:
     1. `formatMatchMessage(match)` builds Telegram HTML.
     2. `telegramSender.sendMessage(message)` POSTs to Telegram Bot API.
     3. `notificationRepository.markNotified(match.jobId)` upserts into `notifications_log`.
     4. If either (2) or (3) throws, the error is caught, logged, and the loop continues. `sent` is not incremented.
   - Returns `sent` count.
6. **`scripts/notify.ts:45`** — Logs `[notify] sent N notification(s)`.

---

## Selection Logic

Query in `src/features/notifications/infrastructure/SupabaseNotificationRepository.ts:39-45`:

```ts
this.client
  .from("jobs")
  .select(
    "id, title, company_name, location_tags, source, url, description, min_years, " +
    "job_scores!inner(ai_score, ai_reasoning), notifications_log(id)"
  )
  .eq("job_scores.role_selection_id", roleSelectionId)
  .gte("job_scores.ai_score", threshold)
```

PostgREST translation:
```sql
SELECT jobs.*, job_scores.ai_score, job_scores.ai_reasoning, notifications_log.id
FROM jobs
INNER JOIN job_scores
  ON job_scores.job_id = jobs.id
  AND job_scores.role_selection_id = $roleSelectionId
  AND job_scores.ai_score >= $threshold
LEFT JOIN notifications_log
  ON notifications_log.job_id = jobs.id
```

The TypeScript filter at line 50 then removes rows where `notifications_log` is non-empty:
```ts
.filter((row) => (row.notifications_log?.length ?? 0) === 0)
```

**Eligibility conditions (all must be true):**
- Job has a `job_scores` row for the active `role_selection_id`.
- `job_scores.ai_score >= NOTIFY_THRESHOLD` (default 0.75). `NULL` ai_score never qualifies (SQL: `NULL >= x` is `NULL`, not `true`).
- No row exists in `notifications_log` for this `job_id`.

**What does NOT gate notifications:**
- Job insertion date — old jobs qualify immediately if they pass scoring.
- `resume_version` — the query does not filter by resume version. A job rescored against a new resume version still qualifies if it never had a `notifications_log` entry.
- `is_active` status — not filtered in the notification query.

---

## Existing Deduplication

Two mechanisms exist and both are correctly implemented:

### 1. Database constraint
`supabase/migrations/20260612000002_tables.sql:98`:
```sql
constraint notifications_log_job_id_uq unique (job_id)
```
One row per job, ever. A second `markNotified` call for the same `job_id` is a no-op (ON CONFLICT DO NOTHING).

### 2. Application-layer filter
`src/features/notifications/infrastructure/SupabaseNotificationRepository.ts:50`:
```ts
.filter((row) => (row.notifications_log?.length ?? 0) === 0)
```
Jobs with any `notifications_log` entry are excluded before the notification loop runs.

### 3. `markNotified` implementation
`src/features/notifications/infrastructure/SupabaseNotificationRepository.ts:69-75`:
```ts
this.client
  .from("notifications_log")
  .upsert({ job_id: jobId }, { onConflict: "job_id", ignoreDuplicates: true });
```
Idempotent write — a duplicate `job_id` insert is silently ignored.

**What deduplication covers:**
- A job notified in a prior run will have a `notifications_log` entry and is excluded from future runs.
- Triggering `notify.ts` twice in a row: second run finds nothing to send.
- Job re-scraped (same `source` + `source_job_id`) keeps the same `job_id` — same `notifications_log` entry applies.

**What deduplication does NOT cover:**
- A job being notified again after `notifications_log` is manually truncated.
- A job re-posted by a recruiter under a new ATS job ID (new `job_id`, no prior log entry).
- Jobs that were previously below threshold but cross it after a rescore run.

---

## Root Cause Analysis

The 74 notifications were genuine **first-time** notifications, not duplicates. The deduplication logic is correct and working. However, the notifications fired from already-existing jobs rather than newly-inserted ones.

### The rescore trigger

`scripts/score.ts:39` calls `jobRepository.findUnscored(roleSelection.id, expandedRoles, resume.version)`. `findUnscored` at `src/features/jobs/infrastructure/SupabaseJobRepository.ts:180-206` returns jobs that meet any of these conditions:
1. No `job_scores` row exists for the active `(role_selection_id, resume_version)`.
2. Existing row has `ai_score IS NULL` (stage 2 failed or was skipped).

This means **previously-scored jobs are rescored when:**
- A new resume is uploaded (new `resume_version` → new unique key `(job_id, role_selection_id, resume_version)` → all existing jobs are "unscored" for this version).
- A job previously scored with `ai_score = null` (AI call failed, or `keyword_score < KEYWORD_THRESHOLD`) retries and this time gets a non-null `ai_score >= 0.75`.
- The `KEYWORD_THRESHOLD` is lowered (from 0.50 to 0.25 per `scripts/score.ts:37` comment), which promotes previously-skipped jobs to stage 2.

### Why 80 jobs were rescored with 0 new insertions

One or more of these conditions applied:
- A new resume was uploaded, triggering a full rescore of all existing jobs matching the active roles.
- `KEYWORD_THRESHOLD` was lowered, re-qualifying jobs previously gated at stage 1.
- Jobs with prior `ai_score = null` retry failures were promoted on this run.

### Why 74 of the 80 rescored jobs triggered notifications

Those 74 jobs:
- Received `ai_score >= 0.75` for the first time in this scoring run.
- Had no `notifications_log` entry (were never notified in a prior run — possibly because `ai_score` was null or below threshold in prior runs, or because they were scored against a new resume version and never notified under it).

### The missing guard

`findUnnotifiedMatches` has no filter analogous to `findUnscored`'s `resume_version` filter. It selects any `job_scores` row for the active `role_selection_id` where `ai_score >= threshold`, regardless of which `resume_version` produced that score. Combined with the fact that `markNotified` is keyed on `job_id` (not `job_id + role_selection_id + resume_version`), a job is permanently locked to at-most-one notification for its entire lifetime — even across resume version changes.

The observable consequence: after uploading a new resume and running `score.ts`, all jobs that now score above threshold (including old ones that previously qualified under an old resume version and were notified then) re-appear as "unnotified" only if their prior `notifications_log` entry does not exist. If prior runs never fired notifications (e.g. system was newly set up, or log was cleared), all 80 rescored jobs above the threshold fire as first-time notifications.

---

## Recommended Fix Options

### Option 1: Scope `notifications_log` to `(job_id, role_selection_id)` (minimal change)

Add `role_selection_id` to `notifications_log`. A job notified for one role selection can be notified again if the active role selection changes. Prevents the "stale role selection" duplicate but does not scope to resume version.

**Schema change:** Add `role_selection_id uuid` column to `notifications_log`; update unique constraint to `(job_id, role_selection_id)`; update `markNotified` signature and `findUnnotifiedMatches` join condition.

### Option 2: Scope `notifications_log` to `(job_id, role_selection_id, resume_version)` (most granular)

Each unique `(job, role selection, resume version)` combination is its own notification event. This is the most semantically correct: if a user uploads a new resume and jobs are rescored, they get a fresh notification for any job that now qualifies under the new resume — intentional behavior for a rescoring workflow.

**Schema change:** Same as Option 1 plus `resume_version integer`. The `findUnnotifiedMatches` query would also need to accept and filter by `resume_version`.

### Option 3: Add a `first_scored_at` gate to `findUnnotifiedMatches`

Only notify for jobs whose `job_scores.scored_at` is within a configurable recency window (e.g. last 24 hours). Jobs rescored under a new resume version will qualify for a new window; jobs that have been sitting around for days will not re-fire unexpectedly.

**No schema change required.** Add `.gte("job_scores.scored_at", cutoffTimestamp)` to the existing query. The `cutoffTimestamp` could be an env var or hardcoded to 24 hours.

**Risk:** If `notify.ts` is not run within the window after `score.ts`, notifications are permanently missed.

### Option 4: Track last notified `resume_version` in `notifications_log`

Add a `resume_version` column to `notifications_log` (not part of the unique key). When checking for unnotified matches, also check if the existing `notifications_log.resume_version` equals the current active resume version. If it differs, treat the job as unnotified for this resume version.

**Advantage:** Intentionally re-notifies when a new resume changes a job's relevance, while still deduplicating within a single resume version's lifecycle.

### Option 5: Introduce a `notified_at` timestamp on `job_scores` (denormalized flag)

Add a nullable `notified_at` column to `job_scores`. `markNotified` updates the specific `job_scores` row(s) matching the active `(role_selection_id, resume_version)`. `findUnnotifiedMatches` adds `.is("job_scores.notified_at", null)` to the query.

**Advantage:** Keeps notification state colocated with the score, making the join simpler and avoiding a separate table join for the deduplication check. **Disadvantage:** Denormalization — the audit trail in `notifications_log` would need to be maintained separately if the log view is still required.

---

## Key File References

| Concern | File | Line(s) |
|---|---|---|
| Entry point | `scripts/notify.ts` | 16–47 |
| Individual-mode use case | `src/features/notifications/application/sendNotification.ts` | 25–44 |
| Selection query | `src/features/notifications/infrastructure/SupabaseNotificationRepository.ts` | 37–66 |
| Deduplication filter | `src/features/notifications/infrastructure/SupabaseNotificationRepository.ts` | 50 |
| `markNotified` | `src/features/notifications/infrastructure/SupabaseNotificationRepository.ts` | 69–75 |
| `notifications_log` schema | `supabase/migrations/20260612000002_tables.sql` | 91–99 |
| Unique constraint | `supabase/migrations/20260612000002_tables.sql` | 98 |
| Resume versioning migration | `supabase/migrations/20260618000002_resume_versioning.sql` | 36–40 |
| `findUnscored` (score retry logic) | `src/features/jobs/infrastructure/SupabaseJobRepository.ts` | 180–206 |
| `KEYWORD_THRESHOLD` lowering note | `scripts/score.ts` | 32–37 |
| Scoring doc (§4 notify threshold) | `docs/scoring.md` | 57–69 |
