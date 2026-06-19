# `findUnscored` Regression — Investigation & Remediation

**Branch:** `fix/findUnscored-regression`
**Status:** Investigation complete; implementation pending approval.

---

## 1. Confirmed Root Cause

### How `findUnscored` works today

`SupabaseJobRepository.findUnscored` (`src/features/jobs/infrastructure/SupabaseJobRepository.ts:180–209`) uses a two-query pattern:

**Query 1 — fetch "done" IDs from `job_scores`:**

```sql
SELECT job_id FROM job_scores
WHERE role_selection_id = $roleSelectionId
  AND resume_version    = $resumeVersion
  AND (ai_score IS NOT NULL OR keyword_score < $threshold)
```

This returns every job that is already fully scored or intentionally skipped at the keyword gate.

**Query 2 — fetch active candidate jobs, excluding done IDs:**

```
POST /rest/v1/jobs?select=*&is_active=eq.true&<roleFilter>&id=not.in.(uuid1,uuid2,...,uuidN)
```

PostgREST encodes the exclusion list as a URL query parameter. With `N = 401` done IDs, that parameter alone is:

```
401 × 36 chars (UUID) + 400 commas = 14,836 chars
```

Including the `not.in.(...)` wrapper and the rest of the URL (role filter, `is_active`, endpoint path), the total request URI exceeds **15 KB**.

### Why it fails

Supabase routes API traffic through an API gateway (Kong/nginx). The nginx default `large_client_header_buffers` allocation is 4 × 8 KB — meaning any single header or URI component larger than **8 KB** is rejected with **414 URI Too Long**. At 15 KB the `not.in.(...)` parameter alone surpasses this limit. The ~10-second failure window is consistent with a gateway timeout waiting for a valid response that never arrives, or a slow 414 propagating back through the SDK.

### Why the scoring-loop fix triggered the regression

Before `docs/fixes/scoring-loop-fix.md`, the done-IDs query excluded only rows where `ai_score IS NOT NULL`. With a typical dataset of a few dozen fully AI-scored jobs, the `NOT IN` list was short (≤ 50 IDs, ~2 KB) — safely under the 8 KB limit.

The scoring-loop fix correctly expanded the exclusion to also include `keyword_score < threshold` rows (jobs intentionally skipped at the keyword gate). This is the right semantic change, but it moved every below-threshold job into the `doneIds` set in one pass. With ~401 jobs scored across a moderate number of scrape runs, the `NOT IN` list jumped from ~50 to ~401 entries and crossed the URL-size cliff.

### Measurement summary

| Metric | Value |
|---|---|
| `doneIds` count | ~401 |
| UUID size | 36 chars |
| Comma separators | 400 |
| `not.in.(...)` param value | ≈ 14,845 chars |
| Estimated total URL | ≈ 15.2 KB |
| Nginx single-buffer limit | 8 KB |
| Verdict | **414 URI Too Long** |

---

## 2. Options Evaluated

### Option A — Chunked `NOT IN`

Split `doneIds` into batches of ≤ 100 and run one `NOT IN` query per batch, then **intersect** results in JavaScript.

```
chunk 1: jobs NOT IN (ids 1–100)
chunk 2: jobs NOT IN (ids 101–200)
chunk 3: jobs NOT IN (ids 201–301)
chunk 4: jobs NOT IN (ids 302–401)
result  = intersection(chunk1, chunk2, chunk3, chunk4)
```

**Problems:**
- Four queries instead of two; latency multiplies with dataset growth.
- In-memory intersection is non-trivial to implement correctly (must use sets, not arrays).
- Still has a structural problem: as more jobs are scored the batch count grows unboundedly.
- More code surface area; harder to reason about correctness.

**Verdict:** Solves the immediate URL limit but poorly; complexity is disproportionate to the fix.

---

### Option B — NOT EXISTS via PostgREST filter DSL

Express the exclusion as a LEFT JOIN with a null check, which PostgREST can encode compactly:

```
jobs?select=*,job_scores!left(job_id)&is_active=eq.true&job_scores.job_id=is.null
```

**Problems:**
- PostgREST's embedded-filter DSL does not support `OR` conditions on the joined table
  (`ai_score IS NOT NULL OR keyword_score < threshold`). Only simple equality/null checks are
  supported without SQL.
- A LEFT JOIN null check only finds jobs with **no** `job_scores` row at all — it cannot
  distinguish "no row" from "row exists but both conditions false."
- Preserving the scoring-loop fix's OR predicate is impossible without custom SQL.

**Verdict:** Not viable for this predicate without moving to SQL.

---

### Option C — Server-side RPC

Add a Postgres function and replace both queries with `client.rpc()`:

```sql
CREATE OR REPLACE FUNCTION find_unscored_jobs(
  p_role_selection_id  uuid,
  p_expanded_roles     text[],
  p_resume_version     integer,
  p_keyword_threshold  numeric
) RETURNS SETOF jobs AS $$
  SELECT j.* FROM jobs j
  WHERE j.is_active = true
    AND EXISTS (
      SELECT 1 FROM unnest(p_expanded_roles) AS r(role)
      WHERE j.title       ILIKE '%' || r.role || '%'
         OR j.description ILIKE '%' || r.role || '%'
    )
    AND NOT EXISTS (
      SELECT 1 FROM job_scores js
      WHERE js.job_id            = j.id
        AND js.role_selection_id = p_role_selection_id
        AND js.resume_version    = p_resume_version
        AND (js.ai_score IS NOT NULL OR js.keyword_score < p_keyword_threshold)
    )
$$ LANGUAGE sql STABLE;
```

The TypeScript call becomes a single `client.rpc('find_unscored_jobs', { ... })`.

**Pros:**
- One round-trip; no URL size issue.
- Semantically cleaner; all logic visible in SQL.
- `STABLE` function enables query-plan caching.

**Cons:**
- Requires a new migration and RLS review.
- `ILIKE '%' || r.role || '%'` over `description` (unbounded text) may be slow without a
  full-text index — but this is the same predicate the current implementation sends, so it is
  not a regression.
- SQL function must be kept in sync with any future TypeScript logic changes.
- Harder to unit-test (requires a live Supabase instance or a migration-aware test harness).
- Migration rollback requires `DROP FUNCTION`, which must be coordinated with the TypeScript revert.

**Verdict:** Clean and performant, but introduces migration risk and couples the TypeScript interface to a SQL artifact.

---

### Option D — Client-side set difference with chunked `IN` (recommended)

Restructure `findUnscored` to never put a large list in the URL:

```
Query 1 (unchanged): fetch doneIds from job_scores using the OR filter
                      → response body, no URL size issue
Query 2 (new):       fetch only `id` from jobs WHERE is_active = true AND <roleFilter>
                      → roleFilter is ~350 chars; URL is small regardless of DB size
JS:                  eligibleIds = candidateIds.filter(id => !doneIdSet.has(id))
Query 3 (new, chunked): fetch full job rows WHERE id IN (chunk)
                         CHUNK_SIZE = 100 → each URL is ≤ 100 × 37 = 3,700 chars
```

Concrete implementation sketch (changes confined to `SupabaseJobRepository.ts`):

```typescript
async findUnscored(
  roleSelectionId: string,
  expandedRoles: string[],
  resumeVersion: number,
  keywordThreshold: number,
): Promise<Job[]> {
  const roleFilter = buildRoleFilter(expandedRoles);
  if (!roleFilter) return [];

  // Query 1: done IDs (unchanged — response body, not URL)
  const { data: doneRows, error: doneError } = await this.client
    .from("job_scores")
    .select("job_id")
    .eq("role_selection_id", roleSelectionId)
    .eq("resume_version", resumeVersion)
    .or(`ai_score.not.is.null,keyword_score.lt.${keywordThreshold}`);
  if (doneError) throw toAppError(doneError);
  const doneIdSet = new Set((doneRows ?? []).map((r) => r.job_id));

  // Query 2: candidate job IDs only (roleFilter is small; ID list stays in response body)
  const { data: candidateRows, error: candidateError } = await this.client
    .from("jobs")
    .select("id")
    .eq("is_active", true)
    .or(roleFilter);
  if (candidateError) throw toAppError(candidateError);

  const eligibleIds = (candidateRows ?? [])
    .map((r) => r.id)
    .filter((id) => !doneIdSet.has(id));
  if (eligibleIds.length === 0) return [];

  // Query 3: fetch full rows for eligible jobs, chunked to bound URL size
  const CHUNK_SIZE = 100;
  const jobs: Job[] = [];
  for (let i = 0; i < eligibleIds.length; i += CHUNK_SIZE) {
    const chunk = eligibleIds.slice(i, i + CHUNK_SIZE);
    const { data, error } = await this.client.from("jobs").select("*").in("id", chunk);
    if (error) throw toAppError(error);
    jobs.push(...(data ?? []).map(toJob));
  }
  return jobs;
}
```

**Why URL size is bounded under all future growth:**

| List | Location | Max size |
|---|---|---|
| doneIds (401+) | response body of Query 1 | unbounded; not in URL |
| candidateIds (job IDs) | response body of Query 2 | unbounded; not in URL |
| eligibleIds chunk (≤ 100 UUIDs) | URL of Query 3 | ≤ 3,700 chars |

**Pros:**
- Zero schema changes, zero migration.
- Change is contained to one TypeScript file.
- Rollback = `git revert` on the TS file — no database involvement.
- Exactly three bounded queries; no unbounded URL parameters anywhere.
- Follows the pattern already established by `findExistingKeys` in the same file.
- Query 1 and its scoring-loop-fix OR filter are preserved verbatim.
- Retry behavior (jobs with `keyword_score >= threshold AND ai_score IS NULL`) is preserved —
  those jobs are not in `doneIdSet`, so they appear in `eligibleIds` and are fetched.

**Cons:**
- Three queries instead of two (one additional round-trip to Supabase per `score.ts` run).
- If `eligibleIds` is large (e.g., fresh DB with 500 unscored jobs), Query 3 makes ⌈500/100⌉ = 5
  round-trips. In practice, after the initial scoring pass eligible counts are small.
- Candidate ID list (`candidateRows`) is held in memory briefly; at single-user scale this is
  negligible (IDs only, ≈ 36 bytes each).

---

## 3. Recommendation

**Option D — client-side set difference with chunked `IN`.**

It is the smallest safe change for this production context:

1. **Preserves all scoring-loop-fix semantics** — the `doneIds` query and its OR filter are
   copied verbatim from the current implementation.
2. **Preserves retry behavior** — jobs with `keyword_score >= threshold AND ai_score IS NULL`
   remain absent from `doneIdSet` and are returned as eligible.
3. **Zero migration risk** — no SQL objects added or changed; no Supabase deploy step required.
4. **Trivial rollback** — revert one TypeScript file; no database state to unwind.
5. **Bounded URL size forever** — chunks of 100 IDs cap Query 3's URL well under 8 KB even as
   the job database grows to thousands of entries.
6. **Precedent in the codebase** — `findExistingKeys` uses the same fetch-IDs-then-chunk-fetch
   pattern for upsert accounting.

Option C (RPC) is a valid future improvement for performance if `score.ts` latency ever becomes
the bottleneck, but it introduces migration risk that is disproportionate to the immediate need.

---

## 4. Implementation Complexity

| Step | Effort |
|---|---|
| Modify `SupabaseJobRepository.findUnscored` | ~25 lines changed |
| Update `SupabaseJobRepository.test.ts` to cover the 3-query path | ~30 lines added |
| No domain, application, or infrastructure additions | — |
| No migration, no RLS change | — |
| **Total** | ~55 lines, one file (+ tests) |

---

## 5. Rollback Plan

Because Option D makes no schema changes, rollback is a single-step git operation:

```bash
git revert <commit-sha>   # or git checkout main -- src/features/jobs/infrastructure/SupabaseJobRepository.ts
git push origin fix/findUnscored-regression
```

No database migration, no Supabase deploy, no coordination required. The previous two-query
implementation is fully restored and the database state is unchanged.

If Option C (RPC) were chosen instead, rollback would require an additional migration:

```sql
DROP FUNCTION IF EXISTS find_unscored_jobs(uuid, text[], integer, numeric);
```

applied before or alongside the TypeScript revert.

---

## 6. Documents Affected on Implementation

Per `CLAUDE.md` Document Maintenance Rules, when this fix is implemented:

| Document | Change required |
|---|---|
| `design/limitations.md` | Add §3.6: URL-size limit on `NOT IN` lists; note resolved by Option D |
| `docs/fixes/scoring-loop-fix.md` | Add a note that the fix introduced a URL-size regression addressed here |

No other design documents are affected (no new feature, no data model change, no API route change).
