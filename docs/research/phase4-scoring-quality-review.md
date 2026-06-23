# Phase 4 — Scoring Quality Investigation

**Date:** 2026-06-23
**Scope:** Investigation only. No implementation, no migrations, no prompt changes.
**Method:** Three parallel sub-agents (Current Scoring Analysis, Match Quality Review, Cost vs Quality Review) + integration.

---

## Executive Summary

The scoring system is structurally sound and cost-bounded. The two-stage pipeline (deterministic keyword → AI) is the right architecture. The 402 credit-exhaustion crisis is resolved. Token tracking is in place.

However, the system is leaving significant quality on the table through **deterministic failures that precede the AI call**, not through AI prompt deficiencies:

1. **`locationRaw` is sent to the AI instead of the structured `locationTags` array** — the AI must infer geography from strings like `"Singapore (Hybrid)"` when `["singapore", "remote"]` is already computed and sitting unused. One-line fix, immediate quality impact.

2. **"Indiana" matches "india" via bare substring** — US jobs are passing the India location filter. This is a false positive with a trivially small fix.

3. **`resume.skills` is sent twice** — both as an explicit comma-separated list and embedded in `resume.parsedText`. Removing the duplicate saves 20–80 tokens per call with zero quality loss.

4. **`min_years` is absent from the AI prompt** — the AI scores a "Principal Engineer, 10+ years" posting identically to an "Entry Level" posting if skill overlap is the same.

5. **The keyword score formula biases toward short skill lists** — a job listing 1 matching skill scores 1.0 (AI gate opens); a job listing 10 skills where 5 match scores 0.5 (also passes); a job where 2 of 9 match scores 0.22 (permanently blocked). The ratio-only formula ignores absolute match count.

**None of these require touching the AI prompt instructions.** Four of the top five improvements are deterministic data fixes.

**Verdict on prompt change today: NO** — for the scoring rubric/instructions. The data passed into the prompt has two fixable gaps (location_tags, min_years), but those are structural data additions, not instruction rewrites.

---

## Current Scoring System

### Architecture

Two-stage pipeline, run by `scripts/score.ts` on a cron schedule:

**Stage 1 — Keyword score (always runs, free)**

`scoreJob.ts` → `extractSkills()` runs a static 70-entry skills dictionary against `job.title + "\n" + job.description`. The result is compared to `resume.skills` (also dictionary-normalized) using:

```
keyword_score = |resumeSkills ∩ jobSkills| / |jobSkills|
```

If `jobSkills` is empty, score is 0. Result is clamped to `[0, 1]` and written to `job_scores`.

**Stage 2 — AI score (runs only if `keyword_score >= KEYWORD_THRESHOLD`, default 0.25)**

`OpenRouterAiScoreProvider.score()` builds two prompt parts and sends a single chat-completion to OpenRouter. Enforces structured JSON output (`{ score: number, reasoning: string }`) via `response_format: json_schema` with `strict: true`. Hard cap of `max_tokens = 300` (env-overridable). 15-second timeout, one retry on 5xx/429.

**Notification gate:** `ai_score >= NOTIFY_THRESHOLD` (default 0.75) triggers Telegram.

### Scoring Inputs

**Stage 1 — keyword (deterministic):**

| Field | Always present |
|---|---|
| `job.title` | Yes |
| `job.description` | Yes |
| `resume.skills` (canonical dictionary names) | Yes |

**Stage 2 — AI system prompt:**

| Field | Always present | Tokens (approx) |
|---|---|---|
| `resume.skills.join(", ")` | Yes | 20–80 |
| `resume.parsedText` (full PDF extract) | Yes | 1,000–3,500 |
| Format instruction | Yes | ~30 |

**Stage 2 — AI user/job prompt:**

| Field | Always present | Tokens (approx) |
|---|---|---|
| `job.title` | Yes | 5–15 |
| `job.companyName` | Yes (fallback: "Unknown") | 5–10 |
| `job.locationRaw` | Yes | 5–20 |
| `job.description` | Yes | 500–2,000 |

**Total input tokens per call:** ~1,600–5,700 | **Output tokens:** ~50–120 (300 reserved)

### Scoring Outputs

| Field | Type | Notes |
|---|---|---|
| `keyword_score` | `number [0,1]` | Always computed |
| `ai_score` | `number \| null` | Null if below threshold or AI failure |
| `ai_reasoning` | `string \| null` | 1-3 sentences |
| `model` | `string \| null` | Model identifier used |
| `tokens_input` | `number \| null` | From OpenRouter usage field |
| `tokens_output` | `number \| null` | From OpenRouter usage field |
| `estimated_cost_usd` | `number \| null` | Only if `OPENROUTER_COST_PER_1K_TOKENS` is set |

---

## Current Strengths

**1. Cost-bounded by design.**
The keyword gate prevents AI calls for irrelevant jobs. `max_tokens = 300` prevents credit over-reservation (root cause of the prior 402 crisis). The two-stage architecture is correct and well-documented.

**2. Structured JSON output enforced at the API level.**
`response_format: json_schema` with `strict: true` and `additionalProperties: false` makes malformed-response failures rare. No regex parsing of AI output is required.

**3. Failure resilience without data loss.**
AI call failures (`timeout`, `5xx`, `429`) leave `ai_score = NULL`. `findUnscored` re-queues these on the next cron run without crashing the batch. The 402 path surfaces immediately without retry. Previously-scored jobs are never re-scored unnecessarily.

**4. Symmetric skills extraction.**
The same `extractSkills()` function and the same dictionary are used for both `resumeSkills` and `jobSkills`. A skill can never appear on one side but not the other due to inconsistent parsing logic.

**5. Token usage tracked per score row.**
`tokens_input`, `tokens_output`, and `estimated_cost_usd` are persisted, enabling per-run and cumulative cost analysis via `getStats()`. Infrastructure for cost monitoring is in place.

---

## Current Weaknesses

Ranked by severity and evidence.

**W-1 — `locationRaw` sent instead of `locationTags` (HIGH)**
The AI receives `"Singapore (Hybrid)"` as a raw string instead of the already-computed `["singapore"]` tag. For location-sensitive scoring, the AI must guess meaning from uncontrolled strings. The `locationTags` array is GIN-indexed and available on every `Job` object but is never passed to `buildJobPrompt`. One-line fix; identified as OPP-6/MQ-3 in Phase 3.

**W-2 — Keyword score formula biases toward short skill lists (HIGH)**
`|intersection| / |jobSkills|` treats a 1-skill job listing with 1 match (score: 1.0) the same confidence as a 10-skill listing with 5 matches (score: 0.5). Both pass the 0.25 gate, but the signal quality differs significantly. A 2/9 match (0.22) is permanently blocked, even though 2 absolute matching skills is meaningful. The formula ignores absolute match count entirely.

**W-3 — `resume.skills` duplicated in AI prompt (MEDIUM)**
`resume.skills.join(", ")` appears as "Candidate skills: ..." on line 2 of the system prompt AND again embedded in `resume.parsedText` (which is the source those skills were extracted from). The AI sees the same signal twice. This adds 20–80 tokens per call with zero incremental information.

**W-4 — `min_years` absent from AI prompt (MEDIUM)**
Experience level is parsed at ingest, stored in `jobs.min_years`, and used for dashboard filtering. It is not passed to the AI prompt. A posting requiring 10+ years and an entry-level posting score identically if skill overlap matches. Including it costs ~5 tokens.

**W-5 — No scoring rubric — AI has no weighting guidance (MEDIUM)**
The system prompt says: "Respond with score (a number from 0 to 1) and reasoning (1-3 sentences)." No axis weights are specified. The AI decides independently whether to weight: seniority alignment, location fit, skill completeness, or cultural signals. Scores across jobs are not comparable on any defined axis.

**W-6 — Resume sent as a flat text blob — no structural weighting (MEDIUM)**
The AI receives the full resume as a single string. Contact headers, education boilerplate, and roles from 10 years ago are weighted identically to current skills and recent experience. The AI has no signal for recency.

**W-7 — Skills dictionary is narrow — 70 entries miss large swaths of the job market (MEDIUM)**
Missing: `Kafka`, `RabbitMQ`, `Ansible`, `Prometheus`, `Grafana`, `Snowflake`, `dbt`, `Spark`, `Airflow`, `Celery`, `SvelteKit`, `Remix`, `Astro`, `tRPC`, `Figma`, `Jira`, `Salesforce`, domain skills (fintech, healthcare), methodologies (agile, scrum). A job listing only these skills produces `jobSkills = []` → `keyword_score = 0` → never reaches the AI. These jobs are silently dropped.

**W-8 — `keyword_score = 0` (empty jobSkills) is indistinguishable from a true mismatch (MEDIUM)**
A job that mentions no dictionary skills (vague posting, architecture role) scores 0 the same as a job that lists 10 skills none of which the resume has. Both are blocked from AI scoring, but only the second is a genuine mismatch. The first may be a strong match with non-standard phrasing.

**W-9 — No job freshness weighting — stale jobs score identically to fresh ones (MEDIUM)**
`posted_at` is stored but never used in scoring. A job posted 13 days ago scores the same as one posted today. No `postedWithinDays` filter exists on the dashboard.

**W-10 — No score distribution data or quality feedback loop (LOW-MEDIUM)**
There is no mechanism to observe score distributions, compare scores to outcomes, or detect systematic bias. Without this, threshold tuning (`KEYWORD_THRESHOLD`, `NOTIFY_THRESHOLD`) is pure intuition.

---

## Match Quality Findings

### Experience Matching

`parseMinYears` (`src/features/jobs/application/parseMinYears.ts`) runs at ingest time. It uses:
1. Numeric regex: smallest match of `\d{1,2} years`, clamped to 0–20.
2. Seniority-label fallback (Phase 3A): `junior → 0`, `mid-level → 3`, `senior → 5`, `lead → 7`, `staff → 8`, `principal → 10`.

Result is stored in `jobs.min_years`. Dashboard and notification filters use `.or("min_years.is.null,min_years.lte.N")` — NULL always passes.

**Remaining false positives:**
- **EXP-1 — Pre-P2 rows still have `min_years = NULL` (no backfill run yet).** `scripts/backfill-min-years.ts` exists (proposed in Phase 3) but has not been executed. All pre-P2 rows pass the experience filter regardless of `maxYears` setting. Phase 3 estimated this at 70–80% of active corpus.
- **EXP-3 — Non-experience "years" context.** `"Founded 8 years ago, no experience required"` extracts `min_years = 8` (takes lowest numeric match). Entry-level jobs with such boilerplate are incorrectly filtered out when `maxYears = 5`.

**Evidence:** `parseMinYears.ts` has no context guard around the numeric regex. `ingestJobs.ts:37` confirms parse runs only at ingest.

### Location Matching

`tagLocations` uses case-insensitive substring match of `locationRaw` against keyword lists in `location-keywords.ts`. Tags: `india`, `singapore`, `uae`, `remote`.

**Remaining false positives:**
- **LOC-1 — `"indiana"` matches `"india"`.** `haystack.includes("india")` matches `"Indiana, USA"`. US companies with Indiana offices get tagged as India roles and pass the filter. This is a live false-positive source with no mitigation in place. Fix: change keyword to `" india"`, `", india"`, or use an explicit country list.
- **LOC-2 — RemoteOK non-empty unrecognized locations.** The Phase 3B fix defaults to `"remote"` only when `entry.location` is falsy. Entries with `locationRaw = "North America"` or `"USA Only"` produce empty `locationTags` and are still dropped. The fix is partial.
- **LOC-3 — Greenhouse/Lever/Ashby emit empty `locationRaw`.** Remote-friendly companies that omit the location field in their ATS get `locationRaw = ""` → zero tags → dropped silently.

**Evidence:** `tagLocations.ts:27` uses `haystack.includes(keyword)` with no boundary guards. `location-keywords.ts` line 10 has `"india"` as a bare substring.

### Skill Matching

**Remaining false positives:**
- **SK-1 — Short job skill lists over-score.** A 1-skill posting where the resume has that skill scores 1.0 keyword score, immediately passing the AI gate. Vague postings mentioning only "JavaScript" or "SQL" gain maximum keyword confidence.
- **SK-2 — `"C"` alias may match inside `"C++"`** — the boundary regex uses `[a-z0-9]` as guard characters, but `+` is not in the set. `containsToken("c++", "c")` may return `true`, falsely adding "C" to `jobSkills` on every C++ posting. Requires a unit test to confirm.

**Remaining false negatives:**
- **SK-5 — 70-entry dictionary misses high-frequency modern skills.** Kafka, Ansible, Prometheus, Grafana, Snowflake, dbt, Spark, Airflow, SvelteKit, Remix, Astro, tRPC are absent. Any job requiring these produces `keyword_score = 0` and is never AI-scored.
- **SK-6 — `keyword_score = 0` has two distinct causes that are treated identically.** Empty `jobSkills` (no dictionary hits in posting) vs. genuine skill mismatch (hits exist but resume has none). Both produce `ai_score = null`. The first case may represent legitimate matches with non-standard phrasing.

### Role Matching

**Remaining false positives:**
- **RL-1 — Role matching checks `title + description` as a single haystack.** `roleMatch.ts:35`: `const haystack = \`${job.title}\n${job.description}\`.toLowerCase()`. A Sales Manager posting that says "we work with backend engineers" passes a "backend engineer" filter. This is the highest-volume false-positive source at the pre-scoring stage.
- **RL-2 — No word-boundary enforcement.** `haystack.includes(term)` at `roleMatch.ts:39`. `"engineer"` matches `"bioengineering"` and `"re-engineering"`. Confirmed in code; acknowledged but not resolved.

**Remaining false negatives:**
- **RL-5 — MCF capped at 4 search terms (`MAX_SEARCH_TERMS = 4`).** Roles beyond index 3 are not submitted to MCF's server-side keyword API. They are applied client-side after fetching, but if MCF didn't return the results for those terms in the first place, they are permanently missed.

---

## Cost vs Quality Findings

### Token Consumption Per Call

| Component | Estimated tokens |
|---|---|
| System prompt (resume.skills duplicate) | 20–80 |
| System prompt (resume.parsedText) | 1,000–3,500 |
| System prompt (instructions) | ~55 |
| Job prompt (title + company + location) | ~20 |
| Job prompt (description) | 500–2,000 |
| **Total input** | **~1,600–5,700** |
| Output (actual) | 50–120 |
| Output (reserved) | 300 |

`resume.parsedText` is the single largest cost driver. `job.description` is second.

### Expensive Prompt Sections

1. **`resume.parsedText`** — 1,000–3,500 tokens. No truncation. A two-page senior resume with project details and PDF artifacts can exceed 3,500 tokens. Present in every call (constant per cron run).
2. **`job.description`** — 500–2,000 tokens. ATS job descriptions routinely include benefits paragraphs, EEO disclaimers, and application instructions. These are meaningless for fit scoring.
3. **Duplicate `resume.skills` line** — 20–80 tokens sent again despite already being in `parsedText`.

### Low-Value Prompt Sections

| Section | Issue |
|---|---|
| `resume.skills.join(", ")` | Fully redundant — appears in `parsedText` |
| Benefits/EEO boilerplate in `job.description` | Zero signal for fit scoring |
| Contact info, headers, formatting artifacts in `resume.parsedText` | PDF parse noise, zero signal |
| `job.companyName ?? "Unknown"` | Low signal; AI can infer context from description |

### Cost Reduction Opportunities

**CR-1 — Remove duplicate `resume.skills` line from system prompt**
- Change: Remove "Candidate skills: ..." line from `buildSystemPrompt`.
- Savings: 20–80 tokens per call (constant per run).
- Risk: Very low. The same skills appear in `parsedText`.

**CR-2 — Truncate `resume.parsedText` to ~6,000 chars (~1,500 tokens)**
- Change: Cap `resume.parsedText` before embedding.
- Savings: 200–2,000 tokens per call on verbose resumes.
- Risk: Low. Scoring-relevant content (skills, titles, recent experience) appears first. References, boilerplate, and formatting artifacts appear last.

**CR-3 — Truncate `job.description` to ~4,000 chars (~1,000 tokens)**
- Change: Cap description at ingest or at prompt-build time.
- Savings: 0–1,000 tokens per call on verbose postings.
- Risk: Low. Requirements sections reliably precede benefits/EEO content.

**CR-4 — Disable or fix RemoteOK (already P0-A from Phase 3)**
- Change: `REMOTEOK_DISABLED=true` or fix location defaults.
- Savings: Eliminates dead-weight scrape cycles. Any AI calls that fire on 0%-keep-rate jobs are also eliminated.
- Risk: Very low.

**CR-5 — Enable cost tracking (env var already supported)**
- Change: Set `OPENROUTER_COST_PER_1K_TOKENS` in environment.
- Savings: 0 tokens — this is a monitoring prerequisite, not a cost reduction.
- Risk: Zero. Required before any cost optimization work can be validated.

---

## Scoring Blind Spots

Signals that exist in the data, are not AI-generated, and are not used in scoring:

| Signal | Where it lives | Used in scoring? | Impact of adding |
|---|---|---|---|
| `location_tags` | `Job.locationTags: string[]` | No — only `locationRaw` sent | High — structured geography context |
| `min_years` | `Job.minYears: number \| null` | No | Medium — seniority alignment |
| `keyword_score` | Computed in stage 1 | Not passed to AI | Medium — AI could calibrate to overlap |
| `posted_at` | `Job.postedAt` | No filter, no scoring | Medium — freshness signal |
| `source` | `Job.source` | No | Low — contextual signal (startup vs. enterprise) |
| `role_selection.name` | Active role being searched | No | Medium — intended role context |

The largest gap: **`location_tags`** exists precisely because `locationRaw` is unreliable. The entire tag-computation infrastructure was built to solve the raw-string problem — but the AI still receives only the raw string.

---

## Deterministic Improvements

### P0 — Fix Before Next Sprint

**P0-A — Fix `"indiana"` / `"india"` location keyword collision**
- File: `src/shared/config/location-keywords.ts`
- Change: Replace bare `"india"` keyword with bounded alternatives (e.g., `" india"`, `", india"`, or a country-name list).
- Impact: Eliminates false-positive US jobs being tagged as India roles. Any US company with Greenhouse jobs in Indiana states is currently passing the India filter.
- Effort: 15 minutes. No migration.

**P0-B — Add `location_tags` to AI job prompt**
- File: `src/features/scoring/infrastructure/OpenRouterAiScoreProvider.ts:53`
- Change: `Location: ${job.locationRaw} (tags: ${job.locationTags.join(', ')})`
- Impact: AI receives structured `["singapore", "remote"]` alongside the raw string. Eliminates AI guesswork on ambiguous geography strings.
- Effort: 1 line. +5 tokens per call. No migration.
- Evidence: Identified as OPP-6/MQ-3 in Phase 3. Already flagged in `phase3-match-quality-review.md`.

**P0-C — Enable cost tracking**
- Change: Set `OPENROUTER_COST_PER_1K_TOKENS` in production environment.
- Impact: Required to validate all other cost changes. Without it, there is no per-call cost visibility.
- Effort: 5 minutes. No code change.

### P1 — High Value, Near Term

**P1-A — Remove duplicate `resume.skills` from system prompt**
- File: `src/features/scoring/infrastructure/OpenRouterAiScoreProvider.ts:39–42`
- Change: Remove the "Candidate skills: ..." line from `buildSystemPrompt`. The same information is in `parsedText`.
- Impact: 20–80 token savings per call. No quality loss.
- Effort: 1 line deletion. No migration.

**P1-B — Add `min_years` to AI job prompt**
- File: `src/features/scoring/infrastructure/OpenRouterAiScoreProvider.ts:49–57`
- Change: Add `Experience required: ${job.minYears !== null ? job.minYears + '+ years' : 'not specified'}` to `buildJobPrompt`.
- Impact: AI can score seniority alignment explicitly. A Principal Engineer posting and an Entry Level posting are no longer scored identically on skill overlap alone.
- Effort: 1 line. +5 tokens per call. Depends on P2 backfill being complete.

**P1-C — Run `min_years` backfill script**
- Script: `scripts/backfill-min-years.ts` (exists, not yet run)
- Impact: Raises experience filter coverage from ~20–30% to ~60%+ on historical corpus. Without this, P1-B adds `min_years = null` to most prompts (correct behavior, but limited benefit until backfill runs).
- Effort: One-time script execution. Medium risk (bulk update).

**P1-D — Expand skills dictionary with high-frequency missing skills**
- File: `src/shared/config/skills-dictionary.ts`
- Priority additions: `Kafka`, `RabbitMQ`, `Ansible`, `Prometheus`, `Grafana`, `Snowflake`, `dbt`, `Spark`, `Airflow`, `Celery`, `SvelteKit`, `tRPC`, `Remix`, `Astro`
- Impact: Jobs requiring these skills currently produce `keyword_score = 0` and are permanently excluded from AI scoring. Adding 14 entries unlocks an entire category of data/DevOps/modern frontend roles.
- Effort: Additive list edits, no logic changes. Low risk.

**P1-E — Verify and fix `"C"` / `"C++"` alias collision**
- File: `src/shared/config/skills-dictionary.ts`, `src/shared/domain/skills.ts`
- Change: Write a unit test for `containsToken("c++", "c")`. If it returns `true`, add `+` to the lookahead exclusion in the boundary regex, or reorder dictionary entries so `C++` is extracted first.
- Impact: Medium — if the collision exists, every C++ job is also tagged as a C job, diluting keyword scores and potentially causing spurious matches.
- Effort: 30 minutes for test + fix.

### P2 — Valuable, Lower Urgency

**P2-A — Truncate `resume.parsedText` to ~6,000 chars**
- Impact: 200–2,000 token savings per call on verbose resumes.
- Effort: 1 line in `buildSystemPrompt`. Low risk; scoring-relevant content is front-loaded in resume text.

**P2-B — Truncate `job.description` to ~4,000 chars**
- Impact: 0–1,000 token savings per call on verbose postings.
- Effort: 1 line in `buildJobPrompt` or at ingest. Low risk.

**P2-C — Add `postedWithinDays` filter to `JobFilters` and dashboard**
- Impact: Users can filter to recent jobs only. `posted_at` is reliable for Lever and MCF; less reliable for Greenhouse/Ashby.
- Effort: Medium. Requires domain type change, repository predicate, and UI control.

**P2-D — Scope `notifications_log` to `(job_id, role_selection_id)`**
- Impact: Jobs notified under a previous role are no longer permanently suppressed for new roles.
- Effort: Medium. Requires migration and repository update.
- Evidence: Identified as MQ-6/Finding 7 in Phase 3 `worth-reviewing-analysis.md`.

**P2-E — Restrict role matching to title-only (or apply tiered approach)**
- Impact: High precision improvement. Eliminates false positives where a Sales or non-technical role mentions engineering in its description.
- Effort: Medium. Risk to recall — some legitimate roles have non-standard titles and only signal via description. A tiered approach (title match = full confidence, description match = lower weight) is safer than removing description matching entirely.

**P2-F — `malformed_response` circuit breaker**
- Current behavior: Malformed AI responses leave `ai_score = NULL`, causing `findUnscored` to re-queue indefinitely. There is no retry limit for this failure type.
- Impact: Low in practice (JSON schema enforcement makes this rare) but represents an infinite-loop risk if the model consistently returns malformed output.
- Effort: Small — add a `malformed_attempts` counter or a separate exclusion flag.

---

## AI Prompt Improvements

Only two AI/prompt changes are recommended. Both are **data additions**, not instruction rewrites.

**AP-1 — Add `location_tags` to job prompt (already listed as P0-B)**
This is technically a prompt change but is really a structured-data fix. The AI currently receives unstructured strings because the structured data was never wired. Impact is deterministic: the AI has better input data; its instructions are unchanged.

**AP-2 — Add `min_years` to job prompt (already listed as P1-B)**
Same reasoning. Passing explicitly-parsed experience requirements as a separate field is more reliable than expecting the AI to extract them from the description body.

**Not recommended at this time:**
- Adding a scoring rubric (weight ordering of skills, location, seniority). The current scoring output is not benchmarked. Without a score distribution baseline and outcome data, a rubric may introduce bias that cannot be measured.
- Instructing the AI to differentiate from keyword scoring. The AI prompt already holistically evaluates the job; changing its mandate without baseline data risks unknown side effects.
- Truncating resume sections or adding section headers to the system prompt. These require resume structure knowledge that may not generalize across PDF sources.

---

## Effort vs Impact Matrix

| Item | Effort | Impact | Type | Priority |
|---|---|---|---|---|
| P0-A: Fix "indiana" keyword | XS (15 min) | High | Deterministic | P0 |
| P0-B: Add `location_tags` to prompt | XS (15 min) | High | Data addition | P0 |
| P0-C: Enable cost tracking | XS (5 min) | High (monitoring) | Config | P0 |
| P1-A: Remove duplicate skills line | XS (5 min) | Medium | Cost reduction | P1 |
| P1-B: Add `min_years` to prompt | XS (10 min) | Medium | Data addition | P1 |
| P1-C: Run backfill script | S (30 min) | High | Deterministic | P1 |
| P1-D: Expand skills dictionary | S (1 hr) | Medium-High | Deterministic | P1 |
| P1-E: Verify C/C++ alias collision | S (30 min) | Medium | Deterministic | P1 |
| P2-A: Truncate `parsedText` | XS (15 min) | Medium | Cost reduction | P2 |
| P2-B: Truncate `job.description` | XS (15 min) | Medium | Cost reduction | P2 |
| P2-C: Add freshness filter | M (half day) | Medium | Deterministic | P2 |
| P2-D: Scope notifications_log | M (half day) | Medium | Deterministic | P2 |
| P2-E: Title-only role matching | M (half day) | High precision | Deterministic | P2 |
| P2-F: Malformed response circuit breaker | S (1 hr) | Low | Resilience | P2 |

XS = under 30 min | S = 30 min – 2 hrs | M = half day

---

## Recommended Implementation Order

**Day 1 (Quick Wins — no migration, no risk):**
1. P0-C: Enable `OPENROUTER_COST_PER_1K_TOKENS` (env var, 5 min)
2. P0-A: Fix `"indiana"` keyword collision (15 min)
3. P0-B: Add `location_tags` to `buildJobPrompt` (15 min)
4. P1-A: Remove duplicate `resume.skills` from system prompt (5 min)

**Day 2 (Skill and data improvements):**
5. P1-E: Verify/fix C/C++ alias collision (30 min including unit test)
6. P1-D: Expand skills dictionary (1 hr — focus on Kafka, dbt, Snowflake, Ansible, Prometheus, Grafana)

**Day 3 (Prompt data and backfill):**
7. P1-B: Add `min_years` to `buildJobPrompt`
8. P1-C: Run backfill script (validate with dry-run first)
9. P2-A: Truncate `parsedText`
10. P2-B: Truncate `job.description`

**Week 2 (Structural improvements):**
11. P2-E: Title-only role matching (tiered approach)
12. P2-C: Freshness filter on dashboard
13. P2-D: Scope `notifications_log` to `(job_id, role_selection_id)`

**Defer indefinitely:**
- Scoring rubric changes
- Resume section parsing / structural weighting
- Keyword score formula redesign (requires empirical score distribution data first)

---

## Quick Wins

Items completable within one day with no migration, no schema change, and no prompt instruction rewrite:

| # | What | Where | Time | Impact |
|---|---|---|---|---|
| 1 | Set `OPENROUTER_COST_PER_1K_TOKENS` env var | Environment config | 5 min | Enables cost visibility for all future improvements |
| 2 | Fix `"india"` → bounded keyword in `location-keywords.ts` | `src/shared/config/location-keywords.ts` | 15 min | Eliminates Indiana/India false positives |
| 3 | Add `location_tags` to `buildJobPrompt` | `OpenRouterAiScoreProvider.ts:53` | 15 min | AI gets structured geography on every call |
| 4 | Remove `resume.skills.join(", ")` from `buildSystemPrompt` | `OpenRouterAiScoreProvider.ts:40` | 5 min | Saves 20–80 tokens/call, zero quality loss |
| 5 | Add `min_years` field to `buildJobPrompt` | `OpenRouterAiScoreProvider.ts:49–57` | 10 min | AI can score seniority alignment explicitly |

Together these five changes: fix one confirmed false-positive source, add two high-signal data fields to the AI prompt, and reduce token consumption — all without touching any instructions, migrations, or infrastructure.

---

## Would I Change The Prompt Today?

**NO** — for the scoring instructions / rubric.

There is no score distribution baseline. There is no outcome data. Without knowing whether current scores in the 0.6–0.8 range represent good matches or poor ones, rewriting the scoring rubric is speculation. Changes to the instructions risk introducing bias that cannot be detected or measured.

**YES** — for the data passed into the prompt (P0-B and P1-B).

Adding `location_tags` and `min_years` to the job prompt are not instruction changes — they fix what information the AI receives. The AI's instructions stay identical; it simply has better input. Both fields are:
- Already computed deterministically
- Already stored in the database
- Currently absent from the prompt despite being on the `Job` object
- Independently verifiable (the AI's `ai_reasoning` will start mentioning location and experience alignment, which is observable)

The distinction matters: **data additions to the prompt are deterministic fixes disguised as prompt changes.** They follow Caveman Principle 2 (prefer existing metadata) and Principle 4 (prefer measurable improvements). They do not follow the spirit of "AI changes" any more than fixing a broken SQL query does.

Everything else — rubric, weighting guidance, resume structuring, role targeting — waits until cost tracking is enabled and a score distribution sample exists.
