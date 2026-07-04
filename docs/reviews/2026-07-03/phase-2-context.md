# Phase 2 Compact Context (delta from phase-1-context.md)

## New utilities available for reuse

| Function | Location | Purpose |
|---|---|---|
| `deriveAtsCareerPageUrl(company)` / `discoverAtsCareerPages(companies)` | `src/features/companies/domain/deriveAtsCareerPage.ts` / `application/discoverAtsCareerPages.ts` | Deterministic careers-page URL for board-token companies |
| `extractContactEmail(text)` | `src/features/jobs/domain/extractContactEmail.ts` | Best contact email + category + confidence from plain text |
| `extractSalary(text)` | `src/features/jobs/domain/extractSalary.ts` | Currency/min/max/period/confidence from plain text |
| `normalizeCompanyName` | **moved** from `features/jobs/application` to `features/companies/domain/normalizeCompanyName.ts` — update any stale import paths you see |

## Schema changes (3 new migrations, all additive)

- `company_career_pages` (new table): `id, canonical_company_name UNIQUE, career_page_url, website_url, discovery_method, confidence, discovered_at`. RLS read-only.
- `jobs`: + `contact_email`, `contact_email_category`, `contact_email_confidence` (all nullable text).
- `jobs`: + `salary_currency` (text), `salary_min`/`salary_max` (numeric), `salary_period` (text), `salary_confidence` (text).

No backfill scripts for these — they're computed only going forward at ingest time (unlike Phase 1's `fingerprint`/`canonical_company_name`, which needed `npm run backfill:fingerprints` for pre-existing rows). If Phase 3/4 need historical jobs enriched too, a similar backfill script would be needed (see `scripts/backfill-fingerprints.ts` for the pattern).

## Interface changes

- `Job`/`NormalizedJob` (`features/jobs/domain/types.ts`) gained: `contactEmail`, `contactEmailCategory`, `contactEmailConfidence`, `salaryCurrency`, `salaryMin`, `salaryMax`, `salaryPeriod`, `salaryConfidence`. `NormalizedJob`'s versions are optional (computed by `ingestJobs`, like `minYears`). `JobWithScore` excludes all of these (backend-only, not surfaced to the dashboard yet).
- New `CareerPageRepository` interface (`features/companies/domain/CareerPageRepository.ts`) + `SupabaseCareerPageRepository` implementation.

## Deliberately deferred (documented, not implemented)

- **Domain-guessing career pages** for wellfound/remoteok/mycareersfuture companies (AD-20) — would need either a search API (new dependency) or live network validation this sandbox can't fully verify.
- **mailto:/structured-HTML extraction** for emails (AD-21) and **HTML-based salary/other structured data** — both require preserving raw HTML through the pipeline instead of the current per-adapter `stripHtml()`-before-ingest flow, which is a cross-adapter `JobSourceScraper.fetchJobs` interface change (same deferred-architecture-change category as AD-13/18).

If Phase 3/4 work wants either of these, that's the concrete next step — not a new idea, an already-identified one.

## Remaining work (backlog)

Phase 1 (Tasks 1-7): done. Phase 2 (Tasks 8-10): done. Not started: Phase 3 (Task 11-12, AI cost
optimization — keyword pre-filter tightening, batching/caching/adaptive model routing), Phase 4
(Task 13, analytics dashboards — this is also where Phase 1's `getSourceHealthReport`/
`getScoringQueueReport` and Phase 2's `contact_email`/`salary_*`/`company_career_pages` should get
UI surfacing, since all of Phase 1-2 was deliberately backend-only per CLAUDE.md's before-UI rule).
