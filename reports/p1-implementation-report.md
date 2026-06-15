# P1 Implementation Report

Implements the 6 P1 items from `reports/ui-improvement-plan.md`. No new
architecture, no new dependencies — class-name/layout changes, theme tokens,
and query refinements within the existing repository pattern, server
components, and shadcn/Tailwind component set.

## Changes

### P1 #1 — Responsive table columns
`JobsTable`/`JobRow`, `CompaniesTable`, `NotificationsLogList`,
`ScrapeRunsList` — secondary columns get `hidden md:table-cell`:
- Jobs: Location, Source hidden on mobile; Title, Company, Score, Link stay.
- Companies: Source, Board token hidden; Name, Status, Actions stay.
- Notifications: Source, Sent at hidden; Job, Company stay.
- Scrape runs: Run at, Error hidden; Source, Status, Jobs found stay.

### P1 #2 — FilterBar layout + Suspense
`src/components/dashboard/FilterBar.tsx`: wrapper changed to
`flex flex-col gap-2 sm:flex-row`, each control `w-full sm:w-40`/`sm:w-32`
(mirrors `ResumeUploadCard`'s mobile-first pattern) — no more overflow on
~343px viewports.

`src/app/(protected)/dashboard/page.tsx`: split the former `DashboardJobs`
into:
- `DashboardContent` — fetches `companies`/`scrapeRuns` (filter-independent),
  renders the "no companies" banner.
- `JobsSection` (wrapped in `<Suspense fallback={<JobsSectionFallback />}>`) —
  fetches `jobs` via `findForDashboard` (filter-dependent), renders the
  status line, pending-AI banner, `FilterBar`, `JobsTable`, "Load more".

The page shell and companies banner now stream immediately; only the
jobs/table region suspends on the filtered query.

### P1 #3 — Theme color tokens
`src/app/globals.css`: added `--success`/`--warning`/`--info` (+
`-foreground`) tokens for light and dark, following the `--destructive`
pattern, registered in `@theme inline`.

`src/components/ui/badge.tsx`: added `success`/`warning`/`info`
`badgeVariants`.

Applied to:
- `ScrapeRunsList` `STATUS_VARIANT`: `success` → `success` (green),
  `partial` → `warning` (amber), `failed` stays `destructive`.
- `JobRow`'s `ScoreBadge`: replaced ad-hoc `green-*`/`yellow-*` Tailwind
  classes with `success`/`warning`/`outline` badge variants for the AI
  score tiers (same ≥0.75 / ≥0.4 bands).

### P1 #4 — Trim `description` from the dashboard query
`src/features/jobs/domain/types.ts`: `JobWithScore` is now
`Omit<Job, "description"> & { keywordScore, aiScore, aiReasoning }`.

`src/features/jobs/infrastructure/SupabaseJobRepository.ts`:
`findForDashboard`'s `.select()` lists explicit columns (no `description`,
no `*`); new `DashboardJobRow`/`toDashboardJob` replace the old
`JobWithScoreRow`/`toJobWithScore` (which is now dead — `toJob` is unchanged
and still used by `findUnscored`, which needs `description` for AI scoring).

### P1 #5 — Server-side `minAiScore` filter
`findForDashboard` now applies `filters.minAiScore` as
`.gte("job_scores.ai_score", minAiScore)` on the query instead of filtering
the mapped results in-app. Since `job_scores` is a `!left` join, this
effectively requires a matching scored row meeting the threshold — combined
with P0 #6 (filter disabled when no AI scores exist in the result set), this
doesn't introduce new "silently empty" states.

### P1 #6 — Settings mobile flex-col
- `src/app/(protected)/settings/page.tsx`: Companies `CardHeader` →
  `flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between`.
- `src/components/roles/RoleSelectorForm.tsx`: "Saved!" confirmation row →
  `flex flex-col gap-2 sm:flex-row sm:items-center`.

## Docs
`docs/repositories.md` §2 (`findForDashboard`) updated: explicit column list
(no `description`), `minAiScore` documented as a query-level `gte` filter
instead of an in-app filter.

## Verification
- `npx tsc --noEmit` — clean, no errors.
- `npx vitest run` — 146/148 pass. The 2 failures
  (`TelegramBotSender.test.ts` 429 retry-after timeouts) are pre-existing and
  unrelated (same as noted in `p0-implementation-report.md`).
- `SupabaseJobRepository.test.ts`: 11/11 pass — `minAiScore` test rewritten
  to assert `.gte("job_scores.ai_score", 0.8)` is called (query-level filter)
  instead of asserting in-app filtering of mock results.
- No UI smoke test run this session — recommend a visual check of `/dashboard`
  (responsive columns, FilterBar on mobile width, Suspense fallback, score
  badge colors) and `/settings` (Companies header, scrape run status colors)
  before merge.

## Out of scope (per plan)
P2 items (empty-state unification, `JobRow` hierarchy tweaks, tap targets,
resume upload confirmation, notifications context note, settings de-jargon,
sequential-fetch waterfall) and the backend `ai_score IS NULL` root cause —
all explicitly deferred in `ui-improvement-plan.md`.
