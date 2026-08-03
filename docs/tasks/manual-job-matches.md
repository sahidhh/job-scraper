# Manual (Claude-Routine) Job Matches — Design Handoff

> **Status: not implemented.** This document is a pre-implementation design plan,
> written the same way `docs/tasks/role-packs.md` was before it shipped. It does
> not modify code, config, or schema. All changes still require the standard
> domain → application → infrastructure → tests → UI flow per `CLAUDE.md`, and
> the `design/*.md` updates listed in §8 must land in the same change as the code.

## 1. Problem

Job matches currently come from exactly one pipeline: the GitHub Actions cron
(`scrape.ts` → `score.ts` → `notify.ts`) writing into Supabase `jobs` /
`job_scores`, surfaced on `/dashboard`.

A second, independent source of matches exists: **`job-match-tracker`**
(`sahidhh/job-match-tracker`), a static GitHub Pages site. Its `data/state.json`
is hand-curated during ad hoc Claude Code sessions ("the Claude routine") —
the user searches/reads listings interactively and a session writes out
scored, annotated matches. Per that repo's README, all per-job state (status,
"not interested" list, 10-day purge) lives in browser `localStorage` only —
there is no backend, no sync, and no relationship to job-scraper's schema
today.

The user considers the Claude-routine matches **more accurate** than the
automated pipeline's `ai_score`, and wants both sources visible in the
job-scraper dashboard, switchable via one global toggle, without running two
dashboards and without touching the existing scraper data (explicitly:
**truncation of `jobs` is not required and is not part of this plan** — the
two sources coexist via the dedup key, see §3).

## 2. Existing Flow (today)

```
scrape.ts → score.ts → notify.ts     (cron, scrape.yml, every 6h)
  → jobs (source IN greenhouse|lever|ashby|wellfound|remoteok|remotive|
          himalayas|mycareersfuture|jsearch|adzuna|careers_url)
  → job_scores (keyword_score, ai_score 0.0-1.0, tied to role_selection_id
    + resume_version, produced by one OpenRouter call via openrouterClient.ts)
  → /dashboard reads via the jobs+job_scores repository query
    (sorted by overall_score DESC NULLS LAST)

job-match-tracker (separate repo, separate site):
  data/state.json (runDate, runLabel, jobs[]: id/title/company/location/yoe/
    salary/requirements/score 0-100/standout/tags/link/verify — all free text
    except score/tags)
  → index.html fetches it client-side
  → status/denylist/purge tracked in localStorage only, per browser
  → no relationship to job-scraper's DB
```

## 3. New Flow (proposed)

```
Claude-routine session produces a state.json-shaped file (as it does today
for job-match-tracker)
  → scripts/import-manual-matches.ts (new, manual/one-off entry point,
    same category as scripts/discover:career-pages — not cron-scheduled)
      → maps each entry to a `jobs` row:
          source = 'claude_routine'   (new job_source enum value)
          source_job_id = entry.id    (already stable/unique per job-match-tracker's
                                        own id scheme)
          title, company_name, location_raw ← direct
          manual_score = entry.score            (new nullable column, 0-100 int)
          manual_standout = entry.standout       (new nullable column, text)
          manual_verify = entry.verify           (new nullable column, text)
          manual_requirements = entry.requirements (new nullable column, text)
          description = entry.requirements (fallback so existing description
                                             consumers don't see a blank field)
      → upsert on (source, source_job_id) — identical dedup mechanics to
        every other source, no new conflict logic

/dashboard (UNCHANGED route, unchanged page component tree):
  reads an `origin` search param, default 'scraper'
      origin=scraper         → WHERE source <> 'claude_routine'  (today's behavior)
      origin=claude_routine  → WHERE source = 'claude_routine'
  existing filters (is_active, location_tags, ineligible_reason) apply to
  BOTH origins unchanged — import gives manual rows sane defaults
  (is_active=true, location_tags derived from location_raw via the same
  tagging logic scrape.ts already uses) so one filter implementation covers
  both, per §4.3
  sort key branches on `origin`, not a new param:
      origin=scraper         → overall_score DESC NULLS LAST (unchanged)
      origin=claude_routine  → manual_score DESC NULLS LAST
  one new small client component (`OriginToggle`) in the dashboard header
  updates the `origin` search param; no new page, no new route

Everything else (scrape/score/notify cron, /analytics, /roles, /settings)
UNCHANGED.
```

## 4. Design Decisions

### 4.1 Reuse `jobs.source`, don't create a second table

`source` is already a `job_source` enum differentiating pipelines
(`greenhouse | lever | ... | jsearch | adzuna | careers_url`), with
`UNIQUE(source, source_job_id)` as the only dedup key. Adding
`claude_routine` as one more value is the same shape of change as the
`jsearch`/`adzuna`/`careers_url` addition in
`20260715000001_jsearch_adzuna_careers_url_sources.sql`.

**Alternative considered:** a separate `manual_jobs` table. Rejected — the
`Job` entity (title/company/location/link) is >80% identical, so a second
table would be a duplicated DTO/type under `CLAUDE.md`'s rules, and every
dashboard query, filter, and status (`job_state`) mechanism would need a
second implementation.

### 4.2 New nullable columns on `jobs`, not a reused `job_scores` row

`job_scores` is shaped around the automated pipeline specifically:
`UNIQUE(job_id, role_selection_id, resume_version)`, `keyword_score`/`ai_score`
as 0.0–1.0 floats, plus `model`/`tokens_input`/`tokens_output`/
`estimated_cost_usd`/`retry_count` that only mean something for a real
OpenRouter call. The Claude-routine's `score` is a single ad hoc 0–100
judgment with no role/resume linkage and no narrative-field home anywhere in
the current schema (`standout`, `verify` don't exist on any table).

**Alternative considered:** insert a `job_scores` row per manual match with a
placeholder `role_selection_id`/`resume_version`. Rejected — would require
fabricating FKs that don't correspond to anything real, and would mix a
0–100 scale into a column whose only other values are 0.0–1.0, corrupting
`overall_score DESC` as a sort key if the two are ever compared. New nullable
columns directly on `jobs` (`manual_score`, `manual_standout`,
`manual_verify`, `manual_requirements`) are additive and never touched by
the automated pipeline's read/write paths.

`manual_score` gets a `CHECK (manual_score IS NULL OR manual_score BETWEEN 0
AND 100)` constraint in the migration itself — enforced at the DB regardless
of entry point, not just validated in the import script.

### 4.3 One dashboard + a search-param toggle, not two dashboard tabs

**Alternative considered:** a second `/dashboard-manual` route or tab.
Rejected — duplicates the page, the query composition, and the filter UI for
what is really one more filter value alongside the existing `is_active` /
`location_tags` / `ineligible_reason` filters the dashboard already applies.
A toggle is consistent with how those filters already work.

### 4.4 `claude_routine` is excluded from source-health / company iteration

Same pattern as `careers_url` (AD-35): it's a valid `job_source` enum value,
but it has no `companies` row, no probe, and isn't a "board" — it must be
excluded from `JOB_SOURCES`-driven iteration (source-health checks,
`/analytics` per-source probe table) the same way `careers_url` already is,
or those checks will try to probe a health endpoint that doesn't exist.

### 4.5 No truncation

The dedup key is `(source, source_job_id)`. `claude_routine` rows can never
collide with existing scraper rows regardless of how much or how little
scraper history exists. Truncating `jobs` was raised as an option but adds
no capability this plan needs — noted here so a future session doesn't
mistake it for a prerequisite.

## 5. Files Expected to Change (not yet created)

### New

| File | Purpose |
|---|---|
| `supabase/migrations/<timestamp>_manual_job_matches.sql` | Add `claude_routine` to `job_source` enum; add `manual_score`, `manual_standout`, `manual_verify`, `manual_requirements` nullable columns to `jobs` |
| `scripts/import-manual-matches.ts` | Reads a state.json-shaped file, upserts into `jobs` with `source='claude_routine'`; service-role key usage stays in `scripts/` per the existing boundary rule |
| `src/components/dashboard/OriginToggle.tsx` | Client component; reads/writes the `origin` search param |
| `scripts/import-manual-matches.test.ts` | Unit tests for the mapping/upsert logic |
| `.claude/skills/manual-job-routine/SKILL.md` | Instructions for the ad hoc Claude-routine session: run the job search/read/score routine as today, but write output as a state.json-shaped file under `reports/manual-matches/<date>.json` instead of (or in addition to) `job-match-tracker`'s `data/state.json`, then invoke `npm run import:manual-matches -- <path>` |
| `docs/tasks/manual-job-matches.md` | This document |

### Modified

| File | Change |
|---|---|
| `src/features/jobs/domain/types.ts` (or equivalent) | Add `manual_score`/`manual_standout`/`manual_verify`/`manual_requirements` to the `Job` type; add `claude_routine` to the source union |
| Dashboard repository query (`findForDashboard` or equivalent) | Accept an `origin` filter param |
| `src/app/(protected)/dashboard/page.tsx` | Read `origin` from `searchParams`, pass through, render `OriginToggle` |
| `src/shared/domain/enums.ts` (`JOB_SOURCES`) | Confirm `claude_routine` is excluded, matching the existing `careers_url` exclusion (AD-35) |
| `supabase/database.types.ts` | Hand-add the new enum value + columns (no live Supabase project to regenerate from, per `AI_HANDOFF.md`) |
| `design/erd.md` | New enum value; new nullable columns on `JOBS` (incl. the `manual_score` CHECK constraint); note on the exclusion from source-health iteration |
| `design/use-cases.md` | New use case: importing/viewing Claude-routine matches |
| `design/scope.md` | Note the second data origin and the toggle |
| `design/api-reference.md` | Document the new script entry point if it's exposed as more than a CLI script |
| `design/security.md` | New service-role entry point (`scripts/import-manual-matches.ts`) — same `scripts/`-only boundary rule as existing scripts, recorded per new-entry-point convention |
| `docs/decisions.md` | New AD entry recording 4.1–4.5 above (rationale + alternatives, matching the existing AD format) |
| `package.json` | New `import:manual-matches` script entry (`tsx scripts/import-manual-matches.ts`), following the existing `backfill:*`/`discover:career-pages` naming convention |

## 6. Testing

- Unit: `import-manual-matches.test.ts` — maps a sample state.json fixture to
  `jobs` rows correctly, dedups on `(source, source_job_id)`, leaves
  `manual_*` fields null for non-`claude_routine` rows, sets
  `is_active=true` and derives `location_tags` from `location_raw` the same
  way `scrape.ts` does.
- Unit: dashboard query test — `origin=scraper` excludes `claude_routine`
  rows and vice versa; default (`origin` absent) matches today's behavior
  exactly (regression guard); `origin=claude_routine` sorts by
  `manual_score DESC NULLS LAST` while `origin=scraper` still sorts by
  `overall_score DESC NULLS LAST`.
- DB: migration test/manual check — inserting `manual_score` outside
  0–100 violates the `CHECK` constraint.
- Manual validation checklist:
  1. Existing `/dashboard` behavior (no `origin` param) unchanged.
  2. Toggle switches the visible set; counts/pagination update accordingly.
  3. `/analytics` source-health table doesn't attempt to probe `claude_routine`.
  4. Running the import script twice with the same input file is a no-op
     (idempotent upsert), matching `findByContentHash`-style parse-once
     expectations elsewhere in this codebase.

## 7. Risks

| Risk | Mitigation |
|---|---|
| `manual_score` (0-100) visually confused with `overall_score` (0.0-1.0) if both render on the same card | Label explicitly in the UI ("Manual score" vs "AI score"); never sort the two scales together — sort key is scoped per `origin` |
| A future session adds `claude_routine` to `JOB_SOURCES` by habit when adding a new source | Call out the exclusion inline next to `careers_url`'s existing AD-35 comment in `enums.ts` |
| Import script run against a malformed/partial state.json silently drops fields | Validate required fields (`id`, `title`, `company`) before upsert; fail loud, don't insert partial rows |

## 8. Rollback Plan

1. Remove `OriginToggle` and the `origin` param handling from
   `/dashboard/page.tsx` (revert to today's single query).
2. Remove `scripts/import-manual-matches.ts` and its test.
3. `claude_routine` rows can be deleted independently of scraper data:
   `DELETE FROM jobs WHERE source = 'claude_routine'` — this is the only
   truncation this plan ever needs, and it's scoped to the new source value
   only, not the table.
4. The enum value and the four nullable columns can remain unused — Postgres
   enum values aren't droppable without a type rewrite, but an unused value
   with no rows referencing it is harmless (same accepted tradeoff as any
   other unused enum value).

## 9. Future Enhancements

- Push-button "promote" from a Claude-routine match into the same
  `job_state`/status tracking the scraper jobs already use, replacing
  job-match-tracker's localStorage-only status entirely.
- Retire the standalone `job-match-tracker` GitHub Pages site once the
  dashboard toggle covers its use case, redirecting it to job-scraper.
- If manual-match volume grows, consider whether `manual_score` should be
  normalized to the same 0.0-1.0 scale as `ai_score` for easier cross-origin
  comparison — deliberately deferred here since the two are produced by
  different processes (regex/rules + one OpenRouter call vs. an interactive
  Claude Code session) and conflating them prematurely is exactly the risk
  flagged in §7.
