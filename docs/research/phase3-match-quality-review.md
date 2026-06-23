# Phase 3 — Match Quality Investigation

**Date:** 2026-06-23
**Scope:** Investigation only. No implementation, no migrations, no prompt changes.
**Method:** Three parallel sub-agents (Experience Matching, HR Contact Audit, Match Quality Opportunities) + integration.

---

## Executive Summary

Match quality has three high-ROI improvement vectors that require zero AI/prompt changes:

1. **Experience filter is largely inactive** — `min_years` is `NULL` on the majority of the corpus (pre-P2 rows never backfilled), making the experience soft-filter ineffective. A backfill script and seniority-label expansion of `parseMinYears` would raise filter coverage from ~20–30% to ~60%+ overnight.

2. **RemoteOK wastes every cron run** — 0% keep rate due to location mismatch. A one-line `locationRaw` default or an env-var disable eliminates this dead weight immediately.

3. **Several deterministic improvements exist in existing data** — `min_years` display in dashboard, `postedAt` freshness filter, `location_tags` in AI prompt, threshold constant deduplication — all achievable with small, isolated changes to existing code.

HR contact extraction is feasible but low-yield (~5–15% of jobs). ATS sources (Greenhouse/Lever/Ashby), which dominate the corpus, rarely embed recruiter emails in descriptions. The highest yield would come from MyCareersFuture and Wellfound.

Cross-source duplicate detection and `notifications_log` role-scoping are medium-effort improvements with meaningful impact but carry migration risk.

---

## Experience Matching Findings

### Current State

Experience matching is a soft-filter pipeline introduced in Phase P2:

1. **Parse** (`src/features/jobs/application/parseMinYears.ts`): regex extracts `min_years` from `title + "\n" + description` at ingest. Returns `null` for unknowns.
2. **Store**: `jobs.min_years integer` (nullable). No DB constraint, no index.
3. **Dashboard filter** (`SupabaseJobRepository.findForDashboard`): `.or("min_years.is.null,min_years.lte.N")` — null always passes.
4. **Notification filter** (`filterMatches.ts` → `passesExperienceFilter`): in-memory min/max bounds, null always passes.

### Findings

**EXP-1 — No backfill on pre-P2 rows (highest impact)**
`parseMinYears` is called only at ingest. All rows inserted before P2 deployment retain `min_years = NULL`. The experience filter has near-zero effectiveness on the historical corpus. Phase P2 docs explicitly note: "No backfill was done on initial deploy." Active jobs from before P2 remain NULL until re-scraped — jobs that went inactive before re-scraping never receive a value.

**EXP-2 — Level labels produce NULL (second-highest impact)**
The regex `(\d{1,2})\s*(?:\+|-\s*\d{1,2})?\s*(?:years?|yrs?)\b` handles numeric patterns correctly but ignores seniority labels entirely:
- `"Senior Engineer"` → `null`
- `"Junior Developer"` → `null`
- `"Staff/Principal/Lead"` → `null`
- `"Entry Level"` → `null`

These are common in postings that omit explicit year counts. All of them always pass the filter regardless of the user's `maxYears` setting.

**EXP-3 — False negatives from non-experience "years" context**
The regex has no context guard. Sentences like `"We've been in business for 15 years. No experience required."` yield `min_years = 15`, incorrectly excluding an entry-level job when `maxYears = 5`. Other false-positive triggers: `"founded 8 years ago"`, `"product used for 5 years"`.

**EXP-4 — No DB constraint on `min_years`**
Migration `20260616000002_experience.sql` adds the column with no `CHECK` constraint. The application-level clamp (`value <= 20`) is the only guard. A future code path could write `-1` or `999`, silently corrupting the filter.

**EXP-5 — `minExperience` lower-bound not wired to any UI**
`passesExperienceFilter` in `filterMatches.ts` supports both `minExperience` and `maxExperience` for notifications. Only `maxExperience` is wired via `desiredExperience`. Users cannot filter out entry-level jobs from notifications.

**EXP-6 — `min_years` absent from `DASHBOARD_SELECT`**
`DASHBOARD_SELECT` in `SupabaseJobRepository.ts:38` omits `min_years`. The dashboard cannot display experience requirements per job. Users have no visual feedback about why a job was excluded by the experience filter.

**EXP-7 — `?maxYears` URL param has no upper bound**
`dashboard/page.tsx` accepts any integer `>= 0` for `?maxYears`. The settings validation caps at 50 but the URL param does not. Benign today (no job has `min_years > 20`) but inconsistent.

### Recommendations

| ID | Recommendation | Mechanism | Files |
|---|---|---|---|
| E1 | Backfill `min_years` on all existing NULL rows | Pure TS script, batched UPDATEs | New `scripts/backfill-min-years.ts` |
| E2 | Expand `parseMinYears` with seniority labels | Deterministic regex additions | `src/features/jobs/application/parseMinYears.ts` |
| E3 | Add `CHECK` constraint on `min_years` | SQL migration (1 line) | New migration |
| E4 | Add `min_years` to `DASHBOARD_SELECT` + `JobWithScore` + `JobRow` | SQL select + TS types + UI | `SupabaseJobRepository.ts`, `types.ts`, `JobRow.tsx` |
| E5 | Add `minExperience` setting (lower bound) | New `app_settings` key, wire to dashboard | Settings repo + `ExperienceCard` + `findForDashboard` |
| E6 | Cap `?maxYears` at 50 in URL param parser | 1-line validation change | `dashboard/page.tsx` |

---

## HR Contact Findings

### Current State

No recruiter contact fields exist anywhere in the schema or pipeline. `jobs` has no `contact_email`, `recruiter_name`, or `apply_url` (the ATS apply URL is stored as `jobs.url`). `JobMatch` (used by Telegram digest at `src/features/notifications/domain/types.ts:35–46`) exposes `url`, `description`, `title`, `companyName`, `locationTags`, `source`, `aiScore`, `aiReasoning`, `minYears` — nothing contact-related. No email extraction logic exists anywhere in `src/`.

### Findings

**HR-1 — ATS platform is already identifiable from `jobs.source` (zero parsing needed)**
`jobs.source IN ('greenhouse','lever','ashby')` identifies the ATS platform precisely. The board token (company slug) is recoverable from `jobs.url` for all three via URL parsing:
- Greenhouse: `https://boards.greenhouse.io/{token}/jobs/{id}`
- Lever: `https://jobs.lever.co/{token}/{uuid}`
- Ashby: `https://jobs.ashbyhq.com/{token}/{uuid}`

No URL parsing is needed if only the platform is required.

**HR-2 — Email prevalence in `description` is low for ATS sources (~5%)**
`description` is stored as stripped plain text (`src/shared/infrastructure/text.ts:17–28`). Recruiter emails in ATS-hosted job descriptions are rare because all applications flow through the ATS's hosted form. Estimated prevalence by source:

| Source | Email in description likelihood |
|---|---|
| Greenhouse | < 5% |
| Lever | < 5% |
| Ashby | < 5% |
| Wellfound | 10–20% |
| RemoteOK | 5–10% |
| MyCareersFuture | 15–25% |

Overall corpus estimate: **5–15%**. ATS sources likely dominate volume, making the effective yield lower than the average.

**HR-3 — Email extraction is feasible as a pure, zero-schema function**
A standard email regex applied to the existing `description` field in `JobMatch` can be called at display/notification time with no schema change, no migration, and no AI call:

```typescript
// src/shared/infrastructure/text.ts
const EMAIL_REGEX = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/;
export function extractRecruiterEmail(text: string): string | null {
  const match = EMAIL_REGEX.exec(text);
  return match ? match[0] : null;
}
```

**HR-4 — Telegram digest supports mailto: buttons natively**
Telegram inline keyboard buttons support `url` type with `mailto:` scheme. `buildDigestKeyboard.ts` already constructs inline keyboards. Adding a conditional `📧 Contact` button when an email is extracted requires ~5 lines in `formatDigestMvp.ts`.

**HR-5 — Per-job ATS API detail calls yield no recruiter email**
Greenhouse's `/v1/boards/{token}/jobs/{id}` and Lever's posting endpoint include structured metadata (department, team) but not recruiter email addresses — those are internal and not exposed by public board APIs. Not worth pursuing.

### Recommendations

| ID | Recommendation | Mechanism | Files |
|---|---|---|---|
| H1 | Add `extractRecruiterEmail(text)` pure function | Regex, zero schema change | `src/shared/infrastructure/text.ts` |
| H2 | Surface email in Telegram digest as optional button | Conditional `mailto:` inline button | `src/features/notifications/infrastructure/formatDigestMvp.ts`, `buildDigestKeyboard.ts` |
| H3 | Surface email in dashboard job detail view | `mailto:` link from existing `description` | `src/components/dashboard/JobRow.tsx` or detail panel |
| H4 (future) | ATS source badge in digest | `source` already in `JobMatch` | `formatDigestMvp.ts` line 27 — 1-line change |

---

## Match Quality Opportunities

### Current State

Jobs are scored via two-stage pipeline: deterministic keyword overlap (`computeKeywordScore`) → OpenRouter AI call gated at `KEYWORD_THRESHOLD = 0.25`. Telegram digests deliver Strong Match (`>= 0.80`) and Worth Reviewing (`0.75–0.80`). Six sources are scraped every 2 hours; ~25 of 38 configured companies are unhealthy.

### Findings

**MQ-1 — RemoteOK produces 0% keep rate on every cron run**
`RemoteOkScraper` maps `entry.location` to `locationRaw` as-is (e.g., `"North America"`, `"USA Only"`, `"Worldwide"`). None match `LOCATION_KEYWORD_RULES`. The scraper fetches the full global feed (~1000 entries) every 2 hours, runs `jobMatchesRoles` on all, then `tagLocations` drops 100%. `scrape_runs` shows `kept_count = 0`, `inserted_count = 0` every run. Pure waste.

**MQ-2 — Cross-source duplicates receive independent notifications**
`dedupeKey` is `${source}:${sourceJobId}`. Same position on Greenhouse and Wellfound generates two `jobs` rows, two `job_scores` rows, and two Telegram notifications. `notifications_log` UNIQUE is on `job_id` — different IDs, so no suppression. No cross-source dedup exists anywhere.

**MQ-3 — `location_tags` not used in scoring**
`location_tags` (GIN-indexed `text[]`) is populated and used as a dashboard filter, but never passed to `computeKeywordScore` or `buildJobPrompt`. `buildJobPrompt` sends `job.locationRaw` (unstructured string) to the AI. Adding `location_tags` to the prompt costs ~5 tokens per job and gives the AI explicit structured geography context.

**MQ-4 — Stale jobs linger for up to 14 days**
`JOB_EXPIRATION_DAYS=14` (default). A job removed from an ATS board can remain active in the feed and trigger notifications for up to 14 days. `JOB_EXPIRATION_DAYS` is already an env var — no code change needed to reduce this.

**MQ-5 — `postedAt` stored but never used as a filter**
`jobs.posted_at` is populated from ATS sources (Lever: epoch ms always present; MCF: `createdAt` reliable; Greenhouse: mapped from `updated_at`). It's used only as a sort key. No `maxAge` filter exists in `JobFilters`. Users cannot filter to recent postings.

**MQ-6 — `notifications_log` not scoped to `role_selection_id`**
`UNIQUE (job_id)` with no `role_selection_id`. Switching roles permanently silences all previously-notified jobs for the new role. `findUnnotifiedMatches` returns 0 for such jobs even if they score above threshold for the new role configuration.

**MQ-7 — `STRONG_MATCH_THRESHOLD` hardcoded as string literal in 2 files**
`STRONG_MATCH_THRESHOLD = 0.80` is defined in `src/features/notifications/domain/types.ts:10` but `scripts/notify.ts` and `src/app/api/telegram/webhook/route.ts:139` use the string `"0.80"` directly in deep-link URLs. Changing the constant would silently leave the URLs wrong.

**MQ-8 — Keyword score formula favours short skill lists**
`computeKeywordScore` = `|resumeSkills ∩ jobSkills| / |jobSkills|`. A job requiring 1 skill the resume has scores `1.0`; a job requiring 10 where the resume matches 5 scores `0.5`. Generic/boilerplate postings with 1–2 skill mentions score disproportionately high, wasting AI calls. Inverse: dense skill lists with partial overlap fall below the 0.25 gate and are silently dropped even when the actual match is strong.

**MQ-9 — `min_years` backfill (see Experience section)**
Already covered under EXP-1. Listed here as it directly affects match quality visible to users.

**MQ-10 — No freshness signal in digest**
The Telegram digest includes `posted_at`-sorted results but doesn't show job age to users. A job from 13 days ago looks identical to one from today in the digest message. Users waste time on expired positions.

---

## Effort vs Impact Matrix

| ID | Opportunity | Impact | Effort | Risk | Mechanism |
|---|---|---|---|---|---|
| OPP-1 | Backfill `min_years` on existing NULL rows | **H** | L | L | TS script |
| OPP-2 | Expand `parseMinYears` with seniority labels | **H** | L | L | Pure TS |
| OPP-3 | Disable RemoteOK or fix `locationRaw` default | **M** | L | L | Env var / 1-line |
| OPP-4 | Add `min_years` to dashboard select + UI | M | L | L | SQL + TS + UI |
| OPP-5 | Add `postedWithinDays` freshness filter | M | L | L | SQL predicate + UI |
| OPP-6 | Add `location_tags` to AI prompt | M | L | L | 1-line TS |
| OPP-7 | Reduce `JOB_EXPIRATION_DAYS` to 7 | M | L | L | Env var only |
| OPP-8 | Fix `STRONG_MATCH_THRESHOLD` deep-link literals | L | L | L | TS import fix |
| OPP-9 | Regex email extraction (zero schema) | L | L | L | Pure TS function |
| OPP-10 | `notifications_log` scoped to `role_selection_id` | M | M | M | Migration |
| OPP-11 | Cross-source duplicate detection via URL index | M | M | M | Migration + TS |
| OPP-12 | Add `minExperience` lower-bound setting | M | M | L | Settings + UI |
| OPP-13 | Add `CHECK` constraint on `min_years` | L | L | L | 1-line migration |

---

## Recommended Implementation Order

### P0 — Do immediately (< 2 hours each, zero migration risk)

**P0-A: Fix RemoteOK location default**
Change `RemoteOkScraper.ts` to default `locationRaw` to `"remote"` when `entry.location` is empty or unrecognised. RemoteOK is an exclusively-remote job board; this is semantically correct. Alternatively set `REMOTEOK_DISABLED=true` in the env if remote jobs are not currently desired.
- File: `src/features/sources/infrastructure/remoteok/RemoteOkScraper.ts`
- Change: `locationRaw: normalizeWhitespace(entry.location || "remote")`

**P0-B: Reduce `JOB_EXPIRATION_DAYS` to 7**
Environment variable change only, no code change.

**P0-C: Fix `STRONG_MATCH_THRESHOLD` deep-link literals**
Import the constant; remove the `"0.80"` string literals.
- Files: `scripts/notify.ts`, `src/app/api/telegram/webhook/route.ts:139`

**P0-D: Add `CHECK` constraint on `min_years`**
One-line migration. Pure defensive improvement.
```sql
ALTER TABLE jobs ADD CONSTRAINT jobs_min_years_range
  CHECK (min_years IS NULL OR (min_years >= 0 AND min_years <= 20));
```

### P1 — High-ROI, one day or less

**P1-A: Backfill `min_years` on existing NULL rows (OPP-1)**
New script `scripts/backfill-min-years.ts`. Reads `jobs WHERE min_years IS NULL AND description IS NOT NULL` in batches of 500, calls `parseMinYears(title + '\n' + description)`, issues batched UPDATEs via service-role client. Immediately activates the experience filter for the existing corpus.

**P1-B: Expand `parseMinYears` with seniority label patterns (OPP-2)**
Add patterns to `parseMinYears.ts`:
- `"entry level"` / `"junior"` → `0`
- `"mid-level"` / `"mid level"` → `3`
- `"senior"` (in title only, not description body) → `5`
- `"lead"` / `"staff"` / `"principal"` → `8`

Must anchor carefully to title segment and add tests for each new pattern.

**P1-C: Add `min_years` to `DASHBOARD_SELECT` and `JobRow` display (OPP-4)**
- Add `min_years` to `DASHBOARD_SELECT` string and `toDashboardJob` mapper
- Add `minYears?: number | null` to `JobWithScore`
- Render `"${job.minYears}+ yrs"` badge in `JobRow.tsx`

**P1-D: Add `location_tags` to `buildJobPrompt` (OPP-6)**
One-line change in `src/features/scoring/infrastructure/OpenRouterAiScoreProvider.ts:49–57`:
```typescript
`Location: ${job.locationRaw} (tags: ${job.locationTags.join(', ')})`
```
Costs ~5 tokens per AI call. Gives the AI structured geography context instead of raw string.

**P1-E: Add `postedWithinDays` freshness filter (OPP-5)**
Add to `JobFilters`, wire SQL predicate with null-safe OR in `findForDashboard`, add UI control to FilterBar. Soft filter — skip when `posted_at IS NULL`.

### P2 — Medium effort, assess after P1

**P2-A: Scope `notifications_log` to `role_selection_id` (OPP-10)**
Migration adds `role_selection_id` column, changes unique constraint to `(job_id, role_selection_id)`. Updates `markNotified` and `findUnnotifiedMatches` in `SupabaseNotificationRepository.ts`. Fixes silent suppression when switching roles.

**P2-B: Cross-source duplicate detection (OPP-11)**
Add unique index on `jobs.url`, handle upsert conflict at the repository layer. Prevents dual-notification for same position across sources. Assess scope — Wellfound URLs may differ from Greenhouse URLs for the same job.

**P2-C: `minExperience` lower-bound setting (OPP-12)**
New `app_settings` key `desired_min_experience_years`. Wire to `findForDashboard` and `ExperienceCard` UI. Domain and application layer scaffolding (`passesExperienceFilter`) already exists.

**P2-D: Regex email extraction in Telegram digest (OPP-9)**
Add `extractRecruiterEmail(text)` to `src/shared/infrastructure/text.ts`. Call from `formatDigestMvp.ts` — add conditional `📧 Contact` `mailto:` button to inline keyboard. Zero schema change. Expected yield ~5–15% of jobs.

---

## Quick Wins

Changes completable in under 1 day, no migration risk:

| Win | What to change | Where |
|---|---|---|
| Fix RemoteOK 0% keep rate | Default `locationRaw` to `"remote"` when blank | `RemoteOkScraper.ts` |
| Halve stale-job window | Set `JOB_EXPIRATION_DAYS=7` | `.env` / deployment config |
| Fix threshold literal duplication | Import `STRONG_MATCH_THRESHOLD` constant | `notify.ts`, `webhook/route.ts` |
| Add `min_years` DB constraint | 1-line SQL migration | New migration file |
| Backfill `min_years` | New backfill script, no schema change | `scripts/backfill-min-years.ts` |
| Show `min_years` in dashboard | Add to select + type + `JobRow` badge | 3 files, no migration |
| Add `location_tags` to AI prompt | 1-line change in `buildJobPrompt` | `OpenRouterAiScoreProvider.ts` |

---

## Future Work

The following are deferred because evidence does not yet justify the complexity:

**Cross-source dedup via URL index** — Feasible but the same job on Greenhouse vs. Wellfound may have different URLs (Wellfound wraps the posting). Effectiveness depends on URL overlap rate, which requires sampling production data before committing to a migration.

**Notifications log role-scoping** — High value when users actively switch roles, but this is a single-user platform and role switching is infrequent. Re-evaluate if multi-role usage increases.

**Written-digit experience parsing** (`"two years"` → `2`) — Low ROI; ATS postings overwhelmingly use numerals. Not worth the regex complexity.

**Phone number extraction from descriptions** — Noisier than email; phone numbers appear in many non-contact contexts. Implement only if email extraction (H1) proves valuable and MCF/Wellfound are high-traffic sources.

**Keyword score formula rebalancing** — The `|resumeSkills ∩ jobSkills| / |jobSkills|` metric has a known bias toward short skill lists. Fixing requires changing `computeKeywordScore` and re-validating the `KEYWORD_THRESHOLD`. Medium complexity, non-trivial risk of regression. Requires a scoring audit with real data before touching.
