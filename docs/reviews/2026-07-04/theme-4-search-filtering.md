# Theme 4 — Search & Personal Filtering

**Date:** 2026-07-04 (continuous-improvement session)
**Scope:** Improve finding relevant jobs on the dashboard; implement only items that integrate naturally into the current architecture.

## Investigation Summary

`JobFilters` had exactly five fields (location, source, status, minAiScore, maxYears) plus
`includeArchived`. No text search, no favourites, no saved filters, no company blacklist/whitelist
existed anywhere in code or docs (confirmed by repo-wide grep). `docs/filter-analysis.md` turned out to be
about a different problem entirely — the scrape-pipeline's role/location keyword filter — not dashboard
UX, so it contained no prior analysis to build on here.

The existing status workflow (New/Interested/Applied/Rejected/Archived) already gives a de-facto "hide
what I've handled" mechanism: `includeArchived=false` (the default) hides Archived jobs. Rejected jobs are
**not** auto-hidden, and there's no "viewed" concept at all — both accurately reflect intentional, existing
design (a Rejected job might still be worth re-surfacing; "viewed" was never tracked).

## Implemented

1. **Dashboard text search** (`JobFilters.search`, URL param `q`) — case-insensitive substring match against
   `title` OR `company_name`, built the same way the existing role-filter (`buildRoleFilter`/
   `sanitizeRoleForFilter`, `shared/infrastructure/roleFilter.ts`) already sanitizes PostgREST `.or()`
   filter strings, reusing that exact helper rather than writing a second, parallel escaping scheme.
   Wired into `FilterBar.tsx` (both desktop row and mobile sheet) and `dashboard/page.tsx`.
2. **Company mute, applied to the dashboard job list** — see Theme 2: the same `excludeCompanies` setting
   that mutes Telegram alerts also removes matching jobs from the dashboard entirely
   (`JobFilters.excludeCompanies`, chained `.not(..., "ilike", ...)` filters — De Morgan's over "hide if it
   matches any muted company"), always enforced (not a per-request toggle), merged server-side the same way
   the existing `maxYears` default is merged from settings.

## Skipped (with rationale)

- **Saved filters / bookmarking a filter combination** — the dashboard's filters are already fully
  URL-param-driven (`/dashboard?location=...&source=...`), so a "saved filter" is already achievable today
  by bookmarking that URL in the browser — a dedicated saved-filters feature (new table, UI for
  naming/managing saved sets) would duplicate a capability the browser already provides for free, for a
  single-user tool with no multi-device sync requirement stated in scope.
- **Favourites/bookmarks on individual jobs** — the existing status workflow (specifically "Interested")
  already serves this exact purpose; adding a parallel favourite flag would be a duplicated concept
  (`design/scope.md`'s "avoid duplicated DTOs/types" principle extends naturally to duplicated user-facing
  concepts).
- **Company whitelist** (as opposed to blacklist) — not implemented; the scrape pipeline's `companies` table
  is already the whitelist mechanism (only configured companies are ever scraped for board-token sources),
  so a second, dashboard-level whitelist would either be redundant with it or would need its own
  reconciliation logic against feed-based sources that have no `companies` row at all. No clear use case
  was found that the existing company-configuration screen doesn't already cover.
- **"Hide viewed" jobs** — there is no "viewed" timestamp/flag on `jobs`/`job_state` anywhere, and adding
  one crosses into new-schema-for-a-guessed-feature territory without a stated need; the status workflow
  (assign literally any status) already gives the user an explicit, intentional way to mark a job as
  handled, which is a stronger signal than an implicit "did the row render once" flag.
- **Multi-select filters, sort-order picker** — evaluated; would require reworking `FilterBar`'s current
  single-select `<Select>` pattern and the repository's `.in()`/`.overlaps()` filter shapes for every
  filter, a larger UI/query refactor with no specific reported pain point driving it this session. Left as
  a documented idea for a future pass if single-select proves limiting in practice.

## Files Changed

- `src/features/jobs/domain/types.ts` (`JobFilters.search`, `.excludeCompanies`)
- `src/features/jobs/infrastructure/SupabaseJobRepository.ts` (+2 tests)
- `src/components/dashboard/FilterBar.tsx` (search input, desktop + mobile)
- `src/app/(protected)/dashboard/page.tsx` (`q` param, shared mute merge)

## Testing

`npx tsc --noEmit`, `npx vitest run` (2 new `SupabaseJobRepository` tests for search/exclude), `npm run
build` — all pass.

## Impact

- **User experience**: search directly addresses "find jobs quickly" without needing a new dependency or
  full-text-search infrastructure — reuses the existing sanitize-for-PostgREST-`.or()` pattern already
  proven in production for role filtering.
- **Simplifies existing code**: the mute list is defined once (Theme 2) and consumed by two features
  (notifications + dashboard) rather than duplicated.

## Remaining Opportunities

- If real usage shows single-select location/source filters are limiting, revisit multi-select as a
  scoped follow-up (not implemented speculatively here).
