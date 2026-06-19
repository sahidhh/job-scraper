# Investigation Executive Summary

**Date:** 2026-06-19  
**Trigger:** Production pipeline run — 0 new jobs inserted, 80 jobs rescored, 74 notifications sent, multiple ATS 404s, Wellfound misconfigured.

---

## 1. Executive Summary

Three separate, independent root causes explain the observed production run. None is a regression; all are design gaps that become visible at scale.

| Symptom | Root Cause | Severity |
|---|---|---|
| 80 jobs rescored with 0 insertions | Below-keyword-gate jobs have `ai_score = NULL`, causing `findUnscored()` to re-select them every run | **High** — wastes pipeline on every run; costs money if threshold ever lowers |
| 74 notifications on 0 insertions | Notifications are score-triggered, not insert-triggered; 74 already-existing jobs crossed `ai_score >= 0.75` for the first time (legitimate first-fires) | **Medium** — not buggy today, but will become uncontrolled if resume versions change frequently |
| Multiple ATS 404s | Some board tokens are stale (Loom acquired by Atlassian, CRED uses `dreamplug` slug, etc.); Wellfound never configured | **Medium** — silent yield loss; 0 jobs/run from Wellfound |

All three are addressable with targeted fixes. None requires architectural changes.

---

## 2. Root Causes

### RC-1: Scoring — Below-Gate Jobs Requeue Indefinitely

**File:** `src/features/jobs/infrastructure/SupabaseJobRepository.ts:189-206`

`findUnscored()` excludes a job only if it has a `job_scores` row with `ai_score IS NOT NULL` for the current `(role_selection_id, resume_version)`. When a job's `keyword_score < KEYWORD_THRESHOLD` (0.25), `scoreJob.ts:44-54` skips the AI stage and writes a row with `ai_score = null`. On the next run, Step A of `findUnscored()` finds no `ai_score IS NOT NULL` rows for these jobs — they are re-queued. The upsert at `SupabaseScoreRepository.ts:11-23` (`ignoreDuplicates: false`) overwrites the row with identical data every run.

The design intent (per `ScoreRepository.ts:6-9` comment) was to retry jobs where the AI call failed transiently. The query conflates two states that are both `ai_score = null`:
- **Transient AI failure** (should retry): job passed keyword gate, AI returned null due to network error.
- **Permanently below gate** (should not retry): job never reaches AI; retrying changes nothing.

### RC-2: Notifications — Score State Drives Notifications, Not Insertion State

**File:** `src/features/notifications/infrastructure/SupabaseNotificationRepository.ts:37-66`

`findUnnotifiedMatches()` selects jobs that:
1. Have a `job_scores` row for the active `role_selection_id` with `ai_score >= NOTIFY_THRESHOLD` (0.75).
2. Have no entry in `notifications_log`.

The 74 notifications were genuine first-fires for jobs that either:
- Were previously below threshold (`ai_score = null` or `ai_score < 0.75`) and crossed threshold in this scoring run.
- Were never notified because they were freshly scored under a new `resume_version` and had no prior `notifications_log` entry.

The deduplication system (`UNIQUE(job_id)` on `notifications_log`, `ON CONFLICT DO NOTHING` in `markNotified()`) is **working correctly**. However, `notifications_log` is keyed only on `job_id` — no `role_selection_id`, no `resume_version`. This means:
- A job notified under role A is permanently locked from re-notification under role B.
- There is no record of which resume version, role, or score value triggered a notification.

The user's expectation ("0 insertions → 0 notifications") is incorrect. The system was designed to notify on score state, not insertion events.

### RC-3: Source Health — Wellfound Misconfigured, ATS Tokens Partially Stale

**Files:** `src/features/sources/infrastructure/wellfound/WellfoundScraper.ts:13-14, 28-51`, `.github/workflows/scrape.yml`

`WELLFOUND_FEED_URL` is not set in the workflow. Every run hits the `invalid_config` branch, logs `[wellfound] invalid configuration: WELLFOUND_FEED_URL not set`, and returns 0 jobs with `status = 'success'`. Neither `WELLFOUND_FEED_URL` nor `WELLFOUND_DISABLED` is configured.

For ATS board 404s: 34 companies are configured across Greenhouse (28), Lever (2), and Ashby (4). Known elevated-risk tokens:
- `Loom` → Ashby `loom` — Loom acquired by Atlassian; board likely retired.
- `CRED` → Ashby `dreamplug` — legal entity slug; may not match Ashby's published slug.
- Seed batch 2 migration (`20260617000002_seed_companies_batch2.sql`) explicitly notes to check for dead tokens after first scrape — this has not been actioned.

No live `scrape_runs` data exists in the repo. Real 404 count is unknown without running `npm run validate-sources` against production.

---

## 3. Evidence

| Claim | Evidence |
|---|---|
| 80 jobs have `ai_score = null` and rescore every run | `scoreJob.ts:44-54` (keyword gate); `SupabaseJobRepository.ts:189-206` (exclusion logic); `SupabaseScoreRepository.ts:11-23` (upsert overwrites) |
| `findUnscored` cannot distinguish AI failure from below-gate | `SupabaseJobRepository.ts:192` — only filters `ai_score IS NOT NULL`; no `keyword_score` filter |
| 74 notifications were first-time, not duplicate | `notifications_log` constraint at `20260612000002_tables.sql:98` — `UNIQUE(job_id)`; dedup confirmed correct at `SupabaseNotificationRepository.ts:50, 69-75` |
| Notifications triggered by score state, not insertion | `SupabaseNotificationRepository.ts:37-66` — no insertion date or `first_seen_at` filter in query |
| `notifications_log` has no `role_selection_id` | `20260612000002_tables.sql:91-99` — only `id`, `job_id`, `sent_at` |
| Wellfound contributes 0 jobs | `WellfoundScraper.ts:28-51` — `validateWellfoundConfig()` returns `invalid_config` when feed URL absent; `reports/post-merge-audit.md` finding N4 |
| ATS 404s are per-company and silently swallowed | `GreenhouseScraper.ts:66-70` — `try/catch` per company, `console.warn` + continue; source status still `success` |
| No `model` column in `job_scores` | `20260612000002_tables.sql:78-88`, `20260618000002_resume_versioning.sql` — confirmed absent; documented in `design/limitations.md §3.4` |
| `scored_at` not refreshed on re-score | `SupabaseScoreRepository.ts:10-24` — upsert payload omits `scored_at`; only `keyword_score`, `ai_score`, `ai_reasoning` supplied |
| `hasScore()` ignores `resume_version` | `SupabaseScoreRepository.ts:26-35` — query does not include `.eq("resume_version", ...)` |

---

## 4. Dependencies Between Findings

```
RC-1 (scoring loop) ──────────────────────────────────────────┐
  │                                                            │
  │ Jobs with ai_score=NULL below keyword gate rescore every run
  │                                                            │
  └──► RC-2 (notification burst)                              │
         │                                                     │
         │ Some below-gate jobs may have been upgraded by      │
         │ threshold change (0.50 → 0.25) or resume upload,   │
         │ crossing ai_score >= 0.75 for first time            │
         │                                                     │
         └──► 74 first-fire notifications                      │
                                                               │
RC-3 (source health) — independent                            │
  │                                                            │
  │ Dead ATS tokens reduce raw job count ingested             │
  │ → fewer candidates in scoring pool                        │
  │ → RC-1 pool is bounded by this                            │
  └──────────────────────────────────────────────────────────-┘

State model gaps (from state-model investigation):
  - Missing: notifications_log.role_selection_id (blocks re-notify on role change)
  - Missing: job_scores.model (blocks re-score detection on model change)
  - Missing: last_scored_at (limits observability)
  All of these are pre-conditions for future improvements but not required for RC-1/RC-2 fixes.
```

**Fix ordering dependency:** RC-1 (scoring loop fix) should precede any changes to notification logic, because reducing the rescore pool directly reduces unexpected notification bursts.

---

## 5. Recommended Fixes

### Fix 1 — Stop the scoring loop (targets RC-1)

**Change `findUnscored()` to exclude permanently-below-gate jobs.**

Option 3 from `scoring-lifecycle.md`: update the exclusion condition in `SupabaseJobRepository.ts:192` to also exclude jobs where `keyword_score IS NOT NULL AND keyword_score < :keywordThreshold`. This requires passing `keywordThreshold` into `findUnscored()`.

- Retains retry behavior for genuine AI failures (job passed keyword gate, `ai_score = null` due to network error).
- Excludes jobs that will never reach the AI stage regardless of retries.
- No schema migration required.

**Affected files:**
- `src/features/jobs/infrastructure/SupabaseJobRepository.ts` — add `keywordThreshold` param to `findUnscored()`
- `src/features/jobs/domain/JobRepository.ts` — update interface signature
- `scripts/score.ts` — pass `KEYWORD_THRESHOLD` into `findUnscored()` call

---

### Fix 2 — Suppress Wellfound config noise (targets RC-3)

**Add `WELLFOUND_DISABLED: "true"` to `.github/workflows/scrape.yml` env section.**

Eliminates the `[wellfound] invalid configuration` log noise on every run. Explicit signal that Wellfound is intentionally disabled. Per `docs/sources/wellfound.md §A`.

**Affected files:**
- `.github/workflows/scrape.yml`

---

### Fix 3 — Identify and deactivate dead ATS boards (targets RC-3)

**Run `npm run validate-sources` against production to generate the real 404 map, then deactivate dead companies.**

```bash
SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> npm run validate-sources
```

Priority checks: `loom` (Ashby), `dreamplug` (Ashby/CRED). Update `companies.active = false` for dead rows.

**Affected files:**
- Database only — no code changes.

---

### Fix 4 — Add context columns to `notifications_log` (targets RC-2 observability)

Add two nullable columns — backward compatible, no constraint change:

```sql
ALTER TABLE notifications_log ADD COLUMN role_selection_id uuid REFERENCES role_selections(id) ON DELETE SET NULL;
ALTER TABLE notifications_log ADD COLUMN ai_score_snapshot numeric(5,4);
```

Update `markNotified()` in `SupabaseNotificationRepository.ts:69-75` to accept and persist both values. This does not change deduplication semantics but makes the log queryable by role and preserves the score value at notification time.

**Affected files:**
- New migration in `supabase/migrations/`
- `src/features/notifications/infrastructure/SupabaseNotificationRepository.ts`
- `src/features/notifications/domain/types.ts` (if `NotificationLogEntry` type is updated)

---

### Fix 5 — Add `model` column to `job_scores` (targets state model gap)

```sql
ALTER TABLE job_scores ADD COLUMN model text;
```

Populate during stage-2 scoring in `scoreJob.ts`. No constraint change. Allows future detection of model-change invalidation.

**Affected files:**
- New migration in `supabase/migrations/`
- `src/features/scoring/application/scoreJob.ts`
- `src/features/scoring/domain/types.ts` (`NewJobScore`)
- `src/features/scoring/infrastructure/SupabaseScoreRepository.ts`

---

### Fix 6 — Fix `hasScore()` to filter by `resume_version` (targets state model gap)

Update `ScoreRepository.hasScore()` interface and `SupabaseScoreRepository` implementation to accept `resumeVersion: number` and filter by it. No migration. Prevents future callers from getting false positives for stale-resume rows.

**Affected files:**
- `src/features/scoring/domain/ScoreRepository.ts`
- `src/features/scoring/infrastructure/SupabaseScoreRepository.ts`
- Any test fixtures using `hasScore()`

---

## 6. Recommended Implementation Order

| Priority | Fix | Rationale |
|---|---|---|
| 1 | Fix 2 — Disable Wellfound | 5-minute change; removes log noise immediately |
| 2 | Fix 3 — Validate + deactivate dead ATS boards | Operational; no code change; recovers yield |
| 3 | Fix 1 — Stop scoring loop | Eliminates 80 wasted pipeline slots per run; must come before notification scoping |
| 4 | Fix 4 — Add context to `notifications_log` | Observability prerequisite for future notification scope changes |
| 5 | Fix 6 — Fix `hasScore()` | Low-risk code correctness fix; no migration |
| 6 | Fix 5 — Add `model` to `job_scores` | Medium-term; only urgent if model changes are planned |

---

## 7. Effort Estimates

| Fix | Effort | Migration? | Risk |
|---|---|---|---|
| Fix 2 — Wellfound disable | 15 min | No | None |
| Fix 3 — ATS validation | 30 min (run + review) | No (DB update only) | None |
| Fix 1 — Scoring loop | 2–3 hours | No | Low — requires interface/signature change across 3 files |
| Fix 4 — notifications_log columns | 2–3 hours | Yes (additive, backward compatible) | Low |
| Fix 6 — hasScore() signature | 1 hour | No | Low — callers must be updated |
| Fix 5 — job_scores.model | 2–3 hours | Yes (additive, backward compatible) | Low |

**Total estimated effort:** ~10–12 hours of engineering time.

---

## 8. Risk Assessment

### Low Risk (all recommended fixes)
All fixes are either configuration-only, additive schema changes (nullable columns, no constraint changes), or targeted query adjustments. No tables are dropped, no columns are renamed, no existing constraints are altered.

### Known Risks If Fixes Are NOT Applied

| Risk | Impact |
|---|---|
| RC-1 persists | Every 2-hour cron run wastes 80 score pipeline slots. If `KEYWORD_THRESHOLD` is ever lowered or a new model is used that produces AI scores for these jobs, costs will scale with the number of stuck-below-gate jobs. |
| RC-2 unaddressed | Next resume upload or threshold change will produce another burst of notifications for all existing qualifying jobs. Users will be confused ("I've already seen these jobs"). |
| RC-3 unaddressed | Silent yield loss from dead ATS boards on every run. No visibility into which companies are contributing 0 jobs. |
| `hasScore()` unfixed | Low risk today; becomes a silent re-scoring bug if future features route through that method. |
| `model` column absent | If `OPENROUTER_MODEL` changes, all existing scores appear valid. Dashboard will show scores from two different models without distinction. |

### No Breaking Changes Required
All root causes can be resolved without touching the data model in a destructive way, without re-architecting the pipeline, and without any backward-incompatible API or schema changes.

---

## 9. Investigation File Index

| Document | Scope |
|---|---|
| `docs/investigations/scoring-lifecycle.md` | Full scoring flow, eligibility query, rescore triggers, fix options |
| `docs/investigations/notification-flow.md` | Full notification flow, selection query, deduplication analysis, fix options |
| `docs/investigations/source-health.md` | All 34 companies, ATS mapping, Wellfound status, yield estimates, cleanup list |
| `docs/investigations/state-model.md` | Full schema (12 tables), existing/missing state tracking, risks, schema improvements |
