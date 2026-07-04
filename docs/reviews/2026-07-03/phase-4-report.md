# Phase 4 Report — Analytics

**Date:** 2026-07-03
**Branch:** `claude/job-scraper-stabilization-s8mzi5`
**Commit:** `030dd70`

## Objective

Provide useful operational dashboards covering pipeline metrics (jobs/day, duplicates, failures,
pending, throughput, latency), source metrics (health, failures, recovery, disabled sources), AI
metrics (token usage, cost, retries, average score), and job metrics (companies, locations, skills,
salary, remote percentage).

## Implementation Summary

- **Wired Phase 1's backend-only reports into UI for the first time**: `getSourceHealthReport`
  (new `ScrapeRunHealthTable` component) and `getScoringQueueReport` (new `ScoringQueueStatsCards`)
  are now called directly from `analytics/page.tsx`, following the page's existing
  direct-repository-in-server-component pattern (no new server action).
- Added as **separate, clearly labeled sections** alongside the existing probe-based
  `SourceHealthTable`, not merged — the two source-health signals are documented as independent and
  can disagree (AD-18); showing both is more honest than silently reconciling them.
- Four new pure aggregation functions in `features/insights/application/`, each following the
  established `computeX(rows) -> DTO[]` pattern: `computeJobsByCompany` (top 10 companies),
  `computeSalaryStats` (avg min/max grouped by currency), `computeRemoteStats` (remote job %),
  `computePipelineStats` (failed-run count, duplicates skipped, avg scrape latency across every
  scrape_runs row regardless of status).
- Three new narrow `MatchedJobsRepository` queries: `getJobsCompanyData`, `getJobsSalaryData`,
  `getScrapeRunStats` — each a single unbounded `select` on `jobs`/`scrape_runs`, consistent with the
  existing in-memory-aggregation approach (`design/limitations.md` §7.1).
- New chart/stat-card UI components in `AnalyticsCharts.tsx` (`JobsByCompanyChart`,
  `SalaryStatsCards`, `RemoteStatCard`, `PipelineStatsCards`) plus the two new table/card components
  above.

## Database Changes

None — Phase 4 only added application/infrastructure/UI code reading existing columns (including
Phase 2's `salary_*`/`contact_email*` and Phase 1's `fingerprint`/`failure_category`/`retry_count`).

## Architecture Decisions

`docs/decisions.md` AD-24 — full rationale for the "separate sections, not merged" choice and the
verification caveat below.

## Testing

- 567 tests passing (up from 552 at end of Phase 3). New coverage: `computeJobsByCompany` (3),
  `computeSalaryStats` (4), `computeRemoteStats` (3), `computePipelineStats` (2), plus 3 new
  `SupabaseMatchedJobsRepository` method tests.
- `npx tsc --noEmit` clean, `npm run build` succeeds (Next.js's build-time type-checking covers the
  new page/component wiring), `npm run check:service-role-boundary` passes.
- **Not live-browser-verified.** This sandboxed session has no `NEXT_PUBLIC_SUPABASE_URL`/
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` configured, so the dev server cannot authenticate a session or
  reach a real Supabase project — `/analytics` was never actually rendered in a browser this
  session. Verification is limited to static typechecking, the mocked-Supabase-client unit test
  suite, and a successful production build. This is a real gap, not a formality — recommend a
  manual smoke test of `/analytics` (all new sections, including the "no active role/resume" empty
  state for the scoring queue) as the first thing to do with real credentials.

## Performance Impact

`/analytics` now makes more DB round trips per page load: 3 new narrow queries
(`getJobsCompanyData`, `getJobsSalaryData`, `getScrapeRunStats`), `getSourceHealthReport`'s 6
per-source `scrape_runs` queries, and `getScoringQueueReport`'s 1 `job_scores` query. All are
unbounded (no `.limit()`), consistent with the existing pattern's scale assumptions — not a new
class of problem, but analytics page load time will grow somewhat with dataset size, same caveat as
every other chart on this page (`design/limitations.md` §7.1).

## Risks

- Live-browser-unverified (see Testing above) — the single biggest risk from this phase.
- `getScoringQueueReport` requires both an active role selection and an active resume; the page
  renders a plain "nothing queued" message when either is missing rather than crashing, but this
  path itself is also unverified in a real browser.

## Sign-off

Phase 4 (Task 13) complete. Build, typecheck, and full test suite green. Pushed to
`claude/job-scraper-stabilization-s8mzi5`. **All four mission phases (1-4) are now complete.**
