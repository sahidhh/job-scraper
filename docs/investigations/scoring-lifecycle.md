# Scoring Lifecycle Investigation

**Question:** Why do 80 jobs repeatedly enter the scoring pipeline in a run where 0 new jobs were inserted?

---

## Current Flow (step-by-step)

1. **`scripts/score.ts:21`** — loads the active `resume` (with `resume.version`).
2. **`scripts/score.ts:27`** — loads the active `role_selection` (with `roleSelection.id` and `roleSelection.expandedRoles`).
3. **`scripts/score.ts:39`** — calls `jobRepository.findUnscored(roleSelection.id, roleSelection.expandedRoles, resume.version)`.
4. **`src/features/jobs/infrastructure/SupabaseJobRepository.ts:189-206`** — `findUnscored`:
   - Step A: queries `job_scores` for rows where `role_selection_id = roleSelection.id` AND `resume_version = resume.version` AND `ai_score IS NOT NULL`. This is the "fully scored" exclusion set.
   - Step B: queries all active `jobs` matching the expanded role filter, then **excludes** only the IDs found in Step A.
   - Returns every active role-matching job that is NOT in the Step-A exclusion set.
5. **`scripts/score.ts:45-73`** — iterates returned jobs, calls `scoreJob()` for each.
6. **`src/features/scoring/application/scoreJob.ts:30-54`** — computes keyword score, optionally calls AI, then calls `scoreRepository.insertScore(score)`.
7. **`src/features/scoring/infrastructure/SupabaseScoreRepository.ts:11-23`** — upserts into `job_scores` on conflict key `(job_id, role_selection_id, resume_version)` with `ignoreDuplicates: false` (always overwrites).

---

## Eligibility Rules

**Exact query that selects jobs to score** — `SupabaseJobRepository.ts:189-206`:

```typescript
// Step A: collect fully-scored IDs
const { data: aiScored } = await this.client
  .from("job_scores")
  .select("job_id")
  .eq("role_selection_id", roleSelectionId)
  .eq("resume_version", resumeVersion)
  .not("ai_score", "is", null);          // only rows where ai_score IS NOT NULL

// Step B: all active jobs matching role filter, minus the above
let query = this.client.from("jobs").select("*").eq("is_active", true).or(roleFilter);
if (aiScoredIds.length > 0) {
  query = query.not("id", "in", `(${aiScoredIds.join(",")})`);
}
```

**A job is excluded from scoring if and only if:**
- There exists a `job_scores` row with matching `(job_id, role_selection_id, resume_version)` **AND** `ai_score IS NOT NULL`.

**A job remains eligible for scoring if:**
- It has no `job_scores` row at all for the current `(role_selection_id, resume_version)`, OR
- It has a row but `ai_score IS NULL` (keyword-only, below the keyword threshold gate), OR
- Its existing score rows are for a different `resume_version`.

---

## Rescore Triggers

There are three paths that cause a job to be rescored on a subsequent run:

### 1. `ai_score IS NULL` (primary trigger — the 80-job case)

When a job's keyword score falls below `KEYWORD_THRESHOLD` (default 0.25), `scoreJob` saves a row with `ai_score = null` (`scoreJob.ts:33`, `scoreJob.ts:44-51`). On the next run, `findUnscored` does **not** exclude this job because the Step-A exclusion only filters rows where `ai_score IS NOT NULL`. The job re-enters the pipeline every single run. The upsert at `SupabaseScoreRepository.ts:11` (`ignoreDuplicates: false`) overwrites the existing row with identical data — keyword score, null ai_score — producing zero net change while consuming the full scoring pipeline slot.

### 2. Resume version change

When a new resume is uploaded, `resume.version` increments (`20260618000002_resume_versioning.sql:59`). All existing `job_scores` rows have the old `resume_version`. Step A finds no matching rows for the new version, so all active role-matching jobs re-enter scoring. This is intentional design.

### 3. Role selection change

When a new role selection is created (`set_active_role_selection` function, `20260612000004_functions.sql:37-57`), the new `role_selection_id` has no `job_scores` rows, so all matching jobs score from scratch. This is intentional design.

---

## Root Cause Analysis

**The 80 jobs are permanently stuck below the keyword gate.**

The sequence is:
1. Scrape run finds 80 jobs (or they were previously inserted). 0 new jobs this run.
2. Score run calls `findUnscored` — the 80 jobs are returned because their existing `job_scores` rows have `ai_score = null`.
3. `scoreJob` runs for each: keyword score < 0.25, so AI stage is skipped, and a row is upserted with `ai_score = null` (`scoreJob.ts:44-54`, `SupabaseScoreRepository.ts:11-23`).
4. On the next run, Step A in `findUnscored` still finds no rows with `ai_score IS NOT NULL` for these 80 jobs, so they are returned again.
5. Repeat indefinitely.

The design intent (per `ScoreRepository.ts:6-9` comment) was that `ignoreDuplicates: false` allows retry of jobs where the **AI call failed** (network error, timeout). But this retry logic conflates two distinct cases:
- **AI failure** (transient): job passed keyword gate, AI call returned null — retrying is correct.
- **Below keyword gate** (permanent): job will never reach the AI stage regardless of retries.

There is no differentiation between these two cases in the eligibility query. Both are represented as `ai_score IS NULL` and both are re-queued every run.

**Quantified waste:** 80 jobs × every cron run (every 2h per `technical-design.md §5`) = 80 wasted pipeline slots per run. The keyword stage is cheap (pure JS), but the upsert write still executes for all 80. If the keyword threshold were ever lowered further or scoring logic changed, these 80 could also start triggering AI calls — at whatever cost-per-call the OpenRouter model charges — once per 2-hour cycle, indefinitely.

---

## Recommended Fix Options

### Option 1: Add a `below_gate` sentinel state (most precise)

Introduce a separate flag or status in `job_scores` (e.g., a boolean `below_keyword_gate boolean not null default false`) and exclude jobs with `below_keyword_gate = true` from `findUnscored` unless the resume or role changes. Requires a migration and a schema change.

### Option 2: Treat keyword-only scores as fully scored (simplest fix)

Change the `findUnscored` exclusion condition from `ai_score IS NOT NULL` to `keyword_score IS NOT NULL`. Any job that has been scored at all — keyword-only or AI — is excluded from re-queuing. The cost: jobs that genuinely failed the AI call (transient network error, not below gate) would also stop being retried. This eliminates the retry-on-AI-failure behavior documented in `ScoreRepository.ts:6-9`.

### Option 3: Differentiate AI failure from below-gate in the query

Change `findUnscored` to exclude jobs where `ai_score IS NOT NULL OR keyword_score < :threshold`. Jobs that passed the keyword gate but failed the AI call (keyword_score >= threshold, ai_score IS NULL) still get retried. Jobs below the gate (keyword_score < threshold) are excluded. Requires passing `keywordThreshold` into `findUnscored`. No schema migration needed.

### Option 4: Cap rescoring with a `scored_at` recency check

Exclude jobs scored within the last N hours regardless of `ai_score`. This limits churn without changing eligibility semantics. Weakness: it is time-based, not state-based — a below-gate job still rescores every N hours instead of every 2 hours, just less frequently.

### Option 5: Mark jobs as permanently ineligible via a new `ineligible_reason` column

Add `ineligible_reason text` to `job_scores`. When keyword score falls below gate, write `ineligible_reason = 'below_keyword_gate'`. `findUnscored` excludes rows with any non-null `ineligible_reason`. Future ineligibility reasons (e.g. expired role match) can reuse the same column. More general than Option 1 but requires a migration.

---

**Recommendation:** Option 3 is the lowest-risk, zero-migration fix that preserves the intended AI-retry behavior while eliminating the permanent rescore loop for below-gate jobs.
