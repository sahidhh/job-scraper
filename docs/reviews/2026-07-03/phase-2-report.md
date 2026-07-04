# Phase 2 Report — Job Enrichment

**Date:** 2026-07-03
**Branch:** `claude/job-scraper-stabilization-s8mzi5`
**Commits:** `deab73e`, `d32715e`, `5707323`

## Objective

Enrich jobs with career-page URLs, contact emails, and salary data — deterministic extraction only,
no AI, no complete career-site scrapers (per the mission brief).

## Implementation Summary

### Task 8 — Career site discovery
- `company_career_pages` (new table, keyed by `canonical_company_name`) + `discoverAtsCareerPages`:
  derives a careers-page URL for every `companies` row with a board token, purely from
  `(source, boardToken)` — the ATS board itself *is* the public careers page for
  greenhouse/lever/ashby, so this needs zero network calls and has zero ambiguity.
- Persisted by a standalone script (`scripts/discover-career-pages.ts` / `npm run discover:career-pages`),
  not the scrape/score/notify cron.
- **Deliberately deferred:** domain-guessing a careers page for aggregator-sourced companies
  (wellfound/remoteok/mycareersfuture, which have no board-token row and carry the bulk of job
  volume). Guessing a domain from a company name is inherently ambiguous and unverifiable without a
  search API or live network validation against real companies — shipping unverified guesses as fact
  would violate "deterministic behavior"/"avoid magic." See AD-20.
- Moved `normalizeCompanyName` from `features/jobs/application` to `features/companies/domain` (its
  natural home) since this feature needed it too.

### Task 9 — Contact email extraction
- `extractContactEmail` supersedes the previously unused `extractRecruiterEmail` helper: extracts every
  email in title+description, excludes fully-automated mailboxes, and categorizes the rest by
  local-part keyword into `recruiter > hr > hiring_manager > company_contact` (the task's stated
  priority order) with a `high|medium|low` confidence.
- Wired into `ingestJobs.ts`; stored as `jobs.contact_email`/`contact_email_category`/
  `contact_email_confidence`.
- **Known gap:** only sees plain text left after each scraper's `stripHtml()` — an email reachable
  only via a `mailto:` href with non-email link text is invisible. Fixing this needs a cross-adapter
  interface change (same category as AD-13/18/20's deferred architecture changes).

### Task 10 — Salary extraction
- `extractSalary`: three prioritized regex patterns (currency-symbol-first; number-then-currency-code-
  or-LPA/lakh; number-with-period-but-no-currency), each requiring at least one real signal (currency
  symbol/code, LPA/lakh unit, or explicit period) before accepting a match — so a bare number like
  "5+ years of experience" is never misread as a salary.
- Supports ₹/$/S$/Rs symbols, USD/INR/SGD/AED codes, India-specific LPA/lakh units (1 lakh = 100,000,
  and LPA implies both INR and a yearly period), yearly/monthly/hourly periods.
- "Negotiable"/"Competitive"/"DOE" text is recorded distinctly (confidence `'low'`, no figure) from no
  salary mention at all (`extractSalary` returns `null`).
- Wired into `ingestJobs.ts`; stored as `jobs.salary_currency`/`salary_min`/`salary_max`/
  `salary_period`/`salary_confidence`.

## Database Changes

Three new migrations, all additive:

| Migration | Change |
|---|---|
| `20260703000004_company_career_pages.sql` | New `company_career_pages` table (unique on `canonical_company_name`), RLS read-only |
| `20260703000005_job_contact_email.sql` | `jobs.contact_email`, `contact_email_category`, `contact_email_confidence` (all nullable text) |
| `20260703000006_job_salary.sql` | `jobs.salary_currency`, `salary_min`/`salary_max` (numeric), `salary_period`, `salary_confidence` |

No backfill needed — all new columns are nullable and computed going forward at ingest; existing rows
simply have null enrichment fields until re-ingested (jobs are re-touched on every scrape re-sighting).

## Architecture Decisions

`docs/decisions.md` AD-20 (career page discovery scope), AD-21 (contact email extraction scope),
AD-22 (salary extraction patterns) — each with full rationale, alternatives considered, and
consequences.

## Testing

- 546 tests passing (up from 513 at end of Phase 1). New pure-function coverage: `deriveAtsCareerPage`,
  `discoverAtsCareerPages`, `extractContactEmail` (11 cases), `extractSalary` (15 cases covering every
  example format in the task brief plus edge cases), plus repository/ingest wiring tests.
- `npx tsc --noEmit` clean, `npm run build` succeeds, `npm run check:service-role-boundary` passes,
  after every commit.

## Risks / Known Gaps (all documented in `design/limitations.md` §1.8–1.10)

- Career pages only cover ATS-registry companies (not aggregator-sourced ones).
- Contact emails only reachable via visible plain text, not `mailto:`-only hrefs.
- Salary formats outside the recognized set are silently un-extracted (false-negative, not
  false-positive, by design).

## Future Improvements

- Domain-guessing career-page discovery for aggregator-sourced companies (needs a search API or
  verified live-network validation strategy).
- Cross-adapter interface change to preserve raw HTML for mailto:/structured-data extraction
  (architect-level, same category as the AD-13/18/20 deferred changes).
- Wire `contact_email`/`salary_*` into the dashboard UI (Phase 4 territory, backend-only for now).

## Sign-off

Phase 2 (Tasks 8, 9, 10) complete. Build, typecheck, and full test suite green. Pushed to
`claude/job-scraper-stabilization-s8mzi5`. Proceeding to Phase 3 (AI cost optimization).
