# `findUnscored` Regression Fix

**Branch:** `fix/findUnscored-regression`
**Status:** Implemented and merged.

---

## Root Cause

`SupabaseJobRepository.findUnscored` used a two-query pattern:

1. Fetch all "done" job IDs from `job_scores` for the active `(role_selection_id, resume_version)`.
2. Fetch active candidate jobs with `NOT IN (done_ids)` as a URL query parameter.

The scoring-loop fix (`docs/fixes/scoring-loop-fix.md`) correctly expanded the "done" definition from `ai_score IS NOT NULL` to `ai_score IS NOT NULL OR keyword_score < threshold`. This moved every below-threshold job into the done set in a single pass. With ~401 jobs scored across normal scrape runs, the `NOT IN` list grew to:

```
401 × 36 chars (UUID) + 400 commas = 14,836 chars
```

Wrapped in `?id=not.in.(...)` and combined with the rest of the URL, the total request URI reached **~15 KB** — nearly double the 8 KB Supabase API gateway (nginx) limit per buffer. Every subsequent `score.ts` run returned a **414 URI Too Long**, causing the scoring step to fail consistently after ~10 seconds.

Scraping succeeded because `scrape.ts` does not use `findUnscored`. The failure was isolated to the score step.

---

## Implementation

Replaced the two-query pattern with a three-step approach that never places an unbounded list in a URL parameter.

### Before

```typescript
// Two queries — NOT IN list grows without bound as done set grows.
const { data: doneRows } = await this.client
  .from("job_scores")
  .select("job_id")
  .eq("role_selection_id", roleSelectionId)
  .eq("resume_version", resumeVersion)
  .or(`ai_score.not.is.null,keyword_score.lt.${keywordThreshold}`);
const doneIds = (doneRows ?? []).map((row) => row.job_id);

let query = this.client.from("jobs").select("*").eq("is_active", true).or(roleFilter);
if (doneIds.length > 0) {
  query = query.not("id", "in", `(${doneIds.join(",")})`);  // ← URL explosion
}
const { data, error } = await query;
```

### After

```typescript
// Query 1: done IDs — result in response body, not URL.
const { data: doneRows, error: doneError } = await this.client
  .from("job_scores")
  .select("job_id")
  .eq("role_selection_id", roleSelectionId)
  .eq("resume_version", resumeVersion)
  .or(`ai_score.not.is.null,keyword_score.lt.${keywordThreshold}`);
if (doneError) throw toAppError(doneError);
const doneIdSet = new Set((doneRows ?? []).map((row) => row.job_id));

// Query 2: candidate job IDs only — small URL regardless of done-set size.
const { data: candidateRows, error: candidateError } = await this.client
  .from("jobs")
  .select("id")
  .eq("is_active", true)
  .or(roleFilter);
if (candidateError) throw toAppError(candidateError);

// Set difference in memory.
const eligibleIds = (candidateRows ?? [])
  .map((row) => (row as { id: string }).id)
  .filter((id) => !doneIdSet.has(id));
if (eligibleIds.length === 0) return [];

// Query 3+: fetch full rows in bounded IN chunks (≤ 100 IDs → ≤ 3,700 chars per URL).
const CHUNK_SIZE = 100;
const jobs: Job[] = [];
for (let i = 0; i < eligibleIds.length; i += CHUNK_SIZE) {
  const chunk = eligibleIds.slice(i, i + CHUNK_SIZE);
  const { data, error } = await this.client.from("jobs").select("*").in("id", chunk);
  if (error) throw toAppError(error);
  jobs.push(...(data ?? []).map(toJob));
}
return jobs;
```

**URL size budget per request:**

| List | Location | Maximum size |
|---|---|---|
| Done IDs (401+) | response body of Query 1 | unbounded — not in URL |
| Candidate IDs | response body of Query 2 | unbounded — not in URL |
| Eligible chunk (≤ 100 UUIDs) | URL of Query 3 | ≤ 3,700 chars |

**Behaviors preserved:**

- **Scoring-loop fix** — Query 1's OR filter (`ai_score IS NOT NULL OR keyword_score < threshold`) is unchanged.
- **Retry behavior** — Jobs with `keyword_score >= threshold AND ai_score IS NULL` (genuine AI failures) are absent from `doneIdSet`, appear in `eligibleIds`, and are fetched and re-queued as before.
- **Resume-version scoping** — `resume_version` filter on Query 1 is unchanged; jobs scored against a prior resume version are not in `doneIdSet` for the new version.

---

## Files Changed

| File | Change |
|---|---|
| `src/features/jobs/infrastructure/SupabaseJobRepository.ts` | Replaced two-query NOT IN with three-step set-difference pattern in `findUnscored` |
| `src/features/jobs/infrastructure/SupabaseJobRepository.test.ts` | Updated 3 existing tests to match new three-query structure; added 3 new tests |
| `docs/fixes/scoring-loop-fix.md` | Added "Follow-up Regression and Resolution" section |
| `design/limitations.md` | Added §3.6 documenting the URL-size limit and its resolution |
| `docs/investigations/findUnscored-remediation.md` | Investigation report (pre-existing, from investigation phase) |

---

## Test Results

```
 Test Files  1 passed (1)
      Tests  25 passed (25)
   Duration  421ms
```

### New tests added

| Test | What it covers |
|---|---|
| `uses an OR filter to exclude fully-scored and keyword-skipped jobs via set difference` | Updated: asserts 3-builder flow, `select("id")` on candidates query, `in()` on chunk, no `not()` anywhere |
| `includes jobs with keyword_score >= threshold and ai_score IS NULL (AI failure retry)` | Updated: asserts retry-eligible job flows through 3-query path and is returned |
| `excludes done jobs via in-memory set difference without a NOT IN URL parameter` | New: 3 done IDs + 2 eligible candidates; asserts `not()` never called, `in()` receives only eligible IDs |
| `splits eligible IDs into multiple chunk queries when count exceeds CHUNK_SIZE` | New: 150 eligible IDs → 4 builders (done, candidates, chunk-1 of 100, chunk-2 of 50) |
| `returns an empty array and skips chunk queries when all candidates are already done` | New: all candidates in done set → 2 builders only (no chunk query fired) |

### Pre-existing failures (unrelated)

Five tests in unrelated files failed before and after this change:

- `src/features/companies/infrastructure/SupabaseCompanyRepository.test.ts` — 1 failure (error shape assertion mismatch)
- `src/features/insights/application/bucketScores.test.ts` — 4 failures (bucket boundary logic)

These failures exist on `main` and are not caused by this change.

---

## Rollback Plan

No schema changes were made. Rollback is a single-file revert:

```bash
git revert <commit-sha>
# or
git checkout main -- src/features/jobs/infrastructure/SupabaseJobRepository.ts
git checkout main -- src/features/jobs/infrastructure/SupabaseJobRepository.test.ts
git push origin fix/findUnscored-regression
```

No database migration, no Supabase deploy, no coordination required. The previous two-query implementation is fully restored.
