# Phase 1 Compact Context (for Phase 2-4 continuation)

## New utilities available for reuse

| Function | Location | Purpose |
|---|---|---|
| `computeFingerprint({title, companyName, locationTags})` | `src/features/jobs/application/computeFingerprint.ts` | Deterministic cross-source dedup key |
| `normalizeTitle(title)` | `src/features/jobs/application/normalizeTitle.ts` | Canonical title (strips seniority, expands abbreviations) |
| `normalizeCompanyName(name)` | `src/features/jobs/application/normalizeCompanyName.ts` | Canonical company name (strips legal/regional suffixes) |
| `classifyScrapeFailure(error)` | `src/features/sources/domain/classifyScrapeFailure.ts` | Deterministic failure category from a thrown error |
| `computeSourceHealthSummary(source, runs)` / `getSourceHealthReport(repo)` | `src/features/sources/application/` | Per-source health from `scrape_runs` (all 6 sources) |
| `computeScoringQueueSummary(awaiting, threshold)` / `getScoringQueueReport(deps)` | `src/features/scoring/application/` | AI-retry queue depth/age/stuck-jobs/retry stats |
| `extractRecruiterEmail(text)` | `src/shared/infrastructure/text.ts` | **Already existed pre-Phase-1** — email extraction with excluded-prefix filtering (relevant for Phase 2 Task 9, don't rebuild) |

## Schema changes (3 new migrations, all additive/forward-only)

- `jobs`: + `fingerprint text not null default ''` (indexed, not unique), + `canonical_company_name text not null default ''`.
- `job_duplicates` (new table): `id, canonical_job_id → jobs, source, source_job_id, url, first_seen_at, last_seen_at`, unique `(source, source_job_id)`. RLS: authenticated read-only.
- `scrape_runs`: + `duplicate_count integer`, + `failure_category text` (nullable; values are a TS union, not a PG enum — see `FailureCategory`).
- `job_scores`: + `retry_count integer not null default 0`. New RPC `upsert_job_score(...)` — **`ScoreRepository.insertScore` now calls this RPC, not a plain upsert.**

**Outstanding op:** `npm run backfill:fingerprints` must run once against the real DB after migrations deploy (existing rows default to `fingerprint=''`).

## Interface changes callers must know about

- `JobRepository.upsertMany` return type: `UpsertResult` gained required `duplicates: number`.
- `NotificationRepository` gained required `markManyNotified(jobIds: string[]): Promise<void>`.
- `ScoreRepository` gained required `findAwaitingAi(roleSelectionId, resumeVersion, keywordThreshold): Promise<AwaitingScoreJob[]>`.
- `ScrapeRunRepository` gained required `listRecentBySource(source, limit): Promise<ScrapeRun[]>`.
- `ScrapeRun`/`NewScrapeRun` gained `duplicateCount`/`failureCategory` (nullable/optional, backward compatible).
- Any new fake/mock implementing these interfaces in tests must include the new methods (TS will fail to compile otherwise — this bit us three times this phase, check first).

## Architecture notes for Phase 2-4

- Feature module layout unchanged: `domain/` (types + repository interfaces + pure validation/classification), `application/` (pure functions + use-case composition), `infrastructure/` (Supabase repos), `actions.ts` (server actions, presentation layer). This repo's own `design/architecture.md` states dependency order **Presentation → Infrastructure → Application → Domain**, i.e. infra may import application's pure functions (confirmed in use: `SupabaseJobRepository` imports `computeFingerprint`/`normalizeCompanyName` from `application/`).
- All Phase 1 additions are **backend-only** — no UI/server actions wired for source-health or scoring-queue reports, per CLAUDE.md's "domain → application → infrastructure → tests before UI" rule. Phase 4 (Task 13, analytics) is the natural place to surface `getSourceHealthReport`/`getScoringQueueReport` in a dashboard.
- `companies` table = ATS board-token registry (greenhouse/lever/ashby only), **not** a general company directory. Don't confuse with `jobs.company_name`/`canonical_company_name` (free-text, all 6 sources). Two unrelated concepts share the word "company" in this codebase.
- `RawJob`/`JobSourceScraper.fetchJobs` per-company error handling swallows failures with `console.warn` inside each adapter (greenhouse/lever/ashby) — `scripts/scrape.ts`'s try/catch essentially never fires for those three sources in practice. This is why source-health-from-scrape_runs (Task 5) reads real signal mainly from wellfound/remoteok/mycareersfuture (whole-adapter throws) plus the `empty_feed` case for all sources. Changing this swallow-and-continue behavior is an architect-level `fetchJobs` interface change across 5 adapters (AD-13/AD-18) — out of scope unless explicitly approved.
- Testing convention: co-located `*.test.ts`, `makeX(overrides)` factory, one `describe` per unit, `queuedSupabaseClient`/`mockSupabaseClient` for repository tests (`src/shared/infrastructure/testing/supabaseQueryMock.ts`).
- No ESLint config in this repo — quality gates are `npx tsc --noEmit`, `npx vitest run`, `npm run build`, `npm run check:service-role-boundary`.

## Assumptions carried forward

- No live Supabase instance available in this sandbox this session — all verification is via `tsc`/`vitest`/`next build` + mocked repositories, never a real `supabase db push`. Flag this to the user before assuming migrations are live.
- Single-user app (no multi-tenancy) — every design choice in Phase 1 assumed this (e.g. no per-user scoping needed anywhere).
- "Caveman Full": every Phase 1 addition avoided new dependencies, AI calls, and unnecessary abstraction — keep that bar for Phase 2-4.

## Remaining work (backlog)

Phase 1 (Tasks 1-7): **done**, see `phase-1-report.md`.

Not started: Phase 2 (Task 8 career-site discovery, Task 9 email extraction — note `extractRecruiterEmail` already exists, Task 10 salary extraction), Phase 3 (Task 11-12 AI cost optimization), Phase 4 (Task 13 analytics dashboards, including wiring Phase 1's backend-only reports into UI).
