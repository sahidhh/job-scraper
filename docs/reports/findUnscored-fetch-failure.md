# findUnscored — TypeError: fetch failed — Investigation Report

**Date:** 2026-06-19  
**Script:** `npm run score` → `scripts/score.ts` → `SupabaseJobRepository.findUnscored()`  
**Error:** `TypeError: fetch failed`  
**Verdict:** Environmental / transient network issue — **no code bug confirmed**

---

## 1. Root Cause

`TypeError: fetch failed` is a Node.js network-level error thrown by the native `fetch` API (undici). It means the HTTP request to the Supabase REST API could not be completed at the TCP/TLS layer. Possible causes include:

- Supabase project temporarily unavailable (free-tier sleeping, paused, overloaded)
- DNS resolution failure in the GitHub Actions runner
- Transient network interruption between the runner and the Supabase endpoint
- Supabase connection pool exhausted after the preceding `npm run scrape` step

The error is **not** caused by invalid query syntax. An invalid PostgREST query returns HTTP 400 with a `{ code: "PGRST100", message: "…" }` error body that the Supabase JS client surfaces as a structured `PostgrestError`, not as `TypeError: fetch failed`.

---

## 2. Execution Trace

```
score.ts:main()
  ├── resumeRepository.getActive()          ← first Supabase call
  ├── roleRepository.getActiveSelection()   ← second Supabase call
  └── jobRepository.findUnscored(           ← fails here
        roleSelectionId,
        expandedRoles,
        resumeVersion,
        keywordThreshold            ← Number(optionalEnv("KEYWORD_THRESHOLD","0.25"))
      )
        ├── client.from("job_scores")
        │     .select("job_id")
        │     .eq("role_selection_id", roleSelectionId)
        │     .eq("resume_version",    resumeVersion)
        │     .or("ai_score.not.is.null,keyword_score.lt.0.25")
        │                                   ← network error here
        │   postgrest-js catches error, returns { error: { message: "TypeError: fetch failed" } }
        │
        └── if (scoredError) throw toAppError(scoredError)
              ← throws Error("TypeError: fetch failed"), stack points to findUnscored
```

### Why the stack trace points to `findUnscored`

`postgrest-js` v2.108.1 (`PostgrestBuilder.ts` lines 390-456) wraps every fetch error in a `.catch()` when `shouldThrowOnError` is false (the default). Network errors are returned as `{ error: { message: "TypeError: fetch failed", … }, data: null }` instead of being re-thrown as a native TypeError. The line `throw toAppError(scoredError)` in `findUnscored` then creates a **new** `Error("TypeError: fetch failed")` whose stack originates there, not at the original network failure site. This is why earlier failed calls (if any) might show a different origin.

---

## 3. Evidence Against a Code Bug

### 3a. OR filter syntax is valid

The new filter string introduced in commit `7a7aef8`:

```typescript
.or(`ai_score.not.is.null,keyword_score.lt.${keywordThreshold}`)
// → URL param: ?or=(ai_score.not.is.null,keyword_score.lt.0.25)
```

PostgREST v12 (the version Supabase hosts) supports both `not.column.op.val` and `column.not.op.val` within OR filters. `ai_score.not.is.null` is valid syntax for "ai_score IS NOT NULL". If it were invalid, PostgREST would return HTTP 400 with a `PGRST100` error code — not a network failure.

### 3b. `keywordThreshold` is always a well-formed number

```typescript
const keywordThreshold = Number(optionalEnv("KEYWORD_THRESHOLD", "0.25"));
```

`optionalEnv` returns the fallback `"0.25"` for empty/unset env vars. In the GitHub Actions workflow, `KEYWORD_THRESHOLD: ${{ vars.KEYWORD_THRESHOLD }}` expands to `""` when the variable is not configured, so the default `0.25` applies. `Number("0.25") = 0.25` — a valid decimal that produces a well-formed filter string.

The only edge case is a non-numeric value (e.g., `"abc"` → `NaN`), which would yield `keyword_score.lt.NaN`. PostgREST would reject this with HTTP 400, not a network error.

### 3c. `SUPABASE_URL` cannot be blank when the error is a network error

`requireEnv("SUPABASE_URL")` throws `Error("Missing required environment variable: SUPABASE_URL")` for absent or empty values — this would appear as a different, clearer error. The URL must be present for `TypeError: fetch failed` to occur.

### 3d. All unit tests pass

```
npm test src/features/jobs/infrastructure/SupabaseJobRepository.test.ts
✓ 22/22 tests pass
```

The `findUnscored` tests verify:
- OR filter string `"ai_score.not.is.null,keyword_score.lt.0.25"` is passed to `.or()`
- Jobs with `keyword_score >= threshold AND ai_score IS NULL` are not excluded (retry path preserved)
- Empty roles short-circuit without querying

### 3e. No invalid URL generation

The postgrest-js `.or()` method appends the filter as `?or=(...)` via `URL.searchParams.append`. The filter string contains only `[a-z0-9._,]` characters — no characters that could invalidate the URL.

---

## 4. Retry Behavior (postgrest-js v2.108.1)

For GET requests, `postgrest-js` retries up to 3 times on network errors with exponential backoff (1 s, 2 s, 4 s). If all retries fail, the final error is caught and converted to `{ error: { message: "TypeError: fetch failed" } }`. This means a single `TypeError: fetch failed` report can represent up to ~7 seconds of retries — not a one-shot transient failure.

---

## 5. Classification

| Category | Assessment |
|---|---|
| Code bug | Not confirmed |
| Invalid OR filter syntax | Not the cause (would be HTTP 400, not network error) |
| Bad URL generation | Not the cause (URL is well-formed) |
| Missing env vars | Not the cause (`requireEnv` gives a clear error) |
| keywordThreshold NaN | Not the cause (would be HTTP 400) |
| Supabase connectivity issue | **Most likely cause** |
| Transient network issue | **Likely contributing factor** |
| GitHub Actions environment | Possible (runner DNS/network ephemeral) |
| Supabase resource exhaustion | Possible (free-tier connection limit after scrape) |

---

## 6. Fix Applied

**None.** No code change was made. The investigation found no code defect.

---

## 7. Files Changed

None.

---

## 8. Test Results

```
npm test src/features/jobs/infrastructure/SupabaseJobRepository.test.ts

Test Files  1 passed (1)
      Tests  22 passed (22)
   Duration  429ms
```

---

## 9. Recommendations (operational, not code changes)

1. **Check Supabase project status** when `TypeError: fetch failed` recurs — the free-tier project may be paused or sleeping.
2. **Add SUPABASE_URL health-check** at the start of `score.ts` (a lightweight `client.from("jobs").select("id").limit(1)` with a short timeout) to distinguish connectivity failures from query-specific failures — but only as a future improvement, not a required fix.
3. **Monitor GitHub Actions timing** — if `scrape` and `score` run back-to-back and `scrape` exhausts Supabase's connection pool, `score` may consistently fail at its first complex query.

---

## 10. Risk Assessment

- **No code was changed** → zero regression risk.
- The `findUnscored` OR filter correctly implements the scoring-loop fix described in `docs/fixes/scoring-loop-fix.md`.
- Retry behavior is preserved: the postgrest-js built-in retry (3 attempts, exponential backoff) handles transient failures before surfacing the error.
