# P0 Implementation Report

Implements the 6 P0 items from `reports/ui-improvement-plan.md`. No new
architecture, no new dependencies — targeted copy/query/class-name changes
within the existing repository pattern, server components, and shadcn/Tailwind
component set.

## Changes

### P0 #1 — Reword AI-reasoning fallback
`src/components/dashboard/JobRow.tsx:81`
"No AI reasoning available yet." → "AI review pending — keyword match score
shown above." Removes the implied imminent-completion/error tone and ties
back to the visible keyword score.

### P0 #2 — Score badge with Pending state + tiers + provenance
`src/components/dashboard/JobRow.tsx`
New `ScoreBadge` component replaces the plain `formatScore(...)` text:
- `aiScore === null` → outline "Pending" badge + "Keyword: N%" line.
- `aiScore` present → colored badge (green ≥0.75, yellow ≥0.4, neutral
  outline below 0.4 — bands taken from `scoring.md`'s `NOTIFY_THRESHOLD`
  0.75 / `KEYWORD_THRESHOLD` 0.25) + "AI score" label.

Colors use direct Tailwind `green-*`/`yellow-*` utility classes rather than
new theme tokens, to stay within P0 scope (theme tokens are P1 #3).

### P0 #3 — Count-based pending-AI banner
`src/app/(protected)/dashboard/page.tsx`
Replaced `jobs.every((job) => job.aiScore === null)` (disappears after a
single job is scored) with `pendingCount > 0`, showing "N of M jobs pending
AI review — keyword match score shown until AI review completes."

### P0 #4 — Dashboard status line
`src/app/(protected)/dashboard/page.tsx`
New line above the banners: "Last scraped <timestamp> — N jobs matched, M
scored by AI, K pending." Built entirely from `jobs` and `scrapeRuns`
(`scrapeRunRepository.listRecent(1)`), no new queries. Counts reflect the
current page (see P0 #5).

### P0 #5 — Pagination (`.limit()` + Load more)
- `JobRepository.findForDashboard(roleSelectionId, filters, limit)` now
  returns `{ jobs, hasMore }` instead of a bare array
  (`src/features/jobs/domain/{types,JobRepository}.ts`,
  `src/features/jobs/infrastructure/SupabaseJobRepository.ts`).
- Implementation requests `limit + 1` rows; the extra row (if present) is
  dropped and signals `hasMore`. `minAiScore` is still applied in-app to the
  limited page (P1 #5 would push this into the query).
- Dashboard defaults to `limit=50` (capped at 500 via `?limit=`), with a
  "Load more" button that links to `?...&limit=<current+50>`, preserving
  location/source/minScore filters.
- `docs/repositories.md` §2 updated for the new signature and query shape.
- `SupabaseJobRepository.test.ts`: updated existing `findForDashboard` tests
  for the new `{ jobs, hasMore }` shape and `.limit(limit + 1)` call, added a
  new test for `hasMore: true`.

### P0 #6 — Disable "Min AI score" filter when no AI scores exist
`src/components/dashboard/FilterBar.tsx`, `dashboard/page.tsx`
`FilterBar` takes `hasAiScores: boolean` (computed as `scoredCount > 0` from
the current result set). When false, the "Min AI score" input is `disabled`
with a `title` tooltip explaining AI scoring hasn't run yet, instead of
silently returning "No jobs match the current filters."

## Out of scope (per plan)
P1/P2 items (responsive table columns, FilterBar layout/Suspense, color
theme tokens, `description` column trimming, server-side `minAiScore`,
empty-state unification, etc.) and the backend `ai_score IS NULL` root cause
— all explicitly deferred in `ui-improvement-plan.md`.

## Verification

- `npx tsc --noEmit` — clean, no errors.
- `npx vitest run` — 146/148 pass. The 2 failures
  (`TelegramBotSender.test.ts` 429 retry-after timeouts) are **pre-existing**
  and unrelated — confirmed by running the same test on a clean `main`
  checkout (stash/pop) before any of these changes, same 2 failures.
- `SupabaseJobRepository.test.ts`: 11/11 pass (was 10, +1 new `hasMore` test).
- No UI smoke test run (no dev server started this session) — TS/test
  coverage only. Recommend a quick `/dashboard` visual check before merge,
  especially the new status line, score badges, and "Load more" control with
  >50 matching jobs.
