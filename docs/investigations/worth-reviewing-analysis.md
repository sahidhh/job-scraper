# Worth Reviewing — Inconsistency Investigation

**Date:** 2026-06-22  
**Scope:** Read-only analysis. No code changes recommended in this document.

---

## Executive Summary

The "Worth Reviewing" feature has **nine confirmed inconsistencies** across four distinct
surfaces: the Telegram digest button count, the webhook pagination display, the dashboard
stat line, and the dashboard deep-link navigation. The two highest-severity issues are:

1. **The webhook score query ignores `resume_version`**, so after a resume upload the
   "Worth Reviewing" pagination can show scores from a stale prior version — different
   numbers than what appeared in the digest that triggered the tap.

2. **The dashboard `minAiScore` filter uses a left-join that does not exclude
   low-score jobs**, so the "Dashboard" deep link from Telegram (`?minScore=0.80`)
   silently shows *all* active jobs, with sub-threshold jobs appearing as "pending/unscored"
   and inflating the pending count.

Both are structural mismatches introduced by cross-cutting features (resume versioning,
digest pagination) that were not fully propagated to every consumer.

---

## Current Flow

```
1. scripts/score.ts — scoring cron
   ├── getActive() → resume (version N)
   ├── getActiveSelection() → role_selection_id (X)
   ├── findUnscored(X, expandedRoles, N, KEYWORD_THRESHOLD)
   │     └── excludes jobs with ai_score IS NOT NULL
   │           or keyword_score < KEYWORD_THRESHOLD
   │           for (role_selection_id=X, resume_version=N)
   └── scoreJob() → upsert job_scores
         unique key: (job_id, role_selection_id, resume_version)

2. scripts/notify.ts — notification cron
   ├── getActive() → resume (version N)
   ├── getActiveSelection() → role_selection_id (X)
   ├── NOTIFY_THRESHOLD (default 0.75, env-driven)
   ├── findUnnotifiedMatches(X, 0.75, N)
   │     └── jobs WHERE ai_score >= 0.75
   │               AND role_selection_id = X
   │               AND resume_version = N
   │               AND NOT in notifications_log
   │     → returned as raw matches; then filtered by preferences
   ├── bandMatches(matches, STRONG_MATCH_THRESHOLD=0.8)
   │     strong:         ai_score >= 0.8
   │     worthReviewing: ai_score <  0.8 (still >= NOTIFY_THRESHOLD)
   ├── formatDigestMvp() + buildDigestKeyboard()
   ├── telegramSender.sendMessageWithButtons()
   ├── markNotified(jobId) for ALL matches (both bands)
   └── digestSessionRepository.save(X, worthReviewingJobIds)
         stores only role_selection_id + job IDs

3. Telegram webhook — route.ts (POST /api/telegram/webhook)
   ├── validates X-Telegram-Bot-Api-Secret-Token
   ├── parses callback_data "wr:N" (page N)
   ├── sessionRepo.getLatest() → latest digest_session
   ├── fetches job_scores for session.worthReviewingJobIds
   │     WHERE role_selection_id = session.roleSelectionId
   │     *** NO resume_version filter ***
   ├── takes job_scores[0].ai_score (arbitrary if multiple versions)
   ├── sorts descending, paginates PAGE_SIZE=5
   └── sends/edits Telegram message

4. Dashboard — /dashboard
   ├── findForDashboard(roleSelectionId, effectiveFilters, limit, resumeVersion)
   │     job_scores!left join (preserves all active jobs)
   │     filters role_selection_id AND resume_version on the embed
   │     minAiScore filter also only narrows the embed, not the parent row
   └── stats computed from page result (≤ DEFAULT_JOBS_LIMIT=50 jobs)
```

---

## Data Flow Mapping

| Stage | Role Selection Scope | Resume Version Scope | Threshold |
|---|---|---|---|
| `findUnscored` | `role_selection_id` param | `resume_version` param | `KEYWORD_THRESHOLD` env (0.25) |
| `findUnnotifiedMatches` | `role_selection_id` param | `resume_version` param | `NOTIFY_THRESHOLD` env (0.75) |
| `bandMatches` | n/a | n/a | `STRONG_MATCH_THRESHOLD` = 0.8 (constant) |
| `digest_sessions.save` | stores `role_selection_id` | **not stored** | n/a |
| Webhook job fetch | `session.roleSelectionId` | **missing** | n/a |
| `findForDashboard` | `role_selection_id` param | `resume_version` param | optional `minAiScore` filter |
| `countMatchingExpandedRoles` | role title match only | **not scoped** | none |
| Dashboard stat line | page result only | page result only | none |

---

## Count Calculations

### Notification digest counts

`sendDigestMvp.ts:55-58` — `bandMatches()` splits the post-filter `matches` array:

```
strongCount         = matches where aiScore >= 0.8
worthReviewingCount = matches where aiScore <  0.8  (all are >= NOTIFY_THRESHOLD by construction)
```

Both counts reflect the **post-preferences-filter** result set. If `NotificationPreferences`
filter is active, jobs excluded by it are not counted anywhere in the digest.

### Dashboard stat line

`dashboard/page.tsx:216-226`:

```typescript
const scoredCount      = jobs.filter(j => j.aiScore !== null).length;
const notEligibleCount = jobs.filter(j => j.aiScore === null && j.keywordScore === null).length;
const awaitingReview   = jobs.filter(j => j.aiScore === null && j.keywordScore !== null).length;
const pendingCount     = notEligibleCount + awaitingReview;
```

`jobs` here is the result of `findForDashboard` — limited to **`DEFAULT_JOBS_LIMIT = 50`**
by default. Stats are page-scoped, not dataset-scoped.

The `matchingRoleCount` on the same line comes from `countMatchingExpandedRoles`, which
counts ALL active jobs matching the role title with no score or version scope.

---

## Query Analysis

### `findUnnotifiedMatches` (SupabaseNotificationRepository.ts:37-68)

```sql
SELECT jobs.*, job_scores!inner(...), notifications_log(id)
FROM jobs
WHERE job_scores.role_selection_id = $roleSelectionId
  AND job_scores.resume_version    = $resumeVersion
  AND job_scores.ai_score         >= $threshold
```

- `job_scores!inner` — correctly excludes jobs with no qualifying score row.
- `notifications_log(id)` — left join; unnotified = empty array. Filtered in JS (line 51).
- `notifications_log` has no `role_selection_id` column. Filter is global across all roles.

### Webhook score fetch (route.ts:69-74)

```javascript
client.from("jobs")
  .select("id, title, company_name, url, job_scores!inner(ai_score)")
  .in("id", session.worthReviewingJobIds)
  .eq("job_scores.role_selection_id", session.roleSelectionId)
  // resume_version filter: absent
```

- No `resume_version` filter → all score rows for that role_selection_id match.
- `job_scores[0]?.ai_score` — order is not guaranteed by PostgREST for `!inner` + `.in()`.
- After a resume upload, a job scored under multiple versions has multiple rows; `[0]`
  may be from any version.

### `findForDashboard` (SupabaseJobRepository.ts:244-294)

```javascript
.from("jobs")
.select("... job_scores!left(...) ...")   // LEFT join
.eq("job_scores.role_selection_id", roleSelectionId)
.eq("job_scores.resume_version", resumeVersion)
// optional:
.gte("job_scores.ai_score", filters.minAiScore)  // narrows embed, NOT parent row
.order("ai_score", { ..., foreignTable: "job_scores" })
.limit(limit + 1)
```

PostgREST behavior with `!left`:
- Filters on the embedded resource narrow which rows appear in the embed array.
- They do **not** drop the parent row if no embedded rows match.
- Result: ALL active jobs appear. Jobs without a qualifying score have `job_scores: []`
  → mapped to `aiScore: null`, `keywordScore: null`.

### `countMatchingExpandedRoles` (SupabaseJobRepository.ts:231-242)

```javascript
.from("jobs")
.select("id", { count: "exact", head: true })
.eq("is_active", true)
.or(roleFilter)
// no role_selection_id, no resume_version, no score filter
```

This counts all role-title-matching active jobs regardless of scoring status or resume
version. It is displayed alongside page-scoped `scoredCount`/`pendingCount` in the same
stat line.

---

## Deduplication Review

### Job deduplication (`dedupeJobs.ts`)

Key: `${source}:${sourceJobId}`. Implemented via `Map` — last write wins on duplicate key
while Map insertion order preserves first-occurrence position. Correct as documented.

**No cross-source deduplication.** Two sources ingesting the same position would create two
`jobs` rows (different `source` values) and two independent `job_scores` rows. These would
both appear in `findUnnotifiedMatches` and in the digest. Count inflation is possible
if the same position appears on both Greenhouse and Wellfound, for example.

### Notification deduplication (`notifications_log`)

`markNotified`: `upsert(job_id, ..., { onConflict: "job_id", ignoreDuplicates: true })`.

- Unique constraint: `UNIQUE (job_id)` — no `role_selection_id`.
- Once a job is notified for role A, it is permanently suppressed for all future roles.
- `findUnnotifiedMatches` embeds `notifications_log(id)` without a role scope, so the
  cross-role suppression applies unconditionally.

### Digest session deduplication

No deduplication: every digest run appends a new `digest_sessions` row. `getLatest()`
returns the most recent one. Old sessions remain in the DB.

---

## Threshold Review

| Threshold | Value | Source | Consumers |
|---|---|---|---|
| `KEYWORD_THRESHOLD` | 0.25 (default) | env var | `score.ts`, `findUnscored` |
| `NOTIFY_THRESHOLD` | 0.75 (default) | env var | `notify.ts` → `findUnnotifiedMatches` |
| `STRONG_MATCH_THRESHOLD` | 0.8 | constant (`types.ts:10`) | `bandMatches`, `sendDigestMvp` |
| Dashboard "Worth Reviewing" deep-link | `"0.80"` (string literal) | hardcoded string | `scripts/notify.ts:52` |
| Webhook "Dashboard" button | `"0.80"` (string literal) | hardcoded string | `route.ts:139` |
| Dashboard badge "success" | 0.75 | hardcoded in `JobRow.tsx:14` | UI badge color |

The `NOTIFY_THRESHOLD` (env) and the dashboard badge threshold (`0.75`) are numerically
identical today, but they are defined independently. Changing the env var does not update
the badge logic.

The deep-link strings `"0.80"` in two files duplicate `STRONG_MATCH_THRESHOLD` without
importing it.

---

## Findings

### Finding 1 — Webhook drops `resume_version` from score fetch

**Evidence:**  
`route.ts:69-74` — `job_scores!inner(ai_score)` with only
`.eq("job_scores.role_selection_id", ...)`. No `.eq("job_scores.resume_version", ...)`.  
`20260618000002_resume_versioning.sql:40` — unique key is now
`(job_id, role_selection_id, resume_version)`, so a job can have multiple score rows.  
`route.ts:87` — `j.job_scores[0]?.ai_score ?? 0` — array order not defined for `!inner` + `.in()`.

**Impact:**  
After any resume upload, the Worth Reviewing pagination tap can display a score from a
prior version — contradicting the score shown in the original Telegram digest message.
Jobs may appear in a different rank order than expected. The fallback `?? 0` would display
`0%` for any job whose current-version score row is not `[0]`.

**Confidence:** High

---

### Finding 2 — `digest_sessions` does not store `resume_version`

**Evidence:**  
`20260621000001_digest_sessions.sql` — table definition has `role_selection_id` but no
`resume_version`.  
`SupabaseDigestSessionRepository.ts:9-17` — `save()` inserts only `role_selection_id`
and `worth_reviewing_job_ids`.  
`sendDigestMvp.ts:72-77` — call to `digestSessionRepository.save` passes only
`roleSelectionId` and the job ID list.

**Impact:**  
A session created under resume version N is indistinguishable from one created under
version N+1. After a resume upload and re-score, the webhook retrieves the stored job IDs
and tries to show scores for them — but without knowing which version they were banded
under, it cannot correctly scope the query (see Finding 1).

**Confidence:** High

---

### Finding 3 — Dashboard `minAiScore` filter with `!left` join does not exclude jobs

**Evidence:**  
`SupabaseJobRepository.ts:37` — `DASHBOARD_SELECT` uses `job_scores!left(...)`.  
`SupabaseJobRepository.ts:267-269`:
```typescript
if (filters.minAiScore !== undefined) {
  query = query.gte("job_scores.ai_score", filters.minAiScore);
}
```
PostgREST semantics: filters on a `!left`-joined embed narrow the embedded array but do
not exclude the parent row. All active jobs are returned; those without a qualifying score
have `job_scores: []` → `toDashboardJob` maps them to `aiScore: null, keywordScore: null`.

`scripts/notify.ts:52` — Dashboard deep-link from Telegram: `?minScore=0.80`.

**Impact:**  
When the user taps the "📊 Dashboard" button from a Telegram digest, they are navigated to
`/dashboard?minScore=0.80` expecting to see only strong matches. Instead, all active jobs
are shown. Jobs scored below 0.80 appear as `aiScore: null` (visually "pending/unscored").
The `pendingCount` is inflated by all below-threshold already-scored jobs. `scoredCount`
shows only the strong-match count. The stat line becomes misleading:
> "50 jobs found, 8 scored by AI, 42 pending"
when in reality 42 of those are scored but below the threshold.

**Confidence:** High

---

### Finding 4 — Dashboard stats computed on the current page, not the full dataset

**Evidence:**  
`dashboard/page.tsx:216-226` — `scoredCount`, `pendingCount`, `notEligibleCount`,
`awaitingReviewCount` all computed from `jobs`, which is `findForDashboard()`'s result.  
`dashboard/page.tsx:18-19` — `DEFAULT_JOBS_LIMIT = 50`, `MAX_JOBS_LIMIT = 500`.  
`dashboard/page.tsx:233-234` — The stat line displays `jobs.length` (the page size) as
"N jobs found" alongside these derived stats.

**Impact:**  
The first page of 50 results is sorted by `ai_score desc nullsFirst: false`, so the top-50
scored jobs appear first. On a dataset with 300 total jobs and 80 AI-scored ones, the first
page shows 50 scored jobs with `pendingCount = 0`. The user reads "50 jobs found, 50
scored by AI, 0 pending" when there are actually 250 unscored jobs below the fold.
Clicking "Load more" to 100 would suddenly surface 30 unscored jobs, changing the counts.

**Confidence:** High

---

### Finding 5 — `matchingRoleCount` and page-level stats use mismatched scopes

**Evidence:**  
`dashboard/page.tsx:212-213` — `countMatchingExpandedRoles(expandedRoles)` — counts all
active jobs matching role title; no `role_selection_id`, no `resume_version`, no scoring
status filter.  
`dashboard/page.tsx:216` — `scoredCount` from the 50-job page result scoped to the current
`role_selection_id` and `resume_version`.  
Both are rendered in the same `<p>` at line 233-239.

**Impact:**  
The stat line displays three numbers with incompatible scopes:
> "50 jobs found, 30 scored by AI, 20 pending. 500 jobs match 'Software Engineer' and are
> eligible for AI scoring"
- "50 found" = current page (role+version filtered, limited)
- "500 eligible" = all role-title-matching active jobs (no version, no score filter)
These cannot be compared meaningfully, but their proximity implies they describe the same
population.

**Confidence:** High

---

### Finding 6 — Dashboard deep-link threshold hardcoded in two places

**Evidence:**  
`types.ts:10` — `export const STRONG_MATCH_THRESHOLD = 0.8;`  
`scripts/notify.ts:52` — `` `${appUrl}/dashboard?minScore=0.80` ``  
`route.ts:139` — `` `${appUrl}/dashboard?minScore=0.80` ``

**Impact:**  
Neither file imports `STRONG_MATCH_THRESHOLD`. If the constant is changed, the deep links
will be stale. This is currently a latent risk; if `STRONG_MATCH_THRESHOLD` becomes
configurable (e.g., env-driven), the mismatch would silently manifest as the Dashboard
button showing a different population than "strong matches".

**Confidence:** High

---

### Finding 7 — `notifications_log` not scoped to `role_selection_id`

**Evidence:**  
`database.md §2` — `notifications_log` schema: `UNIQUE (job_id)`, no `role_selection_id`.  
`SupabaseNotificationRepository.ts:73` — `onConflict: "job_id", ignoreDuplicates: true`.  
`SupabaseNotificationRepository.ts:41` — `notifications_log(id)` embedded with no
additional filter — matches any notification for the job, regardless of role.

**Impact:**  
When a user changes roles, all jobs previously notified for role A are permanently
suppressed for role B. `findUnnotifiedMatches` will return 0 results for such jobs even if
they are equally relevant to the new role. The Worth Reviewing count in future digests
will undercount newly-relevant jobs that happened to have been notified previously.

**Confidence:** High

---

### Finding 8 — Double `answerCallbackQuery` call in webhook

**Evidence:**  
`route.ts:58` — `await answerCallbackQuery(cq.id)` — intended for immediate response.  
`route.ts:98` — `await answerCallbackQuery(cq.id)` — called again after all DB work.

**Impact:**  
Telegram allows answering a callback query only once. The second call returns an error
("query is too old and response timeout expired") that is silently swallowed. No
user-visible impact, but each callback tap fires one unnecessary failing API request.

**Confidence:** High

---

### Finding 9 — Notification preferences filter reduces counts without transparency

**Evidence:**  
`sendDigestMvp.ts:51-52` — `filterMatches(rawMatches, preferences)` applied after DB fetch.  
`formatDigestMvp.ts:16-17` — digest shows `worthReviewingCount` from post-filter result.  
`buildDigestKeyboard.ts:43-44` — button shows post-filter count.

**Impact:**  
If a user has location or skill preferences set, jobs excluded by those filters are not
counted in the digest totals or the Worth Reviewing button label. There is no indication of
how many jobs were excluded. The user cannot distinguish "0 worth-reviewing because none
scored well" from "0 worth-reviewing because all were filtered out by preferences". This
is a UX transparency gap, not a correctness bug.

**Confidence:** Medium

---

## Root Cause Candidates

### 1. Most Likely — Resume versioning propagated incompletely

The resume versioning feature (`20260618000002`) correctly updated `findUnnotifiedMatches`,
`findForDashboard`, and `findUnscored` to scope queries by `resume_version`. However, the
webhook route and the `digest_sessions` table were added *after* resume versioning (digest
sessions migration: `20260621000001`, three days later). The webhook was written without
the version filter, and the sessions table was designed without a `resume_version` column.

This produces **Findings 1 and 2**: inconsistent scores in webhook pagination.

### 2. Likely — PostgREST left-join filter semantics misunderstood for `minAiScore`

The `!left` join was chosen for `findForDashboard` so that unscored jobs are visible on
the dashboard. The `minAiScore` filter was then added to support deep-link navigation
without switching to `!inner`. In PostgREST, filters on embedded resources with `!left`
narrow the embed but do not exclude the parent row — the job stays in the result with
an empty `job_scores` array. This behavior is documented but non-obvious.

This produces **Finding 3**: all jobs visible on the strong-match deep-link.

### 3. Possible — Dashboard stats were designed for a single-page dataset

The `scoredCount`/`pendingCount` pattern was likely correct when the total job count was
small enough to fit on one page. As the dataset grew beyond 50 jobs, the stats became
misleading because they were never elevated to dataset-level aggregates. The same applies
to the `matchingRoleCount` scope mismatch (Finding 5).

This produces **Findings 4 and 5**: misleading stat line.

---

## Verification Recommendations

To confirm the above findings in a live environment before acting on them:

1. **Finding 1/2 (webhook version mismatch):** Upload a second resume after an existing
   digest session exists. Tap "Worth Reviewing" and compare displayed scores to the scores
   in the original digest message. If they differ, Finding 1 is confirmed live.

2. **Finding 3 (left-join minAiScore):** Navigate to `/dashboard?minScore=0.80`. Count
   visible jobs. Then remove the filter. If total count is higher and the newly-visible
   jobs all have `aiScore: null`, confirm they actually have `ai_score` rows below 0.80 in
   `job_scores` — this confirms the filter is not excluding them.

3. **Finding 4 (page-scoped stats):** Navigate to `/dashboard` with more than 50 total
   jobs. Note `pendingCount`. Then append `?limit=500`. If `pendingCount` increases, the
   first-page stat was incomplete.

4. **Finding 7 (cross-role notification suppression):** Change the active role selection,
   then run the notify cron. Verify `findUnnotifiedMatches` returns 0 for jobs that were
   previously notified under the old role even if they score above NOTIFY_THRESHOLD for
   the new role.

---

## Suggested Fix Strategy

High level only. No implementation in this document.

### Fix 1 — Add `resume_version` to webhook score query

In `route.ts`, the session must carry (or the webhook must look up) the `resume_version`
used when the digest was created. Two sub-options:
- **(a)** Add `resume_version` column to `digest_sessions`; populate it in `sendDigestMvp`;
  pass it as a filter in the webhook's `job_scores` query. This is the minimal, targeted fix.
- **(b)** Alternatively, store the scores themselves (not just job IDs) in the session,
  avoiding the second fetch entirely.

### Fix 2 — Switch `findForDashboard` to `!inner` when `minAiScore` is set

When `filters.minAiScore` is defined, change the join type to `job_scores!inner`. This
would cause jobs without a qualifying score to be excluded, matching user expectation from
the deep-link. When no minAiScore is set, retain `!left` so unscored jobs remain visible.
This may require conditional select string construction.

### Fix 3 — Elevate dashboard stats to dataset-level aggregates

Compute `scoredCount`, `pendingCount`, etc. with a dedicated count query (not from the
page result). The counts should not be computed from the truncated `jobs` page. Alternatively,
add an explicit caveat in the stat line ("showing top 50 of N jobs").

### Fix 4 — Derive deep-link threshold from `STRONG_MATCH_THRESHOLD`

Import `STRONG_MATCH_THRESHOLD` in `scripts/notify.ts` and `route.ts`; replace the string
literals `"0.80"` with the constant. This is a low-effort, low-risk consistency fix.

### Fix 5 — Scope `notifications_log` to `role_selection_id` (optional)

Whether to implement this depends on product intent: should switching roles allow
re-notification of previously-seen jobs? If yes, add `role_selection_id` to
`notifications_log` and update the unique constraint to `(job_id, role_selection_id)`.
If no (current behavior is intentional), document it explicitly.
