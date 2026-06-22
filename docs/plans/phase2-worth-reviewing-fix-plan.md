# Phase 2A — Worth Reviewing Correctness Fix Plan

**Date:** 2026-06-22  
**Status:** Planning only. No code changes.  
**Source:** `docs/investigations/worth-reviewing-analysis.md`  
**Scope:** Findings 1–5 only. Findings 6–9 are tracked but excluded from this plan.

---

## Executive Summary

Five confirmed correctness bugs affect the Worth Reviewing feature across two surfaces: the Telegram webhook pagination and the dashboard. The bugs fall into two root-cause clusters:

- **Resume versioning propagation gap (Findings 1 & 2):** The `digest_sessions` table and the webhook route were designed after resume versioning was introduced. Both are missing `resume_version`, making score display non-deterministic after a resume upload.
- **Dashboard query / stat design gaps (Findings 3, 4 & 5):** The dashboard uses a PostgREST `!left` join for all queries, which silently ignores the `minAiScore` filter on the parent row. Stat counters (`scoredCount`, `pendingCount`) are derived from the page result rather than the full dataset, and the `matchingRoleCount` uses a different population scope than everything else on the same stat line.

None of these findings require architectural changes. All fixes work within the existing layer structure: one new migration, targeted query changes in two infrastructure files, and a UI copy tweak.

---

## Recommended Implementation Order

| Step | Finding | Category | Risk | Rationale |
|---|---|---|---|---|
| 1 | **F2** — Add `resume_version` to `digest_sessions` | Schema change | Medium | Prerequisite for F1; migration must land first |
| 2 | **F1** — Add `resume_version` filter to webhook score query | Query fix | Low | Unblocked by F2; safe restriction |
| 3 | **F3** — Switch `findForDashboard` to `!inner` when `minAiScore` set | Query fix | Medium | Independent; conditional join avoids regressing unfiltered view |
| 4 | **F4** — Elevate dashboard stats to dataset-level aggregates | New repo method | Low | Additive; no API contract change |
| 5 | **F5** — Clarify stat line wording for mixed-scope metrics | UI copy | Low | No logic change, pure clarity |

Steps 1 and 2 are tightly coupled and should be delivered together in a single commit.  
Steps 3, 4, and 5 are independent and can be sequenced or parallelised.

---

## Finding 1 — Webhook drops `resume_version` from score fetch

### Root Cause

`route.ts` fetches `job_scores` for the session's job IDs filtering only on `role_selection_id`:

```typescript
// route.ts:69-74
.select("id, title, company_name, url, job_scores!inner(ai_score)")
.in("id", session.worthReviewingJobIds)
.eq("job_scores.role_selection_id", session.roleSelectionId)
// resume_version filter: absent
```

After the resume versioning migration (`20260618000002_resume_versioning.sql`), the unique key on `job_scores` is `(job_id, role_selection_id, resume_version)`. A single job may therefore have multiple score rows under different versions. Without a `resume_version` filter, PostgREST returns all matching rows; `j.job_scores[0]?.ai_score` picks an arbitrary row (order is not guaranteed for `!inner` + `.in()`), which may be from a stale prior version.

The root cause is ordering: the webhook and `digest_sessions` table were created three days after resume versioning (migration `20260621000001`), but were not written with versioning awareness.

### Files Affected

| File | Change needed |
|---|---|
| `src/app/api/telegram/webhook/route.ts:69-74` | Add `.eq("job_scores.resume_version", session.resumeVersion)` |
| `src/app/api/telegram/webhook/route.ts:87` | `j.job_scores[0]?.ai_score` is now deterministic after the filter |

**Unblocked only after Finding 2** — `session.resumeVersion` must exist on the `DigestSession` type and be populated by the save path.

### Schema Impact

None for this finding directly. Relies on the `resume_version` column added by Finding 2's migration.

### API Impact

None — internal query change inside the webhook route.

### Migration Requirements

None for this finding. Blocked on Finding 2's migration (`ALTER TABLE digest_sessions ADD COLUMN resume_version`).

### Regression Risks

**Low.** Adding a filter can only narrow the result set — it cannot surface incorrect data. If `session.resumeVersion` equals the version used when the digest was sent, the returned scores will match the digest exactly. Edge case: if the migration backfills existing `digest_sessions` rows with `resume_version = 0` (the sentinel value used for pre-versioning scores), the webhook will correctly return 0 rows for stale sessions, causing the pagination message to show "0 results" rather than stale data. This is an acceptable degradation for historical sessions.

### Verification Strategy

1. Confirm an existing digest session exists (check `digest_sessions` table).
2. Upload a new resume (increments `resumes.version`).
3. Run the notify cron (`scripts/notify.ts`) to create a new digest session with the new version.
4. Tap the "Worth Reviewing" button in Telegram.
5. Verify the displayed scores match the scores in the most recent digest message, not scores from the prior resume version.
6. **Regression check:** tap on an older pagination session (if still active) — should show 0 results or a graceful empty state, not stale scores.

---

## Finding 2 — `digest_sessions` does not store `resume_version`

### Root Cause

The `digest_sessions` table was designed to support Worth Reviewing pagination, but the schema was written without a `resume_version` column:

```sql
-- 20260621000001_digest_sessions.sql
create table digest_sessions (
  id                       uuid        primary key default gen_random_uuid(),
  role_selection_id        uuid        not null,
  worth_reviewing_job_ids  text[]      not null default '{}',
  pagination_message_id    bigint,
  created_at               timestamptz not null default now()
);
```

Without `resume_version`, a digest session created under resume version N is indistinguishable from one created under version N+1. The webhook has no way to correctly scope the score query back to the version that was active when the digest was sent.

### Files Affected

| File | Change needed |
|---|---|
| `supabase/migrations/<new>_digest_sessions_resume_version.sql` | `ALTER TABLE digest_sessions ADD COLUMN resume_version integer NOT NULL DEFAULT 0` |
| `src/features/notifications/domain/types.ts:49-55` | Add `resumeVersion: number` to `DigestSession` interface |
| `src/features/notifications/domain/DigestSessionRepository.ts:4` | Add `resumeVersion: number` parameter to `save()` signature |
| `src/features/notifications/infrastructure/SupabaseDigestSessionRepository.ts:9-17` | Include `resume_version` in `INSERT`; map it in `getLatest()` |
| `src/features/notifications/application/sendDigestMvp.ts:72-77` | Pass `deps.resumeVersion` to `digestSessionRepository.save()` |
| `scripts/notify.ts:55-58` | No change needed — `deps.resumeVersion` already set from `resume.version` |

### Schema Impact

**One new migration required.** The `resume_version` column must default to `0` (the existing sentinel for pre-versioning scores) so that existing rows are not broken.

```sql
-- New migration: supabase/migrations/<timestamp>_digest_sessions_resume_version.sql
ALTER TABLE digest_sessions
  ADD COLUMN resume_version integer NOT NULL DEFAULT 0;
```

No index needed — `digest_sessions` is only queried via `getLatest()` which uses `ORDER BY created_at DESC LIMIT 1`.

RLS: `digest_sessions` has no RLS policy in the original migration. Confirm whether one is needed; if the table is only accessed via the service role key (cron + webhook), no RLS policy is required. If accessed via the authenticated role (Next.js server actions), add the standard `authenticated_full_access` policy in the same migration.

After migration, `supabase/database.types.ts` must be regenerated.

### API Impact

`DigestSessionRepository.save()` signature changes from:

```typescript
save(roleSelectionId: string, worthReviewingJobIds: string[]): Promise<{ id: string }>
```

to:

```typescript
save(roleSelectionId: string, worthReviewingJobIds: string[], resumeVersion: number): Promise<{ id: string }>
```

This is a breaking interface change — all callers of `save()` must pass `resumeVersion`. Currently there is exactly one caller: `sendDigestMvp.ts`. The `resumeVersion` is already available in `deps.resumeVersion` at the call site.

`DigestSession.resumeVersion` is a new read field — all consumers of `getLatest()` gain a new property. The webhook route is the primary consumer and will use it for Finding 1.

### Migration Requirements

- New forward-only migration file: `supabase/migrations/<timestamp>_digest_sessions_resume_version.sql`
- `ALTER TABLE` statement (safe — adds nullable-equivalent column with a default)
- Regenerate `supabase/database.types.ts`
- Update `docs/database.md` — add `resume_version` to the `digest_sessions` table definition

### Regression Risks

**Medium.** Existing `digest_sessions` rows backfilled with `resume_version = 0` will be treated by the updated webhook as if they were scored under the sentinel version. If there are no `job_scores` rows with `resume_version = 0` (i.e., all scores have been assigned version ≥ 1), tapping "Worth Reviewing" on any legacy session will return 0 results. The webhook already handles this gracefully (`if (!session || session.worthReviewingJobIds.length === 0) return`). **No data loss; existing sessions simply degrade gracefully.**

Test risk: `sendDigestMvp.test.ts` mocks `digestSessionRepository.save`. The mock must be updated to accept the new `resumeVersion` parameter, or the test will fail to compile. Grep for all mock `DigestSessionRepository` implementations before merging.

### Verification Strategy

1. Run the notify cron in `digest` mode.
2. Query `digest_sessions` — confirm the new row has `resume_version` equal to the active `resumes.version`.
3. Tap "Worth Reviewing" — confirm scores shown match the digest message.
4. Upload a new resume; re-run notify cron; confirm the new session's `resume_version` is incremented.
5. Tap "Worth Reviewing" on the *new* session — confirm scores reflect the new resume version.
6. Tap "Worth Reviewing" on an *old* session (if accessible) — expect 0 results or graceful empty state.

---

## Finding 3 — Dashboard `minAiScore` filter with `!left` join does not exclude jobs

### Root Cause

`findForDashboard` uses `job_scores!left` for all queries (so that unscored jobs remain visible on the dashboard). When `minAiScore` is set, the filter is applied to the embedded resource:

```typescript
// SupabaseJobRepository.ts:267-269
if (filters.minAiScore !== undefined) {
  query = query.gte("job_scores.ai_score", filters.minAiScore);
}
```

In PostgREST, a filter on an `!left`-joined embedded resource **narrows the embedded array** but **does not exclude the parent row**. Jobs without a qualifying score row (or with a score below the threshold) have `job_scores: []` in the result. `toDashboardJob` maps `job_scores[0]` → `undefined` → `aiScore: null`, making them visually appear as "unscored/pending".

This means the `/dashboard?minScore=0.80` deep-link from the Telegram digest shows all active jobs, with sub-threshold jobs rendered as "pending" rather than excluded.

### Files Affected

| File | Change needed |
|---|---|
| `src/features/jobs/infrastructure/SupabaseJobRepository.ts:36-37` | `DASHBOARD_SELECT` must be conditionally adjusted |
| `src/features/jobs/infrastructure/SupabaseJobRepository.ts:244-294` | `findForDashboard` — switch join type when `minAiScore` is defined |

### Proposed Fix

Build the select string conditionally inside `findForDashboard`:

```typescript
// When minAiScore is defined, use !inner so jobs without a qualifying score are excluded.
// When minAiScore is undefined, keep !left so unscored jobs remain visible (existing behaviour).
const joinType = filters.minAiScore !== undefined ? "inner" : "left";
const selectStr = DASHBOARD_SELECT.replace("job_scores!left", `job_scores!${joinType}`);

let query = this.client
  .from("jobs")
  .select(selectStr)
  .eq("is_active", true)
  .eq("job_scores.role_selection_id", roleSelectionId)
  .eq("job_scores.resume_version", resumeVersion);
```

The `minAiScore` filter itself (`query.gte("job_scores.ai_score", filters.minAiScore)`) is retained — it now correctly narrows and excludes because the join is `!inner`.

`DASHBOARD_SELECT` stays as a constant with `!left`; the conditional substitution is only inside `findForDashboard`.

Alternatively, define two constants (`DASHBOARD_SELECT_LEFT` and `DASHBOARD_SELECT_INNER`) for explicitness. The string-replace approach is acceptable given that the pattern is a known PostgREST embed suffix with no other occurrences in the string.

### Schema Impact

None.

### API Impact

None — `findForDashboard` signature unchanged. Return type (`JobsPage`) unchanged. The change is purely in query construction.

### Migration Requirements

None.

### Regression Risks

**Medium.** The change is **conditional on `minAiScore` being defined**, so the default (unfiltered) dashboard view retains `!left` and is unaffected. Risk is limited to the filtered view:

- **Intended change:** `/dashboard?minScore=0.80` now shows only jobs with `ai_score >= 0.80` (down from "all jobs with unscored ones showing as pending").
- **Potential issue:** If a user navigates to `/dashboard?minScore=0.80` expecting to see unscored jobs alongside scored ones, they will no longer appear. However, this is the correct behaviour for a score threshold filter — the old behaviour was a bug.
- **Stat line impact:** With `!inner`, `scoredCount` will equal `jobs.length` and `pendingCount` will be 0 when `minAiScore` is set. The stat line will read "N jobs found, N scored by AI, 0 pending" — accurate for the filtered view.
- **Sort order:** No change — `ORDER BY ai_score DESC` still applies; all returned jobs are scored so nullsFirst ordering is irrelevant.

Existing tests for `findForDashboard` with `minAiScore` set must be updated to reflect the new `!inner` join behaviour (mock must not return unscored jobs when `minAiScore` is defined).

### Verification Strategy

1. Navigate to `/dashboard?minScore=0.80`.
2. Confirm all visible jobs have a non-null AI score ≥ 0.80.
3. Confirm no jobs appear with `aiScore: null`.
4. Confirm the stat line reads "N jobs found, N scored by AI, 0 pending".
5. Navigate to `/dashboard` (no filter) — confirm unscored jobs are still visible (regression check).
6. Navigate to `/dashboard?minScore=0.75` — confirm threshold is respected.

---

## Finding 4 — Dashboard stats computed on page, not dataset

### Root Cause

`scoredCount`, `pendingCount`, `notEligibleCount`, and `awaitingReviewCount` are all computed from the `jobs` array returned by `findForDashboard`, which is limited to `DEFAULT_JOBS_LIMIT = 50`:

```typescript
// dashboard/page.tsx:216-226
const scoredCount      = jobs.filter(j => j.aiScore !== null).length;
const notEligibleCount = jobs.filter(j => j.aiScore === null && j.keywordScore === null).length;
const awaitingReview   = jobs.filter(j => j.aiScore === null && j.keywordScore !== null).length;
const pendingCount     = notEligibleCount + awaitingReview;
```

Because `findForDashboard` sorts by `ai_score DESC nullsFirst: false`, the first page contains the highest-scored jobs. On a dataset with 300 total jobs and 80 AI-scored ones, the first 50 results are all scored, yielding `pendingCount = 0` — a misleading signal when 250 unscored jobs exist below the fold.

### Files Affected

| File | Change needed |
|---|---|
| `src/features/jobs/domain/JobRepository.ts` | New method: `countJobStats(roleSelectionId, filters, resumeVersion): Promise<JobStats>` |
| `src/features/jobs/infrastructure/SupabaseJobRepository.ts` | Implement `countJobStats` with three separate `COUNT` queries |
| `src/app/(protected)/dashboard/page.tsx:210-226` | Replace page-derived stats with `countJobStats` result |

### Proposed New Repository Method

```typescript
// New type in features/jobs/domain/types.ts
export interface JobStats {
  scoredCount: number;
  pendingCount: number;      // awaitingReview + notEligible
  awaitingReviewCount: number;
  notEligibleCount: number;
  total: number;
}

// New method on JobRepository interface
countJobStats(roleSelectionId: string, filters: JobFilters, resumeVersion: number): Promise<JobStats>;
```

The implementation runs three targeted `COUNT` queries against `job_scores` (no join on `jobs`):

```sql
-- Q1: scored (ai_score IS NOT NULL, scoped to role+version)
SELECT COUNT(DISTINCT job_id) FROM job_scores
WHERE role_selection_id = $1 AND resume_version = $2 AND ai_score IS NOT NULL;

-- Q2: awaiting review (keyword_score >= threshold, ai_score IS NULL)
-- (proxy: keyword_score IS NOT NULL AND ai_score IS NULL)
SELECT COUNT(DISTINCT job_id) FROM job_scores
WHERE role_selection_id = $1 AND resume_version = $2
  AND keyword_score IS NOT NULL AND ai_score IS NULL;

-- Q3: total active jobs matching role filter (reuse countMatchingExpandedRoles logic)
-- This count is already available; notEligible = total - scored - awaitingReview.
```

Alternatively, a single SQL aggregate using conditional `COUNT(CASE WHEN ...)` across joined tables. The three-query approach is simpler to express in PostgREST and easier to test.

**Note:** `notEligibleCount` cannot be directly queried from `job_scores` alone (it is the set of active jobs with *no* score row for the current role+version). The cleanest approach is: `notEligibleCount = total - scored - awaitingReview`. This requires `total` from `countMatchingExpandedRoles` (or a similar scoped count query).

### Schema Impact

None.

### API Impact

New `JobRepository.countJobStats()` method. All mock `JobRepository` implementations (test files) must add this method. Grep for `implements JobRepository` before implementing.

### Migration Requirements

None.

### Regression Risks

**Low.** The existing page-derived stats are replaced by the new dataset-level counts. The dashboard page makes one additional async call per render. Given that `countMatchingExpandedRoles` already runs in `Promise.all`, adding `countJobStats` increases the parallel query count by 1. No latency regression expected at single-user scale.

Risk: if `countJobStats` is slow (e.g., due to missing indexes), the stat line delays the entire `JobsSection`. Mitigated by running it in `Promise.all` alongside existing queries, and by the fact that `job_scores` already has `job_scores_role_selection_idx` on `role_selection_id`.

The stat line display text changes:
- **Before:** "50 jobs found, 50 scored by AI, 0 pending"  
- **After:** "50 jobs found (showing top 50), 80 scored by AI, 250 pending" — or similar wording that clarifies page vs. dataset scope.

This is a visible UX change that should be reviewed with the user before shipping.

### Verification Strategy

1. Navigate to `/dashboard` with a dataset of > 50 jobs.
2. Note `scoredCount` and `pendingCount` in the stat line.
3. Append `?limit=500` to the URL.
4. **Before fix:** stats change when limit changes. **After fix:** stats are identical regardless of limit.
5. Cross-check `scoredCount` against a direct `COUNT` query in the Supabase dashboard.
6. Confirm `scoredCount + pendingCount <= total` (pending = awaiting review + not eligible).

---

## Finding 5 — `matchingRoleCount` and page-level stats use mismatched scopes

### Root Cause

The stat line renders two numbers that describe different populations:

```typescript
// dashboard/page.tsx:212-213
const matchingRoleCount = await jobRepository.countMatchingExpandedRoles(expandedRoles);

// dashboard/page.tsx:216
const scoredCount = jobs.filter(j => j.aiScore !== null).length;  // page-scoped
```

`countMatchingExpandedRoles` counts **all active jobs matching role title**—no `role_selection_id`, no `resume_version`, no score filter. It is displayed immediately next to `scoredCount` and `pendingCount`, which are scoped to the current role selection, resume version, and page limit.

The rendered text at lines 233-239:

> "50 jobs found, 30 scored by AI, 20 pending. 500 jobs match 'Software Engineer' and are eligible for AI scoring under the current role selection."

This implies 500 is the denominator for 30 and 20, which is false.

### Files Affected

| File | Change needed |
|---|---|
| `src/app/(protected)/dashboard/page.tsx:233-239` | Reword the stat line to clearly separate the two scopes |

### Proposed Fix

No query changes. Only the display text needs to be clarified. Two options:

**Option A — Separate sentences:**
> "30 scored by AI, 20 pending (of 50 shown). 500 active jobs match 'Software Engineer'."

**Option B — Parenthetical clarification:**
> "50 jobs found, 30 scored by AI, 20 pending. Across all active jobs: 500 match 'Software Engineer'."

Option A is recommended. It makes the scoping explicit without requiring the user to parse a parenthetical.

After Finding 4 is implemented, the stat line can be simplified further:
> "Showing top 50 of 300 matching jobs. 80 scored by AI, 250 pending. 500 active jobs match 'Software Engineer'."

### Schema Impact

None.

### API Impact

None.

### Migration Requirements

None.

### Regression Risks

**Low.** UI copy change only. No logic or data change.

### Verification Strategy

1. Navigate to `/dashboard` with a dataset that has a visible `matchingRoleCount`.
2. Confirm the stat line text clearly distinguishes "currently shown" from "all active matching jobs".
3. Confirm the intent of each number is unambiguous without needing to read surrounding context.

---

## Cross-Cutting Concerns

### Quick Wins (no schema change, lowest risk)

These fixes can be applied independently and immediately without blocking on other work:

| Finding | Change | Files | Effort |
|---|---|---|---|
| F5 | Reword stat line | `dashboard/page.tsx` | < 1 hour |
| F3 | Conditional `!inner` join | `SupabaseJobRepository.ts` | ~2 hours |

### Schema Changes

| Finding | Migration | Backward Compatible |
|---|---|---|
| F2 | Add `resume_version INTEGER NOT NULL DEFAULT 0` to `digest_sessions` | Yes — DEFAULT 0 backfills existing rows |

### Breaking Changes

| Finding | What breaks | Mitigation |
|---|---|---|
| F2 | `DigestSessionRepository.save()` gains a required `resumeVersion` parameter | Exactly one caller (`sendDigestMvp.ts`); update it in the same commit |
| F4 | `JobRepository` gains `countJobStats()` | All mock implementations must add a stub; failing to update causes compile errors (caught by `tsc`) |

### Documents to Update

Per `CLAUDE.md` maintenance rules, the following design documents must be updated in the same commit as the relevant code changes:

| Finding | Documents |
|---|---|
| F2 (schema) | `design/erd.md`, `docs/database.md` — add `resume_version` to `digest_sessions` |
| F4 (new method) | `design/api-reference.md` — new `countJobStats` repo method |
| F1 + F2 (webhook fix) | `design/technical-design.md` — update webhook score fetch description |
| F3 (join change) | `design/technical-design.md` — document conditional join behaviour |
| All | `docs/investigations/worth-reviewing-analysis.md` — mark findings resolved as each is shipped |

### Rollout Strategy

All fixes are backend/server-side changes with no client-side state or edge-cache dependency. Standard rollout applies:

1. Apply `ALTER TABLE` migration via `supabase db push`.
2. Regenerate `supabase/database.types.ts`.
3. Deploy Next.js app (Vercel picks up the updated webhook route and dashboard page automatically).
4. Run `npx vitest run` and `npx tsc --noEmit` in CI before each merge.
5. Smoke test the Telegram pagination flow after deploying F1+F2.
6. No feature flags needed — all changes are correctness fixes behind existing feature gates (the `minAiScore` query param already controls F3; F4 is a stat replacement; F5 is copy).

### Test Coverage Requirements

Before any finding is marked done:

- `npx tsc --noEmit` clean
- `npx vitest run` green (including updated mocks for F2's `save()` signature and F4's new method)
- Relevant `SupabaseJobRepository.test.ts` and `SupabaseDigestSessionRepository.test.ts` cases updated or added
- No `any` introduced

---

## Non-Goals (Out of Scope for This Plan)

- **Finding 6** (hardcoded `"0.80"` deep-link strings) — tracked; low effort, zero risk. Implement as a trivial follow-up.
- **Finding 7** (`notifications_log` not scoped to `role_selection_id`) — product decision required before implementation.
- **Finding 8** (double `answerCallbackQuery` call) — no user impact; fix opportunistically during F1/F2 work.
- **Finding 9** (notification preferences transparency) — UX gap, not a correctness bug; deferred.
