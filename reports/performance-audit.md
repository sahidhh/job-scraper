# Dashboard Performance Audit (UI/UX, read-only)

Scope: `/dashboard` route and its component tree only (frontend/UI-layer
concerns — data fetching patterns, client/server component boundaries,
re-renders, expensive components). No backend architecture, database schema, or
infrastructure changes proposed; repository code was read only to understand
what the dashboard page triggers and what shape of data flows to the client.

> Note: a separate `performance-audit.md` previously existed in this directory
> covering backend repository query-pattern performance (upsert overhead,
> anti-join filtering, indexes). That review's findings are still valid but are
> backend-focused and out of scope for this UI/UX pass; this file replaces it
> with the UI-layer review requested. If both perspectives are needed, consider
> keeping them as separate files (e.g. `performance-audit-backend.md`).

## Summary

The dashboard is mostly server-rendered and already parallelizes its three main
data fetches with `Promise.all`, which is good. The "feels slow" complaint is
most likely driven by:

1. **Every filter change triggers a full server round-trip and full page
   re-render** — `FilterBar` pushes a new URL, which re-runs the entire
   `DashboardPage`/`DashboardJobs` server component tree. There's no
   client-side filtering or scoped revalidation, so even a trivial filter
   tweak re-fetches and re-renders the whole jobs table plus the
   companies/scrape-run-derived banners.
2. **No pagination/limit on the jobs query** — `findForDashboard` returns the
   entire matching result set with `select("*, job_scores!left(...)")` and no
   `.limit()`. As the scraper continues to ingest jobs, this list — and the
   number of hydrated `JobRow` client components — grows unbounded.
3. **The full `Job` row, including the `description` text field, is fetched and
   serialized down to the client** for every row, even though `JobRow` never
   renders `description` — only `aiReasoning` is shown in the expand panel.
   This inflates the RSC payload for no UI benefit.
4. **`minAiScore` filtering happens in application code after the full result
   set is fetched**, not in the SQL query — so the "Min AI score" filter
   doesn't reduce the amount of data fetched/transferred, only what's
   ultimately displayed.
5. A small, mostly-unavoidable sequential waterfall exists before the parallel
   fetch can start: auth check → active role selection lookup → (jobs +
   companies + scrape runs in parallel). This compounds with Finding 1 since
   every filter change re-runs the whole chain.
6. `JobRow` is a client component using `useState` purely for an expand/collapse
   toggle — a reasonable, isolated use of client interactivity, but it means
   **every row is its own hydrated client component instance**, so hydration
   cost scales linearly with the (currently unbounded) row count from Finding 2.

None of these is catastrophic in isolation, but combined — unbounded result set
+ full-row payload (including unused `description` text) + full-page refetch on
every filter interaction — they explain a dashboard that feels sluggish today
and will degrade further as the `jobs` table grows (this is a scraper that
ingests jobs continuously via GitHub Actions).

---

## Findings

### 1. Filtering is fully server-side via URL navigation — every filter change re-fetches and re-renders the whole page

**Root Cause**

`src/components/dashboard/FilterBar.tsx:12-20` — `updateParam()` mutates the
URL's search params and calls `router.push("/dashboard?...")`. This is a full
Next.js navigation to the same route, which re-runs the entire server component
tree: `DashboardPage` (`src/app/(protected)/dashboard/page.tsx:37-63`) and
`DashboardJobs` (`src/app/(protected)/dashboard/page.tsx:65-104`). That re-runs
`getActiveSelection()`, the 3-way `Promise.all` for
jobs/companies/scrapeRuns, and re-renders `<JobsTable jobs={jobs} />` (and every
`JobRow`) from scratch — even though `companies.list()` and
`scrapeRuns.listRecent(1)` don't depend on the filters at all.

**Impact**

Every time a user picks a different location/source dropdown value, or blurs
the "Min AI score" input, the entire page does a server round trip: re-fetch
active role selection, re-fetch jobs + companies + scrape runs, and re-render
every `JobRow`. For a table with many rows this is a visible flash/delay on
every filter interaction, even though only the jobs query result actually needs
to change.

**Estimated Improvement**

Not trivial to fully fix without restructuring (would require splitting the
jobs fetch into its own `Suspense`-streamed segment or a client-side-cached
fetch keyed by filters). But even wrapping just `<JobsTable>` in its own
`Suspense` boundary so the page shell, header text, and the
companies/scrape-run-derived banners don't need to re-resolve on every
navigation would cut the re-fetch work roughly in half (eliminates 2 of the 3
parallel queries from the critical path on filter changes) and likely removes
the full-page flash.

**Affected Files**

- `src/components/dashboard/FilterBar.tsx:12-20`
- `src/app/(protected)/dashboard/page.tsx:37-63, 65-104`

---

### 2. No pagination/limit on the jobs query — result set (and rendered row count) grows unbounded

**Root Cause**

`src/features/jobs/infrastructure/SupabaseJobRepository.ts:171-198`
(`findForDashboard`) builds a query with `.eq()`, `.overlaps()`, `.in()`, and two
`.order()` calls, but **never calls `.limit()`** and there's no pagination UI.
Every job row matching the active role selection (and any location/source
filters) is fetched in one query and returned to `DashboardJobs` → `JobsTable`
→ rendered as one `JobRow` per row (`src/components/dashboard/JobsTable.tsx:19-21`).

**Impact**

As the scraper continues to run continuously, the `jobs` table accumulates rows
over time and the dashboard's "matches for this role" result set has no upper
bound. Today it might be tens of rows; over weeks/months it could be hundreds or
more. Each row becomes a hydrated client component (`JobRow`, Finding 6) with
its own `useState`. This directly causes: a larger RSC payload, longer table
render time, and slower hydration — and it's a "feels slow" cause that gets
worse over time with zero code changes (i.e., today's mild sluggishness is
likely to become a real problem without intervention).

**Estimated Improvement**

Adding a `.limit(N)` (e.g., 50-100 rows) plus a "load more" or page-based
control would cap render/hydration cost and payload size regardless of how
large the underlying table grows. This is likely the single highest-leverage
fix for "feels slow and getting worse over time" — once the table exceeds a few
hundred matching rows, this could cut initial table render/hydration time by
50% or more, and prevents future regressions entirely.

**Affected Files**

- `src/features/jobs/infrastructure/SupabaseJobRepository.ts:171-198`
- `src/app/(protected)/dashboard/page.tsx:71-75` (consumes the unbounded result)
- `src/components/dashboard/JobsTable.tsx:18-29` (maps over the full unbounded array, no virtualization)

---

### 3. Full `Job` rows — including the `description` field — are fetched and shipped to the client, but `description` is never rendered

**Root Cause**

`SupabaseJobRepository.findForDashboard`
(`src/features/jobs/infrastructure/SupabaseJobRepository.ts:172-174`) uses
`select("*, job_scores!left(keyword_score, ai_score, ai_reasoning, role_selection_id)")`,
which pulls every column of `jobs`, including `description` (the full job
posting text — typically the largest field per row). This flows through
`toJob()` (`SupabaseJobRepository.ts:16-32`) into `JobWithScore`
(`src/features/jobs/domain/types.ts:49-53`, which extends `Job` and therefore
includes `description: string`), and the whole object is passed as a prop to
`<JobRow job={job} />` (`src/components/dashboard/JobsTable.tsx:20`).

`JobRow` (`src/components/dashboard/JobRow.tsx`) only reads `job.title`,
`job.companyName`, `job.locationTags`, `job.source`, `job.aiScore`,
`job.keywordScore`, `job.url`, and `job.aiReasoning` (line 50 — the expand
panel). **`job.description` is never read anywhere in `JobRow`.**

**Impact**

Because `JobRow` is a `"use client"` component
(`src/components/dashboard/JobRow.tsx:1, 13`), every prop passed to it must be
serialized into the RSC payload sent to the browser and parsed during
hydration. Job description text is often multiple KB of HTML/plain text per
posting. Multiplied across every row in an unbounded list (Finding 2), this is
pure wasted payload — bytes downloaded and parsed but never displayed.

**Estimated Improvement**

Selecting only the columns the dashboard UI actually uses (or stripping
`description` when constructing `JobWithScore` for this dashboard path) could
meaningfully shrink the RSC payload — plausibly the single largest per-row
contributor to transfer size, since description text usually dwarfs the other
fields combined. Combined with Finding 2's pagination, this compounds well:
fewer rows × smaller rows = significantly less data to fetch, serialize, and
hydrate.

**Affected Files**

- `src/features/jobs/infrastructure/SupabaseJobRepository.ts:172-174` (query selects `*`)
- `src/features/jobs/domain/types.ts:4-18, 49-53` (`Job`/`JobWithScore` include `description`)
- `src/components/dashboard/JobRow.tsx:1, 13, 50` (client component receives full object as prop; only `aiReasoning` is used for the detail panel)

---

### 4. "Min AI score" filter is applied in application code after fetching the full result set

**Root Cause**

`src/features/jobs/infrastructure/SupabaseJobRepository.ts:193-196`:

```ts
if (filters.minAiScore !== undefined) {
  const threshold = filters.minAiScore;
  return mapped.filter((job) => job.aiScore !== null && job.aiScore >= threshold);
}
```

This filter runs on `mapped` — the *entire* result of the query — after the
query (which has no score-based `WHERE`/`.gte()` clause) has already fetched
every row for the role selection (plus any location/source filters from lines
177-182).

**Impact**

From the UI's perspective, setting "Min AI score" in `FilterBar`
(`src/components/dashboard/FilterBar.tsx:52-61`) feels like it should reduce
work — fewer rows returned, faster response — but it doesn't reduce the
Supabase round-trip size or the RSC payload at all. The full (location/source
filtered, but score-unfiltered) row set, including all the `description` bloat
from Finding 3, is fetched and mapped before being trimmed down to what's
displayed. Combined with Finding 1 (full page refetch on every filter change),
the user pays the cost of fetching everything just to see a smaller subset.

**Estimated Improvement**

Pushing this into the Supabase query (e.g., a `.gte()` on the joined
`job_scores.ai_score` column, alongside the existing
`.eq("job_scores.role_selection_id", ...)` filter at line 175) would make the
"Min AI score" filter actually reduce fetched/transferred rows. Improvement
scales with filter aggressiveness — for a user who sets a high threshold on a
large dataset, this could substantially cut the fetched row count (and
therefore both query time and RSC payload), compounding with Finding 2's
pagination fix.

**Affected Files**

- `src/features/jobs/infrastructure/SupabaseJobRepository.ts:171-198`
- `src/features/jobs/domain/types.ts:42-46` (`JobFilters.minAiScore`)
- `src/components/dashboard/FilterBar.tsx:52-61` (UI control whose effect is misleading re: fetch cost)

---

### 5. Small sequential waterfall before the parallel data fetch begins

**Root Cause**

Three Supabase round trips happen in sequence before any job data starts
loading:

1. `src/app/(protected)/layout.tsx:7-12` — `supabase.auth.getUser()` (defense-in-depth
   auth re-check, per the file's own comment referencing `frontend.md §4.2`).
2. `src/app/(protected)/dashboard/page.tsx:39-41` — a new server Supabase
   client is created and `roleRepository.getActiveSelection()` is awaited.
3. Only after that resolves does `DashboardJobs`
   (`src/app/(protected)/dashboard/page.tsx:65-75`) create *another* server
   client and kick off the `Promise.all` for jobs/companies/scrapeRuns.

**Impact**

This is a real but modest waterfall: auth check → active-selection lookup →
(jobs + companies + scrape-runs in parallel). Each step is a separate network
round trip to Supabase before the next can begin. It's not the dominant cost
compared to Findings 1-4, but it adds fixed per-request latency to *every*
dashboard load — and, combined with Finding 1, to every filter change too,
since the whole chain re-runs on each navigation.

**Estimated Improvement**

The auth check (step 1) is a deliberate defense-in-depth measure and shouldn't
be removed. Step 2 (`getActiveSelection`) is a genuine dependency for step 3
(the jobs query needs the resolved role-selection ID), so steps 2 and 3 aren't
parallelizable as written without a backend restructuring (e.g., a single
Postgres RPC that resolves the active selection and returns jobs together) —
which is out of scope for a UI-layer review. Listed for completeness; if
addressed, the improvement is modest (one fewer sequential round trip per
request, likely tens of milliseconds) — much smaller than Findings 1-3.

**Affected Files**

- `src/app/(protected)/layout.tsx:7-12`
- `src/app/(protected)/dashboard/page.tsx:38-41, 66-75`

---

### 6. Per-row client component hydration (`JobRow`) scales linearly with the unbounded table size

**Root Cause**

`src/components/dashboard/JobRow.tsx:1, 13-14` — `"use client"` with a local
`useState` for expand/collapse of the AI-reasoning detail panel. This is a
legitimate, isolated use of client interactivity (no server-only alternative
for a per-row toggle), but it means **each row in the table is its own
hydrated client component instance**.

**Impact**

On its own, for a small table (tens of rows) this is negligible. Combined with
Finding 2 (no limit on the jobs query) and Finding 3 (full `description` payload
per row), this becomes a scaling concern: hydration cost grows linearly with
the number of jobs returned, with no cap and no virtualization
(`src/components/dashboard/JobsTable.tsx:18-29` renders every row
unconditionally).

**Estimated Improvement**

No standalone fix recommended for `JobRow` itself — this finding largely
resolves once Finding 2 (pagination/limit) is addressed, and partially resolves
via Finding 3 (smaller per-row payload). Listed to make explicit how the
unbounded query (Finding 2) translates into unbounded client-side work, not as
an independent action item.

**Affected Files**

- `src/components/dashboard/JobRow.tsx:1, 13-14`
- `src/components/dashboard/JobsTable.tsx:18-29` (one `JobRow` per row, no virtualization/windowing)

---

## Notes

- `AppShell.tsx` (`src/components/layout/AppShell.tsx`) is a server component
  and contributes negligible overhead; `MobileNav.tsx`
  (`src/components/layout/MobileNav.tsx`) is a small, isolated `"use client"`
  component for the mobile nav sheet/menu toggle — appropriately scoped, not a
  performance concern. Neither is included as a finding.
- The three-way `Promise.all` in `DashboardJobs`
  (`src/app/(protected)/dashboard/page.tsx:71-75`) is already a good pattern —
  noted here as a *positive*, not a finding. No other un-parallelized
  `await`/`await` sequences were found in the dashboard's server code beyond
  the pre-existing, largely-unavoidable dependency chain in Finding 5.
- `FilterBar`'s "Min AI score" input uses `onBlur` rather than `onChange`
  (`src/components/dashboard/FilterBar.tsx:58-59`), which is good UX — it
  avoids triggering a navigation/refetch on every keystroke. The
  location/source `Select` dropdowns trigger immediately on change
  (`src/components/dashboard/FilterBar.tsx:24, 38`), which is expected/desired
  for dropdowns but is still subject to Finding 1's full-page-refetch cost.
- The `job_scores!left(...)` embed and
  `.eq("job_scores.role_selection_id", ...)` filter combination
  (`src/features/jobs/infrastructure/SupabaseJobRepository.ts:174-175`) was not
  flagged as its own finding — that's a query-shape concern; only its
  UI-visible consequences (over-fetched `description`, no `.limit()`) are
  covered in Findings 2-3, per the task's UI-only scope.
- No other `"use client"` components with avoidable client-boundary placement
  were found in the reviewed dashboard tree — `JobRow`, `FilterBar`, and
  `MobileNav` are the only client components reachable from `/dashboard`, and
  each has a defensible reason (per-row toggle state, URL-driven filter
  controls, mobile nav sheet state). No large/unnecessary client-bundle imports
  (e.g., heavy charting or date libraries) were found in any of the reviewed
  files.
