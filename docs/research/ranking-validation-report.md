# Phase 4B — Ranking Validation Report

**Date:** 2026-06-23  
**Branch:** phase4b-ranking-validation  
**Method:** Static code analysis of Phase 4A implementation against Phase 3/4 issue catalogue. No live DB access. Evidence cited by file:line.  

---

## Executive Summary

Phase 4A delivered five targeted improvements that are all correctly implemented and tested. The deterministic fixes (Indiana/India, location tags, min_years in prompt, duplicate skills removal) are working as specified. However, three significant issues remain that materially limit ranking quality: a confirmed C/C++ skill extraction collision that inflates keyword scores for C++ jobs, the backfill script that unlocks min_years filtering still not having been run, and a 70-entry skills dictionary that silently drops entire job categories.

**Overall verdict:** Phase 4A materially improved location accuracy and AI prompt quality. Ranking quality gains are partially blocked by the unrun backfill (EXP-1) and the C/C++ bug (SK-2). The remaining issues are actionable within one day.

---

## Phase 4A Implementation Audit

All five changes from `0565e92` verified against current source:

| Change | Claimed | Verified | Evidence |
|---|---|---|---|
| Indiana/India fix | word-boundary regex | ✅ Correct | `tagLocations.ts:28` — `\b${escaped}\b` regex |
| location_tags in prompt | append tags alongside locationRaw | ✅ Correct | `OpenRouterAiScoreProvider.ts:49–52` |
| min_years in prompt | add "Experience required: N+ years" when non-null | ✅ Correct | `OpenRouterAiScoreProvider.ts:60–62` |
| Remove duplicate skills | delete "Candidate skills: …" line | ✅ Correct | `buildSystemPrompt` has no such line |
| minYears on Job type | propagate from DB via toJob | ✅ Correct | `jobs/domain/types.ts:21` `minYears: number \| null` |
| Tests added | +8 tests | ✅ All 8 present | `tagLocations.test.ts:55–72`, `OpenRouterAiScoreProvider.test.ts:189–248` |

All Phase 4A claims are accurate. No regression or gap between commit message and code.

---

## Remaining Issues

Ordered by severity. Each issue references the original catalogue ID where applicable.

---

### ISSUE-1 — C and C# token boundary collision in skill extraction ✅ FIXED (Phase 4B)

**Severity: HIGH**  
**Category: Skill matching — false positive / score distortion**  
**Status: Fixed in Phase 4B — `skills.ts:33` boundary regex now excludes `+` and `#`**

**Evidence:**

`skills.ts:32–35` — `containsToken` uses negative lookahead/lookbehind `(?<![a-z0-9])…(?![a-z0-9])`. The character class excludes alphanumeric but not `+` or `#`.

Tested directly with Node.js against the actual function logic:

```
containsToken("c++ developer", "c")  → true   ← BUG
containsToken("c# developer", "c")   → true   ← BUG
containsToken("c programming", "c")  → true   ← correct
containsToken("cpp code", "c")       → false  ← correct (cpp has no word boundary issue)
```

**Impact:**

Every job description containing "C++" or "C#" also extracts "C" as a matched skill. Concrete effects:

1. `jobSkills` for a C++ posting includes both `"C++"` and `"C"` (inflated denominator). A C++ developer resume with only `"C++"` in skills scores `1 / 2 = 0.5` instead of `1 / 1 = 1.0` on a pure C++ posting. Keyword gate (0.25 threshold) still passes, but with reduced signal confidence.

2. A resume listing only `"C"` (the language) gets a spurious keyword match against any C++ or C# job. Such a resume passes the keyword gate on C++ postings it may be genuinely unqualified for.

3. No test exists for this path. `src/shared/domain/skills.ts` has no test file. The collision is undetected.

**Fix (under 1 day):**  
Add `+` and `#` to the exclusion character class in `containsToken`:

```typescript
// skills.ts:32
const pattern = new RegExp(`(?<![a-z0-9+#])${escaped}(?![a-z0-9+#])`, "i");
```

Then add unit tests: `containsToken("c++ dev", "c")` must return `false`, `containsToken("c# dev", "c")` must return `false`, `containsToken("c language", "c")` must return `true`.

---

### ISSUE-2 — Backfill script exists but has never been run ⚠️ MANUAL STEP REQUIRED

**Severity: HIGH**  
**Category: Experience matching — filter ineffectiveness**  
**Status: Script verified correct. Cannot execute without production credentials. Must be run manually.**

**Evidence:**

`scripts/backfill-min-years.ts` exists and is correct — it reads `jobs WHERE min_years IS NULL AND description IS NOT NULL AND is_active = true` in batches of 500 and calls `parseMinYears(title + '\n' + description)`.

Phase 4 doc states: "70–80% of active corpus still has `min_years = NULL`." The backfill was listed as P1-C ("not yet run"). Phase 4A commit (`0565e92`) touched zero rows in `scripts/` — confirmed by `git show 0565e92 --stat`.

**Impact:**

`Job.minYears` is null for the majority of the corpus. Phase 4A correctly adds "Experience required: N+ years" to the AI prompt when `minYears !== null` — but the condition is only met for ~20–30% of jobs (those ingested after the P2 deployment). The remaining 70–80% still send no experience context to the AI. The seniority parsing improvement from Phase 3A (senior → 5, junior → 0, etc.) is also inactive for this cohort.

**Fix (under 1 day):**  
Run `npx tsx scripts/backfill-min-years.ts` against the production DB. Low risk — it only writes `min_years`; dry-run by logging counts before committing the UPDATE. No schema change required.

---

### ISSUE-3 — Skills dictionary: 70 entries miss entire job categories ✅ FIXED (Phase 4B)

**Severity: MEDIUM-HIGH**  
**Category: Skill matching — false negative**  
**Status: Fixed in Phase 4B — dictionary expanded from 70 → 83 entries**

**Evidence:**

`src/shared/config/skills-dictionary.ts` — 70 entries. Missing confirmed by inspection:

| Missing skill | Category | Impact |
|---|---|---|
| Kafka, RabbitMQ | Message queues | Backend/data roles score 0 |
| Ansible | IaC/DevOps | DevOps roles score 0 |
| Prometheus, Grafana | Observability | SRE/DevOps roles score 0 |
| Snowflake, dbt, Spark, Airflow | Data engineering | Entire data-eng category unreachable |
| Celery | Task queues | Backend roles miss this |
| SvelteKit, Remix, Astro, tRPC | Modern frontend | Frontend roles score 0 |

Any job whose skill set is exclusively from these lists produces `jobSkills = []` → `keyword_score = 0` → never reaches AI scoring. These are not low-volume edge cases — data engineering, DevOps, and modern frontend are high-activity hiring markets.

**Fix (under 1 day):**  
Additive entries only; no logic change. Priority: Kafka, dbt, Snowflake, Ansible, Prometheus, Grafana (covers data-eng and DevOps). Each addition is a two-line dictionary entry. No migration.

---

### ISSUE-4 — Role matching runs against full title + description haystack

**Severity: MEDIUM-HIGH**  
**Category: Role matching — false positive**  
**Status: Unaddressed (was RL-1, RL-2, P2-E)**

**Evidence:**

`src/features/sources/domain/roleMatch.ts:35`:
```typescript
const haystack = `${job.title}\n${job.description}`.toLowerCase();
```

`roleMatch.ts:39`:
```typescript
return term.length > 0 && haystack.includes(term);
```

Two distinct problems in one location:
1. Description body is searched, not just title. A Sales Manager role that says "we work closely with backend engineers" passes a "backend engineer" filter.
2. `haystack.includes(term)` has no word boundary. "engineer" matches "bioengineering" and "re-engineering".

Both issues apply at scrape time (client-side filter for non-keyword-capable sources: Greenhouse, Lever, Ashby, Wellfound, RemoteOK). These false positives pass through to scoring and can receive AI calls.

**Fix (under 1 day for partial improvement):**  
Title-only match is the safest single change — change `haystack` to `job.title.toLowerCase()`. This is the RL-2 fix recommended in Phase 4 doc as P2-E. Risk: some legitimate roles have non-standard titles and signal only via description. The title-only approach will miss these (false negatives), but current false-positive rate is likely worse. A tiered approach (title match = full pass, description match = lower weight) is safer but is a half-day effort.

---

### ISSUE-5 — RemoteOK partial fix: unrecognised location strings still dropped

**Severity: MEDIUM**  
**Category: Location matching — false negative**  
**Status: Partially addressed (LOC-2)**

**Evidence:**

`tagLocations.ts` now uses word-boundary regex — correctly fixes Indiana/India (LOC-1). But `LOCATION_KEYWORD_RULES` has no rule for `"North America"`, `"USA Only"`, `"Worldwide"`, or `"Global"`. These produce `locationTags = []` and are dropped by `hasAllowedLocation`.

Phase 3 doc noted RemoteOK has 0% keep rate because the Phase 3B fix only defaulted to "remote" when `entry.location` is falsy. Entries with a non-empty but unrecognised location string still fall through.

This issue is scoped to RemoteOK (which primarily uses these location formats) but also affects any other source using `"Worldwide"` or `"North America"`.

**Fix (under 1 day):**  
Add `"worldwide"`, `"global"`, `"anywhere"`, `"north america"`, `"usa only"` to the `remote` keyword list in `location-keywords.ts`. "North America" and "USA Only" are semantically remote-friendly or at minimum not India/Singapore/UAE. Alternatively, set `REMOTEOK_DISABLED=true` if remote roles are not currently desired — zero-code env-var fix.

---

### ISSUE-6 — Keyword score formula ignores absolute match count

**Severity: MEDIUM**  
**Category: Skill matching — score distortion**  
**Status: Unaddressed (was SK-1, W-2, MQ-8) — deferred by Phase 4 doc**

**Evidence:**

`computeKeywordScore.ts:18`:
```typescript
return matched.length / jobSkills.length;
```

A job listing 1 skill where the resume matches: `1/1 = 1.0`. A job listing 9 skills where the resume matches 2: `2/9 = 0.22` → below gate, never AI-scored, even though 2 absolute skill matches is meaningful signal.

Phase 4 doc explicitly deferred this: "Keyword score formula redesign requires empirical score distribution data first." No change recommended here without baseline data.

**Status: Deferred — do not fix without score distribution data.**

---

### ISSUE-7 — Greenhouse/Lever/Ashby empty locationRaw → jobs silently dropped

**Severity: MEDIUM**  
**Category: Location matching — false negative**  
**Status: Unaddressed (LOC-3)**

**Evidence:**

Phase 4 doc identifies this but it was not a P0/P1 item. Remote-friendly companies using Greenhouse/Lever/Ashby that omit the location field produce `locationRaw = ""` → `locationTags = []` → dropped.

Phase 4A didn't touch this code path. The word-boundary fix only affected the matching logic, not the empty-string case.

**Fix (under 1 day):**  
At the scraper adapter level (greenhouse/lever/ashby), default `locationRaw` to `"Remote"` when the ATS location field is absent or empty. Semantically plausible — ATS-hosted companies often omit location when they're remote-first. Risk is tagging on-site companies as remote, but these jobs would otherwise be invisible.

---

### ISSUE-8 — `notifications_log` not scoped to role_selection_id

**Severity: LOW-MEDIUM**  
**Category: Notification false negative — permanent suppression on role switch**  
**Status: Unaddressed (MQ-6, P2-D)**

**Evidence:**

`UNIQUE (job_id)` in `notifications_log` (confirmed in Phase 3/4 docs). Switching the active role permanently silences jobs that were notified under the previous role, even if they score above threshold for the new role.

This is a known deferred item. Fix requires a migration (add `role_selection_id` column, change unique constraint). Medium risk, half-day effort. Not a <1-day fix.

**Status: Out of scope for this phase.**

---

## Validation by Dimension

### Location Matching

| Issue | Pre-4A | Post-4A | Status |
|---|---|---|---|
| Indiana/India false positive | BUG | FIXED | ✅ Resolved |
| location_tags sent to AI | Missing | Added | ✅ Resolved |
| Unrecognised location strings (LOC-2) | Dropping | Still dropping | ❌ Open (ISSUE-5) |
| Empty locationRaw from ATS (LOC-3) | Dropping | Still dropping | ❌ Open (ISSUE-7) |

### Experience Matching

| Issue | Pre-4A | Post-4A | Status |
|---|---|---|---|
| Seniority labels (senior/junior) → min_years | NULL | Parsed (Phase 3A) | ✅ Resolved |
| min_years in AI prompt | Absent | Present when non-null | ✅ Resolved |
| Pre-P2 corpus backfill | Not run | Still not run | ❌ Open (ISSUE-2) |
| Non-experience "years" false positives (EXP-3) | Present | Present | ❌ Open (accepted risk) |

### Role Matching

| Issue | Pre-4A | Post-4A | Status |
|---|---|---|---|
| Description-body false positives (RL-1) | Present | Present | ❌ Open (ISSUE-4) |
| No word boundary on role terms (RL-2) | Present | Present | ❌ Open (ISSUE-4) |
| MCF capped at 4 search terms (RL-5) | Present | Present | ❌ Open (out of scope) |

### Skill Matching

| Issue | Pre-4A | Post-4A | Status |
|---|---|---|---|
| C/C++ token boundary collision (SK-2) | Present | Fixed | ✅ Resolved (Phase 4B) |
| C# token boundary collision | Present | Fixed | ✅ Resolved (Phase 4B) |
| 70-entry dictionary (SK-5) | 70 entries | 83 entries | ✅ Resolved (Phase 4B) |
| keyword_score ratio bias (SK-1) | Present | Present | ⏸ Deferred |

### AI Prompt Quality

| Issue | Pre-4A | Post-4A | Status |
|---|---|---|---|
| Duplicate resume.skills in prompt | Present | Removed | ✅ Resolved |
| locationRaw only (no structured tags) | Present | Fixed | ✅ Resolved |
| No seniority context in prompt | Present | Fixed (when non-null) | ✅ Partially resolved |
| No scoring rubric | Present | Present | ⏸ Deferred |

---

## Recommended Fixes (All < 1 Day)

Ordered by effort/impact ratio. All are code-only; none require DB migrations.

### Fix 1 — C/C++ boundary collision (30 min)

**File:** `src/shared/domain/skills.ts:33`  
**Change:** Add `+#` to both character classes in the `containsToken` boundary regex.  
**Before:** `(?<![a-z0-9])${escaped}(?![a-z0-9])`  
**After:** `(?<![a-z0-9+#])${escaped}(?![a-z0-9+#])`  
**Also:** Create `src/shared/domain/skills.test.ts` with at minimum: `containsToken("c++ dev", "c") → false`, `containsToken("c# dev", "c") → false`, `containsToken("c lang", "c") → true`.

### Fix 2 — Run min_years backfill (15 min + wait) ⚠️ REQUIRES PRODUCTION CREDENTIALS

**Script:** `scripts/backfill-min-years.ts` — verified correct, no code change needed.

**Before count** (run first to measure impact):
```sql
SELECT COUNT(*) FROM jobs WHERE min_years IS NULL AND description IS NOT NULL AND is_active = true;
```

**Execute:**
```bash
# From job-scraper directory with credentials set:
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/backfill-min-years.ts
```

Script outputs per-batch progress and a final summary: `total processed | total updated | remaining NULL`.

**After count** (verify with same query — remaining NULLs will only be jobs where `parseMinYears` returned null, i.e. no numeric years or seniority labels found).

**Rollback:** Not directly reversible. The script only writes values where `min_years IS NULL`; it never overwrites existing non-null values. If a bad parse sets an incorrect value, corrective SQL is:
```sql
UPDATE jobs SET min_years = NULL WHERE min_years > 20 OR min_years < 0;
```

### Fix 3 — Expand skills dictionary (1 hour)

**File:** `src/shared/config/skills-dictionary.ts`  
**Add (minimum viable set):** Kafka, RabbitMQ, Ansible, Prometheus, Grafana, Snowflake, dbt, Spark, Airflow, SvelteKit, tRPC  
**Pattern:** Additive list entries only. Each is a `{ canonical, aliases }` object. No logic change.

### Fix 4 — Expand remote location keywords (15 min)

**File:** `src/shared/config/location-keywords.ts`  
**Add to `remote` keywords:** `"worldwide"`, `"global"`, `"north america"`, `"usa only"`  
**Or:** Set `REMOTEOK_DISABLED=true` env var to stop wasting scrape cycles.

### Fix 5 — Title-only role matching (1–2 hours)

**File:** `src/features/sources/domain/roleMatch.ts:35`  
**Change:** `const haystack = job.title.toLowerCase();`  
**Risk:** Some roles with non-standard titles may be missed. Acceptable trade-off — description-body matching is the primary source of non-technical job false positives.  
**Also add:** Word-boundary check (`\b` regex instead of `includes`) for role term matching while in this file.

---

## What Not to Fix Now

- **Keyword score formula (ISSUE-6):** Deferred by Phase 4 doc. Requires score distribution data. Do not change `computeKeywordScore`.
- **notifications_log role-scoping (ISSUE-8):** Requires migration. Out of scope for <1-day fixes.
- **Scoring rubric:** No baseline data. Phase 4 doc verdict: not recommended.
- **Resume truncation (P2-A/B):** Working as-is; pure cost reduction, no quality impact. Do later.
