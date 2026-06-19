# Verification Report: Scoring Loop and Health Changes

**Date:** 2026-06-19  
**Method:** Read-only audit of code, migrations, and tests. No trust placed in commit messages, PR descriptions, or documentation.

---

## 1. Scoring Loop Fix

**Status: VERIFIED**

### Evidence

**`findUnscored()` implementation**  
`src/features/jobs/infrastructure/SupabaseJobRepository.ts:180-209`

- Signature (line 180): `async findUnscored(roleSelectionId: string, expandedRoles: string[], resumeVersion: number, keywordThreshold: number): Promise<Job[]>`
- Exclusion filter (lines 191-196): uses an `or()` combining `ai_score.not.is.null` with `keyword_score.lt.${keywordThreshold}`
- Jobs with `keyword_score >= threshold AND ai_score IS NULL` are not excluded — they remain eligible for retry.

**Script orchestration**  
`scripts/score.ts:37-63`

- Line 37: reads `KEYWORD_THRESHOLD` from env, default `0.25`
- Line 39: passes `keywordThreshold` to `findUnscored()`
- Lines 43-63: explicitly separates:
  - `skippedBelowGate` — jobs where `keyword_score < threshold` (intentional skip)
  - `aiCallFailed` — jobs where `keyword_score >= threshold` but `ai_score == null` (genuine failure, retried)

**Tests**  
`src/features/jobs/infrastructure/SupabaseJobRepository.test.ts:91-156`

- Line 91–135: `"uses an OR filter to exclude fully-scored and keyword-skipped jobs"` — verifies PostgREST filter string `"ai_score.not.is.null,keyword_score.lt.0.25"`
- Line 137–156: `"includes jobs with keyword_score >= threshold and ai_score IS NULL (AI failure retry)"` — confirms AI failure cases are not excluded

### Regressions / Issues

None.

---

## 2. Wellfound Disable Support

**Status: VERIFIED**

### Evidence

**Env var reading and disabled logic**  
`src/features/sources/infrastructure/wellfound/WellfoundScraper.ts:13-39`

- Line 13–14: defines `WELLFOUND_DISABLED_VAR` and `WELLFOUND_FEED_URL_VAR`
- Line 29–30: reads `WELLFOUND_DISABLED` via `optionalEnv()`; values `"true"` or `"1"` return `{ status: "disabled" }` immediately
- Line 34–38: reads `WELLFOUND_FEED_URL` via `optionalEnv()`; when missing, returns `{ status: "disabled" }` — comment on lines 36–37 explicitly states this avoids `invalid_config` noise for unconfigured deployments

**Logging**  
`src/features/sources/infrastructure/wellfound/WellfoundScraper.ts:103-112`

- Line 107: `console.log("[wellfound] disabled")` for disabled state
- Line 112: `console.warn()` used only for `invalid_config` state — disabled path never warns

**Tests**  
`src/features/sources/infrastructure/wellfound/WellfoundScraper.test.ts`

- Line 19–27: `WELLFOUND_DISABLED=true` → disabled
- Line 24–27: `WELLFOUND_DISABLED=1` → disabled
- Line 29–32: missing `WELLFOUND_FEED_URL` → clean disabled (no warning)
- Line 34–39: malformed URL → `invalid_config`
- Line 41–46: unsupported protocol → `invalid_config`
- Line 101–112: `"returns [] and logs 'disabled' when no feed URL is configured (clean skip)"`

### Regressions / Issues

None.

---

## 3. `hasScore()` Signature Fix

**Status: VERIFIED**  
**Secondary finding: `hasScore()` is dead code — defined but never called outside tests.**

### Evidence

**Interface**  
`src/features/scoring/domain/ScoreRepository.ts:13`

```ts
hasScore(jobId: string, roleSelectionId: string, resumeVersion: number): Promise<boolean>;
```

`resumeVersion` is present.

**Implementation**  
`src/features/scoring/infrastructure/SupabaseScoreRepository.ts:27-37`

- Filters on all three columns: `job_id`, `role_selection_id`, `resume_version`
- Matches the three-column unique constraint in migration `20260618000002_resume_versioning.sql:38-40`

**Tests**  
`src/features/scoring/infrastructure/SupabaseScoreRepository.test.ts:46-65`

- Line 46–56: `"hasScore returns true when count > 0 and filters by all three key columns"` — verifies all three `.eq()` calls
- Line 58–65: `"hasScore returns false when count is 0"`

### Regressions / Issues

**Dead code:** `hasScore()` has no callers outside tests. The interface and implementation are correct, but nothing invokes it in production paths. This is not a regression (it was likely added for an upcoming caching or deduplication optimization), but it should be noted.

**Stale comment:**  
`src/features/scoring/domain/ScoreRepository.ts:5-8` describes the unique key as `(job_id, role_selection_id)`. It should say `(job_id, role_selection_id, resume_version)`. Implementation is correct; only the comment is wrong.

---

## 4. `job_scores.model` Support

**Status: VERIFIED**

### Evidence

**Migration**  
`supabase/migrations/20260619000003_job_scores_model.sql`

- Line 5: `alter table job_scores add column model text;`
- Nullable by design (comment explains rationale)

**TypeScript types**  
`supabase/database.types.ts:62-95`

- `Row` (line 69): `model: string | null`
- `Insert` (line 80): `model?: string | null`
- `Update` (line 91): `model?: string | null`

`src/features/scoring/domain/types.ts:12-20`

- `NewJobScore` (line 19): `model?: string | null`

`src/features/scoring/domain/AiScoreProvider.ts:4-8`

- `AiScoreResult` (line 7): `model: string`

**Score persistence**  
`src/features/scoring/infrastructure/SupabaseScoreRepository.ts:10-25`

- Line 19: writes `model: score.model ?? null`
- Line 21: upsert key is the three-column constraint including `resume_version`

**Score creation**  
`src/features/scoring/application/scoreJob.ts:24-60`

- Line 35: `let model: string | null = null;`
- Line 42: `model = result.model;` (assigned from AI provider)
- Line 53: `model` included in `NewJobScore` object passed to repository

**OpenRouter provider**  
`src/features/scoring/infrastructure/OpenRouterAiScoreProvider.ts:45-76`

- Line 47: reads `OPENROUTER_MODEL` env var
- Lines 65–69: returns `{ score, reasoning, model }`

**Tests**  
`src/features/scoring/infrastructure/SupabaseScoreRepository.test.ts:6-44`

- Line 17: upsert input includes `model: "openai/gpt-4o-mini"`
- Line 28: verifies model is written
- Lines 38–41: verifies model defaults to `null` when omitted

`src/features/scoring/application/scoreJob.test.ts:84-102`

- Line 88: `"calls the AI provider and stores its result (including model)"`
- Line 101: `expect(result.model).toBe("openai/gpt-4o-mini")`

`src/features/scoring/infrastructure/OpenRouterAiScoreProvider.test.ts:50-61`

- Line 57: `expect(result).toEqual({ score: 0.85, reasoning: "Strong match", model: "test-model" })`

### Regressions / Issues

None.

---

## 5. Tests

**Status: COMPREHENSIVE — all four changes are covered**

| Behavior | Test file | Test name / lines | Covered |
|---|---|---|---|
| `findUnscored()` OR filter excludes keyword-skipped | `SupabaseJobRepository.test.ts:91–135` | `"uses an OR filter..."` | ✅ |
| AI failure retry not excluded | `SupabaseJobRepository.test.ts:137–156` | `"includes jobs with keyword_score >= threshold..."` | ✅ |
| `WELLFOUND_DISABLED=true` | `WellfoundScraper.test.ts:19–27` | config validation suite | ✅ |
| `WELLFOUND_DISABLED=1` | `WellfoundScraper.test.ts:24–27` | config validation suite | ✅ |
| Missing `WELLFOUND_FEED_URL` → clean disabled | `WellfoundScraper.test.ts:29–32, 101–112` | `"returns [] and logs 'disabled'..."` | ✅ |
| Malformed URL → `invalid_config` | `WellfoundScraper.test.ts:34–39` | config validation suite | ✅ |
| `hasScore()` filters all three key columns | `SupabaseScoreRepository.test.ts:46–56` | `"hasScore returns true..."` | ✅ |
| `hasScore()` returns false | `SupabaseScoreRepository.test.ts:58–65` | `"hasScore returns false..."` | ✅ |
| `model` persisted in upsert | `SupabaseScoreRepository.test.ts:6–44` | upsert suite | ✅ |
| `model` defaults to null | `SupabaseScoreRepository.test.ts:38–41` | upsert suite | ✅ |
| `scoreJob` captures model from provider | `scoreJob.test.ts:84–102` | `"calls the AI provider and stores its result..."` | ✅ |
| OpenRouter returns model field | `OpenRouterAiScoreProvider.test.ts:50–61` | provider suite | ✅ |

### Coverage Gaps

**`hasScore()` has no integration or end-to-end coverage** because it has no production callers. Once it is wired in, tests should be added at the call site.

There is no test asserting that `console.warn` is **not** called when `WELLFOUND_FEED_URL` is absent (only that `console.log` is called with `"disabled"`). This could mask a future regression where a warn is accidentally added.

---

## Summary

| Item | Status |
|---|---|
| Scoring loop fix (`findUnscored` keyword gate exclusion + AI retry) | **VERIFIED** |
| Wellfound disable support (`WELLFOUND_DISABLED`, missing URL → clean skip, logging) | **VERIFIED** |
| `hasScore()` signature includes `resumeVersion`, matches persistence key | **VERIFIED** |
| `job_scores.model` — migration, types, population, persistence, provider | **VERIFIED** |
| Tests cover all four changes | **VERIFIED** |

### Follow-up Recommendations

1. **Wire up `hasScore()`** or document it as future API. Dead code with tests creates maintenance burden.
2. **Fix stale comment** in `ScoreRepository.ts:5-8` — unique key should reference all three columns including `resume_version`.
3. **Add negative assertion for `console.warn`** in the Wellfound missing-URL test to lock in the clean-skip behavior.
