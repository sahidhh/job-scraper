# findUnscored() Failure Analysis

**Date:** 2026-06-19  
**Branch:** `claude/stoic-ramanujan-06by6d`  
**Affected runs:** 27820141336 (10:24 UTC), 27824597455 (12:04 UTC)  
**Reference commit (scoring-loop fix):** 7a7aef8 (merged in b26b879)

---

## 1. Observed Failure

Both failing runs show an identical pattern:

```
[score] fatal error: Error: TypeError: fetch failed
    at toAppError (src/shared/infrastructure/supabaseError.ts:23:22)
    at SupabaseJobRepository.findUnscored (src/features/jobs/infrastructure/SupabaseJobRepository.ts:207:22)
    at async main (scripts/score.ts:39:16)
```

| Run | Status | Score step start | Error timestamp | Elapsed |
|---|---|---|---|---|
| 27820141336 | failure | 10:25:44.485Z | 10:25:55.645Z | ~11.2 s |
| 27824597455 | failure | 12:23:19.427Z | 12:23:29.665Z | ~10.2 s |
| 27814485365 | **success** | 08:25:16Z | — | ~6 min 46 s |

All three runs are on commit b26b879 (runs 1–2) or its immediate successor d111380 (run 3). Run 27814485365 was the **first** score run after the fix was merged. Runs 27820141336 and 27824597455 are the **second and third** runs on the same code.

---

## 2. Error Classification

`TypeError: fetch failed` is a **Node.js network-level error**, not a PostgREST or Postgres error. It is thrown by undici (the HTTP client backing Node.js's native `fetch` in v22) when the TCP connection fails, is reset, or times out before an HTTP response is received.

`toAppError` (line 23) wraps it because the Supabase client surfaces network errors as a plain object with a `message` field rather than an `Error` instance:

```typescript
// supabaseError.ts:21-23
if (typeof e === "object" && e !== null) {
  const text = extractText(e as Record<string, unknown>);
  if (text) return new Error(text);  // ← line 23
```

The original `error.cause` (the undici-level error containing the underlying TCP reason) is discarded. Without it, the exact sub-cause (connection reset, `connectTimeout`, `headersTimeout`, server-sent 414, etc.) cannot be determined from these logs alone.

---

## 3. Failure Location: The Second Query in findUnscored

`SupabaseJobRepository.ts:207` is:

```typescript
// line 205-207
const { data, error } = await query;      // ← line 205: jobs query
if (error) throw toAppError(error);        // ← line 206
return (data ?? []).map(toJob);            // ← line 207  ← stack points here
```

The error is thrown at line 206 from the `jobs` query, not from the earlier `job_scores` query. Line 207 is the `return` statement; the stack frame resolves to it because the throw happens inside the same async function scope. The `job_scores` query (lines 191–197) completed successfully — it populated `doneIds` before the failure.

The failing query is:

```typescript
let query = this.client
  .from("jobs")
  .select("*")
  .eq("is_active", true)
  .or(roleFilter);                                   // ← ilike on title + description
if (doneIds.length > 0) {
  query = query.not("id", "in", `(${doneIds.join(",")})`);  // ← NOT IN (N UUIDs)
}
const { data, error } = await query;                 // ← throws here
```

---

## 4. Generated SQL (Approximate)

PostgREST translates this to a `GET` request. The URL query string is:

```
select=*
&is_active=eq.true
&or=(title.ilike.%25<role1>%25,description.ilike.%25<role1>%25,title.ilike.%25<role2>%25,...,description.ilike.%25<roleN>%25)
&id=not.in.(<uuid1>,<uuid2>,...,<uuidK>)
```

Which maps to the SQL:

```sql
SELECT *
FROM   jobs
WHERE  is_active = true
  AND  (   title       ILIKE '%role1%'
        OR description ILIKE '%role1%'
        OR title       ILIKE '%role2%'
        OR description ILIKE '%role2%'
        ... )
  AND  id NOT IN (uuid1, uuid2, ..., uuidK);
```

---

## 5. Before vs. After the Scoring-Loop Fix

### Before (commit prior to 7a7aef8)

```typescript
// job_scores exclusion query
.not("ai_score", "is", null);

// excluded: only jobs with ai_score IS NOT NULL
// doneIds size: only fully AI-scored jobs
```

`findUnscored` returned all jobs with `ai_score IS NULL`, including keyword-gated jobs. Those 87 keyword-gated jobs were re-queued on every run (the original infinite-loop bug). The `NOT IN` list never grew to include keyword-gated jobs — it only ever contained the ai-scored subset.

### After (commit 7a7aef8)

```typescript
// job_scores exclusion query
.or(`ai_score.not.is.null,keyword_score.lt.${keywordThreshold}`);

// excluded: ai_score IS NOT NULL  OR  keyword_score < threshold
// doneIds size: fully scored + keyword-gated
```

On the **first** run after the fix (run 27814485365):

- `job_scores` has zero rows for the current `(role_selection_id, resume_version)`.
- `doneIds` is **empty**.
- No `NOT IN` clause is added to the jobs query.
- `findUnscored` returns 425 jobs; scoring succeeds.

After that run completes:

- 87 jobs are below the keyword gate (`keyword_score < 0.25, ai_score = null`).
- 24 jobs are genuine AI failures (`keyword_score >= 0.25, ai_score = null`).
- 314 jobs are fully scored (`ai_score IS NOT NULL`).
- `job_scores` now has 425 rows.

On the **second** run (run 27820141336):

- The `job_scores` query (first query) matches all rows where `ai_score IS NOT NULL OR keyword_score < 0.25`.
- That is: 314 fully scored + 87 keyword-gated = **401 rows**.
- `doneIds` = 401 UUIDs.
- The `NOT IN (401 UUIDs)` clause is appended to the jobs query.
- The URL query string grows by ~14,814 characters (`id=not.in.(` + 401 × 36 chars + 400 commas + `)`).

This jump from 0 to 401 UUIDs in a single run is the **direct trigger**. The fix correctly solved the infinite-loop bug but simultaneously caused `doneIds` to grow from 0 to a large list immediately after the first successful run.

---

## 6. Query Performance Analysis

### jobs table indexes

| Index | Column(s) | Type | Usable for this query? |
|---|---|---|---|
| `jobs_is_active_idx` | `is_active` | B-tree | Marginal: boolean, low cardinality — planner may reject for seq scan |
| `jobs_location_tags_idx` | `location_tags` | GIN | Not used (no location filter in findUnscored) |
| `jobs_posted_at_idx` | `posted_at DESC` | B-tree | Not used (no ORDER BY or posted_at filter) |
| `jobs_first_seen_idx` | `first_seen_at DESC` | B-tree | Not used |

**No index on `title` or `description`.** Both `ilike %...%` patterns require a full sequential scan of the jobs table — no index can satisfy them.

### job_scores table indexes

| Index | Column(s) | Usable for the first query? |
|---|---|---|
| `job_scores_role_selection_idx` | `role_selection_id` | Yes — narrows to rows for the active selection |
| `job_scores_ai_score_idx` | `ai_score DESC NULLS LAST` | Not used for OR condition |
| *(none)* | `resume_version` | Not indexed — filtered in memory after role_selection scan |
| *(none)* | `keyword_score` | Not indexed — OR condition evaluated in memory |

No composite index on `(role_selection_id, resume_version)` exists. After the `job_scores_role_selection_idx` narrows the scan, the planner must apply `resume_version = ?` and the OR condition as residual filters. For a small table this is acceptable; it does not cause the failure.

### URL length

| Component | Approximate size |
|---|---|
| Base URL + select + is_active | ~80 chars |
| `or=(roleFilter)` with N expanded roles | ~50 × N chars |
| `id=not.in.(401 UUIDs)` | ~14,814 chars |
| **Total (N = 8 roles)** | **~15,300 chars** |

The standard nginx `large_client_header_buffers` limit is 4 × 8 KB. The HTTP request line (which includes the full URL) must fit within a single 8 KB buffer. A 15 KB URL query string would likely exceed this limit. Supabase's API gateway configuration is not publicly documented, but behaviour consistent with a rejected oversized URL (connection reset without a complete HTTP response) matches the observed `TypeError: fetch failed`.

### SELECT * with description column

`SELECT *` returns all columns including `description` (TEXT, unconstrained size). Job descriptions can be thousands of characters each. For 425 matched jobs, the response payload would be substantial. However, because the error fires at the HTTP level before a response is received, response payload size is not the direct cause.

---

## 7. Evidence Ruling Out Other Categories

| Category | Evidence against |
|---|---|
| **B – Supabase connectivity** | The scrape step in both failing runs makes dozens of successful Supabase requests (upserts, select queries) immediately before score starts. Supabase is reachable. The error is isolated to one specific query in score.ts. |
| **Transient network failure** | The error fires at ~10 s in both runs with near-identical timing. A transient network event would not reproduce at the same elapsed time in two independent runs. |
| **Wrong credentials** | Scrape uses the same `SUPABASE_SERVICE_ROLE_KEY` and succeeds. |
| **TypeScript compilation error** | score.ts runs for ~10 s before failing, which means the module loaded and multiple code paths executed successfully (resume lookup, role lookup succeeded). |

---

## 8. Proposed Diagnostic Logging (Temporary — Do Not Merge)

The following changes to `findUnscored` would capture the information needed to distinguish between the hypotheses (URL limit, statement timeout, connection reset) on the next run.

```typescript
async findUnscored(
  roleSelectionId: string,
  expandedRoles: string[],
  resumeVersion: number,
  keywordThreshold: number,
): Promise<Job[]> {
  const roleFilter = buildRoleFilter(expandedRoles);
  if (!roleFilter) return [];

  // --- DIAGNOSTIC START ---
  console.log("[findUnscored] roleFilter length:", roleFilter.length);
  // --- DIAGNOSTIC END ---

  const { data: doneRows, error: scoredError } = await this.client
    .from("job_scores")
    .select("job_id")
    .eq("role_selection_id", roleSelectionId)
    .eq("resume_version", resumeVersion)
    .or(`ai_score.not.is.null,keyword_score.lt.${keywordThreshold}`);
  if (scoredError) throw toAppError(scoredError);

  const doneIds = (doneRows ?? []).map((row) => row.job_id);

  // --- DIAGNOSTIC START ---
  const estimatedUrlBytes =
    "select=*&is_active=eq.true&or=(".length +
    roleFilter.length +
    ")&id=not.in.(".length +
    doneIds.length * 37 +
    ")".length;
  console.log("[findUnscored] doneIds.length:", doneIds.length);
  console.log("[findUnscored] estimated URL query string bytes:", estimatedUrlBytes);
  // --- DIAGNOSTIC END ---

  let query = this.client.from("jobs").select("*").eq("is_active", true).or(roleFilter);
  if (doneIds.length > 0) {
    query = query.not("id", "in", `(${doneIds.join(",")})`);
  }

  // --- DIAGNOSTIC START ---
  const t0 = Date.now();
  // --- DIAGNOSTIC END ---

  const { data, error } = await query;

  // --- DIAGNOSTIC START ---
  const elapsed = Date.now() - t0;
  if (error) {
    console.error("[findUnscored] jobs query FAILED after", elapsed, "ms");
    console.error("[findUnscored] error object:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
    // error.cause is not on the plain object from supabase-js; check the raw value
    const rawCause = (error as unknown as { cause?: unknown }).cause;
    if (rawCause) {
      console.error("[findUnscored] error.cause:", JSON.stringify(rawCause, Object.getOwnPropertyNames(rawCause as object)));
    }
    const statusCode = (error as unknown as { status?: number }).status;
    if (statusCode !== undefined) {
      console.error("[findUnscored] HTTP status:", statusCode);
    }
  } else {
    console.log("[findUnscored] jobs query OK after", elapsed, "ms, rows:", (data ?? []).length);
  }
  // --- DIAGNOSTIC END ---

  if (error) throw toAppError(error);
  return (data ?? []).map(toJob);
}
```

**What each diagnostic captures:**

| Log line | Distinguishes |
|---|---|
| `roleFilter length` | Confirms roleFilter contribution to URL size |
| `doneIds.length` | Confirms how many UUIDs are in the NOT IN clause |
| `estimated URL query string bytes` | Confirms whether the URL exceeds nginx/gateway limits (~8 KB) |
| `elapsed ms` before error | Distinguishes statement timeout (~8–10 s on Supabase free) from connection reset (near-instant or at TCP timeout) |
| `error object` (full JSON) | May include HTTP status code or additional Supabase fields not captured by toAppError |
| `error.cause` | The undici-level error: `ConnectTimeoutError`, `HeadersTimeoutError`, `SocketError` (connection reset), etc. |
| `HTTP status` | If the server sent a 414 or 408 before closing, this field would be set |

---

## 9. Conclusion

### Root Cause Classification

**Primary: D — Regression from scoring-loop change**

The scoring-loop fix causes `doneIds` to grow from 0 to 401 UUIDs in a single run by correctly classifying all 87 keyword-gated jobs as "done". Previously those jobs were never added to `doneIds` (the infinite-loop bug kept them in the re-queue). After the first successful scoring run under the new code, the `NOT IN (401 UUIDs)` clause is appended to the jobs query on every subsequent run.

**Contributing: A — Query performance issue**

The `jobs` query uses `SELECT *` (returns large `description` TEXT), `ilike %...%` on `description` (no full-text index, forces sequential scan), and appends a `NOT IN (401 UUIDs)` clause that inflates the URL query string to approximately 15 KB. There is no partial index on `is_active` that would be selective enough to bound the scan.

**Contributing: C — Missing index issue**

No full-text or trigram index on `jobs.title` or `jobs.description` means all `ilike` patterns require full sequential scans. No composite index on `job_scores (role_selection_id, resume_version)` means the first query filters `resume_version` in memory.

### Unresolved Until Diagnostics Run

The exact mechanism producing `TypeError: fetch failed` cannot be confirmed without `error.cause`. The two remaining hypotheses are:

1. **URL length overflow**: the 15 KB query string exceeds the Supabase API gateway's request-line buffer limit (~8 KB nginx default), causing a connection close without an HTTP response.
2. **Statement timeout**: the `ilike %...%` + `NOT IN` query exceeds Supabase's free-tier statement timeout (~8–10 s), causing Postgres to kill the query; PostgREST drops the connection rather than returning a structured error, which Node.js `fetch` surfaces as `TypeError: fetch failed`.

The consistent ~10 s elapsed time before failure is consistent with both hypotheses (nginx timeout AND Postgres statement timeout are both commonly set to 8–10 s on free-tier Supabase).

### What Did Not Cause the Failure

- Supabase connectivity (scrape succeeds immediately before)
- The `job_scores` OR filter (first query completes; error is on the second query)
- Missing `KEYWORD_THRESHOLD` env var (resolves to default 0.25 via `optionalEnv`)
- Code in `toAppError` (correctly wraps the plain error object; the wrapped message is the symptom, not the cause)
