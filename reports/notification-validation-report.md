# Notification Pipeline — Live Database Validation

Queried via PostgREST (service role) against the live Supabase instance referenced in `.env`. No code modified.

---

## Q1. How many rows exist in `notifications_log`?

**Finding:** `0` rows.

**Evidence:**
```
GET /rest/v1/notifications_log?select=id  -> []
content-range: */0
```

**Confidence:** High (direct count, `Prefer: count=exact`).

**Impact:** The Phase-1 root-cause candidate ("notifications_log permanently suppresses re-sending") is **disproven by data**. There is nothing in `notifications_log` to suppress anything — condition 3 of `findUnnotifiedMatches` (`notifications_log.length === 0`) is trivially true for every row.

---

## Q2. Which job_ids exist in `notifications_log`?

**Finding:** None — table is empty (see Q1).

**Confidence:** High.

**Impact:** N/A.

---

## Q3. Do they correspond to the 75/66/50/43/42/40 jobs?

**Finding:** N/A directly (no rows) — but the 75/66/50/43/42/40 figures themselves are **not `ai_score`**. They are `job_scores.keyword_score` (stage-1), not `job_scores.ai_score` (stage-2, the column `findUnnotifiedMatches` filters on.

**Evidence** — `job_scores` for the active role selection (`role_selection_id = 0f84d299-44c3-4119-926a-b3bf6f7d8c9c`), ordered by `keyword_score desc`:

| job_id | keyword_score | ai_score |
|---|---|---|
| 58f53353… | 0.7500 | **null** |
| c5e134a1… | 0.6667 | **null** |
| 6674e892… | 0.5000 | **null** |
| 91d40587… | 0.4286 | **null** |
| f25d1fb3… | 0.4286 | **null** |
| 2b695c31… | 0.4000 | **null** |
| 558b9824… | 0.3333 | **null** |
| 02e7ef40… | 0.2500 | **null** |
| 22301b58… | 0.2000 | **null** |
| (9 more) | 0.0000 | **null** |

Total job_scores rows for this role_selection_id: **18/18, all `ai_score IS NULL`**.

`0.7500 → "75%"`, `0.6667 → "66%"`, `0.5000 → "50%"`, `0.4286 → "43%"/"42%"`, `0.4000 → "40%"` — these match the dashboard percentages exactly. **The dashboard is displaying `keyword_score`, not `ai_score`.**

**Confidence:** High (full table dump, single role selection in the system).

**Impact:** The dashboard percentages the user has been reading as "AI match scores" are stage-1 keyword scores. The actual gating column for notifications (`ai_score`) has **no non-null value anywhere in the database**.

---

## Q4. Is the active `role_selection_id` the same one used when scores were written?

**Finding:** Yes — and it's the **only** role selection that has ever existed.

**Evidence:**
```
role_selections: [{ id: "0f84d299-44c3-4119-926a-b3bf6f7d8c9c", primary_role: "developer", is_active: true, created_at: "2026-06-14T10:20:05Z" }]
```
Single row. All 18 `job_scores` rows reference this same `role_selection_id`. `scored_at` timestamps (17:25 and 18:00 UTC) are after `role_selections.created_at` (10:20 UTC) — consistent with `[score] scoring 0 unscored job(s)` (these rows were written in earlier runs, none are new).

**Confidence:** High.

**Impact:** Role-selection linkage is correct. The query's `.eq("job_scores.role_selection_id", roleSelectionId)` matches all 18 rows — this is not a contributing factor.

---

## Q5. Would `findUnnotifiedMatches` currently return zero rows?

**Finding:** **Yes — guaranteed zero, at any `NOTIFY_THRESHOLD` value > would-be-negative.**

**Confidence:** High.

---

## Q6. Prove exactly why.

**Finding — ROOT CAUSE:**

```sql
select ... from jobs
  join job_scores  -- !inner
    on job_scores.job_id = jobs.id
   and job_scores.role_selection_id = :roleSelectionId
   and job_scores.ai_score >= :threshold
  left join notifications_log on notifications_log.job_id = jobs.id
```

- All 18 `job_scores` rows for the active role selection have `ai_score = NULL`.
- SQL `NULL >= :threshold` evaluates to `NULL` (not `true`), for **any** value of `:threshold` — `0.2`, `0.75`, even `0`.
- `job_scores!inner` therefore matches **zero** rows for **every** job, regardless of `keyword_score` or `NOTIFY_THRESHOLD`.
- `findUnnotifiedMatches` returns `[]` before the `notifications_log` filter is even relevant.
- `sendNotification` receives `matches = []`, loop body never executes, `sent = 0`.
- `TelegramBotSender.sendMessage` is never called (consistent with "no Telegram messages received").

**Evidence:** Direct query results above — `0/18` rows with non-null `ai_score`; `notifications_log` empty (rules out the alternative explanation entirely).

**Impact:** `[notify] sent 0 notification(s)` is **fully and exactly explained** by `ai_score IS NULL` on every `job_scores` row. `NOTIFY_THRESHOLD=0.2` vs `0.75` makes **no difference** — neither value, nor any value in `[0,1]`, can make `NULL >= x` true. The previous investigation's `notifications_log` hypothesis is ruled out by direct evidence (table is empty).

**Open question (out of notification-pipeline scope):** *why* is `ai_score` null for all 18 rows, including the 3 rows with `keyword_score >= 0.5` (0.75, 0.6667, 0.5000) that `scoring.md`'s cost-bound rule says should have triggered an AI call? Candidates: AI provider call failing/erroring every time (`OpenRouterAiScoreProvider`), missing `OPENROUTER_*` config, or `KEYWORD_THRESHOLD` evaluation excluding them. This is a **scoring-pipeline** question, not a notification-pipeline question — `scoreJob`/`OpenRouterAiScoreProvider` were not inspected per task scope.

---

## Summary

| Question | Answer |
|---|---|
| notifications_log rows | 0 |
| job_ids in notifications_log | none |
| Do 75/66/50/43/42/40 correspond to ai_score? | No — they are `keyword_score`; `ai_score` is null for all 18 rows |
| role_selection_id linkage correct? | Yes, single role selection, all scores reference it |
| findUnnotifiedMatches returns zero? | Yes, guaranteed |
| Why? | `job_scores!inner ... ai_score >= threshold` can never match `NULL` ai_score — true for all 18 rows at any threshold |
