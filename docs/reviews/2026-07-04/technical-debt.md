# Technical Debt Report — v1.2 Bug Hunt (Phase 1)

## Method

A read-only audit (Explore agent, model haiku) covered: cron scripts (`scrape.ts`/`score.ts`/`notify.ts`), ingest/dedup/fingerprint logic, scoring retry logic, all migrations (index coverage, duplicate names, RLS), notification delivery consistency, and a repo-wide search for `TODO`/`FIXME`/`HACK`/`XXX`, swallowed catch blocks, `any` usage, and duplicate utility functions.

No `TODO`/`FIXME`/`HACK`/`XXX` markers exist anywhere in `src/` or `scripts/` — the prior hardening passes (see `docs/reviews/pipeline-stabilization-handoff.md`, `docs/reviews/high-findings-resolution.md`) already cleared these.

## Bug found and fixed

**`filterMatches.ts` skill filter used a different text source than scoring** — `src/features/notifications/application/filterMatches.ts:42` called `extractSkills(match.description, ...)`, while `scoreJob.ts:31` (the function that actually determines keyword/AI score) calls `extractSkills(`${job.title}\n${job.description}`, ...)`. A job whose only mention of a skill was in the title (e.g. title "React Developer", description "We're looking for a developer") would score highly during scoring but then be silently dropped by a notification preference filtering on that same skill — the two functions disagreed about what "the job's text" was.

**Fix:** `filterMatches.ts` now uses `${match.title}\n${match.description}`, matching `scoreJob.ts` exactly. Regression test added (`filterMatches.test.ts`: "passes when a skill appears only in the title, not the description").

This is the only concrete, verifiable bug found. Everything else already documented in `design/limitations.md` (indefinite-retry notification failures, at-least-once digest delivery, etc.) is a known, deliberate tradeoff, not a new finding.

## Debt identified but not changed (judgment calls, not bugs)

1. **`docs/database.md`'s inline `create table jobs (...)` listing is stale.** It predates `fingerprint`, `contact_email*`, `salary_*`, and now `employment_type`/`seniority`/`work_arrangement`/`visa_sponsorship`/`relocation_assistance`/`security_clearance`/`urgent_hiring`. `design/erd.md` is the source of truth and *was* updated this pass (CLAUDE.md's Document Maintenance table only mandates `design/`). Recommend either deleting the redundant `create table` block from `docs/database.md` in favor of a pointer to `design/erd.md`, or doing a one-time full sync — flagged rather than done here to avoid touching an unrelated doc's structure mid-feature-work.

2. **`scripts/source-analytics.ts` and `scripts/filter-analysis.ts` query the Supabase client directly** instead of going through `SupabaseScrapeRunRepository` (which `scripts/report-sources.ts` correctly uses). CLAUDE.md mandates the Repository Pattern for the app; these are standalone read-only CLI diagnostics, not app runtime, so the risk is low, but it's an inconsistency worth knowing about before adding more scripts in this style.

3. **`report-sources.ts` and `source-analytics.ts` have overlapping (not identical) responsibilities** — both compute per-source metrics from `scrape_runs`, one focused on "last run + recent failures", the other on "30-day aggregate + low performers". Not true duplication (different windows, different output), so left as two scripts rather than force-merged; both are now wired into `package.json` (`report:sources`, `analytics`, and combined under `diagnose`) so they're at least discoverable.

4. **`JobMatch` test fixtures (`makeMatch()`) are re-implemented in 9 separate files** under `src/features/notifications/application/*.test.ts`, each with different baseline field values reflecting that file's own test narrative. This pass touched all 9 to add the new `employmentType`/`urgentHiring`/`salary*` fields rather than consolidating them into one shared factory — the baseline values genuinely differ per file (this isn't copy-paste-identical duplication), and a forced consolidation would mostly just relocate boilerplate rather than remove it. Worth revisiting if a 10th field is ever added to `JobMatch`.

## Deferred extraction signals (v1.2 scope decision)

`extractJobAttributes.ts` (Phase 2) intentionally does not cover notice period, shift work, travel requirements, or "graduate program" as a distinct category from seniority/employment-type — see `design/limitations.md` §1.11 and the v2.0 roadmap in the main report.
