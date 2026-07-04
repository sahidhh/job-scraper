# Theme 5 — Source Quality & Operations

**Date:** 2026-07-04 (continuous-improvement session)
**Scope:** Further improve operational excellence; avoid redesigning existing systems.

## Investigation Summary

This theme had the most prior investment of any theme going into this session — Phase 1/4 of earlier
work already built `computeSourceHealthSummary`/`getSourceHealthReport` (success rate, latency,
consecutive failures, recovery detection, failure-category classification, rule-based recommendation),
`getScoringQueueReport` (AI-retry queue depth/age/stuck jobs), and surfaced both on `/analytics`. Several
scripts already exist for diagnostics (`validate-sources.ts`, `source-analytics.ts`, `report-sources.ts`,
`filter-analysis.ts`).

One genuine, confirmed-absent gap was found: nothing distinguished "a source that has stopped running
entirely" from "a source that is running and failing." `consecutiveFailures` only increments on an actual
`scrape_runs` row — a source silently dropped from `JOB_SOURCES`, a crashed job that skipped it, or a
mis-registered entry produces **no row at all**, so the existing signal is blind to it.

Per-source salary/contact-email coverage percentages and a single merged "source quality score" were
investigated and are documented as skipped below — not because they're bad ideas, but because the value
relative to complexity/maintenance was judged lower than the stale-detection gap, and implementing them
would risk exactly the kind of "invent work to fill the roadmap" the mission explicitly warns against.

## Implemented

**Stale source detection** — `SourceHealthSummary.isStale`/`hoursSinceLastRun`
(`computeSourceHealthSummary.ts`), gated on `SOURCE_HEALTH_CONFIG.staleAfterHours` (env
`SOURCE_STALE_HOURS`, default 6h — 3x the ~2h scrape cadence, allowing one missed run of tolerance before
flagging). The recommendation text now leads with staleness ("Stale -- no run in Nh...") ahead of a
failing-streak message when both would otherwise apply, since "hasn't run at all" is the more urgent,
more actionable signal. Surfaced on `/analytics`'s `ScrapeRunHealthTable` as an orange "stale" badge,
sorted to the top of the table (ahead of `consecutiveFailures` ordering).

## Skipped (with rationale)

- **Per-source salary/contact-email coverage %** — confirmed absent (neither metric is computed anywhere
  today, grouped by source or otherwise). Evaluated as a new pure function + two new narrow repository
  queries, following the exact `computeSalaryStats`-style pattern already established. Judged **lower
  priority than stale detection** for this pass: coverage is a data-quality observability metric with no
  actionable next step wired to it yet (no threshold, no alert, no recommendation) — it would be a new
  chart with no decision attached, whereas stale detection directly answers "is my pipeline actually
  running." Reasonable follow-up if/when salary or contact-email data quality becomes a stated concern.
- **Unified "source quality score"** — `design/limitations.md` already documents that the two existing
  health signals (`companies.health_status`, probe-driven; and the `scrape_runs`-derived summary) are
  *intentionally* not merged, because reconciling a disagreement between them is a real product decision,
  not a UI layout choice (`docs/decisions.md` AD-24). A third, unifying "quality score" would face the same
  problem one level up — it would need to decide how to weight success rate vs. latency vs. staleness vs.
  keep-rate (from `source-analytics.ts`) into one number, which is exactly the kind of judgement call this
  session's constraints ask to defer rather than guess at without real operational data.
- **Retry improvements / new diagnostics scripts** — `score.ts` already retries indefinitely
  (`docs/decisions.md` AD-14) and logs a stuck-job warning past `SCORING_STUCK_THRESHOLD_HOURS`; no gap was
  found in retry *logic* itself, only in visibility, which Phase 1 already addressed. No new script was
  found to be missing — the existing five (`validate-sources`, `source-analytics`, `report-sources`,
  `filter-analysis`, `backfill-*`) cover validation, analytics, per-source reporting, filter-funnel
  analysis, and one-time backfills respectively; no clear gap in operator tooling was identified.

## Files Changed

- `src/features/sources/domain/sourceHealthConfig.ts` (+`staleAfterHours`)
- `src/features/sources/application/computeSourceHealthSummary.ts` (+test, rewritten with explicit `now`)
- `src/features/insights/ui/ScrapeRunHealthTable.tsx` (stale badge + sort)
- `design/architecture.md`, `design/scope.md`, `design/tech-stack.md`, `design/user-guide.md`

## Testing

`npx tsc --noEmit`, `npx vitest run` (11 `computeSourceHealthSummary` tests, including 3 new staleness
cases and the full existing suite re-pinned to explicit `now` values so they don't silently start failing
as real time advances), `npm run build` — all pass.

## Impact

- **Operational visibility**: closes a real blind spot — a source quietly dropped from the scrape run
  (config error, code change, crash) previously looked identical to "healthy, just hasn't needed to run
  yet," and now surfaces distinctly and with priority.
- **Reliability**: purely additive (new field + new config value), no change to existing health-signal
  behavior for sources that are actively running.

## Remaining Opportunities

- Coverage-percentage metrics and a unified quality score remain reasonable ideas, ranked "Nice to Have" /
  "Not Worth Building (yet)" respectively in the final backlog — see the overall report.
