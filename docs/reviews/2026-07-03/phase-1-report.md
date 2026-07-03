# Phase 1 Report — Pipeline Reliability

**Date:** 2026-07-03
**Branch:** `claude/job-scraper-stabilization-s8mzi5`
**Commits:** `e26b6d9`, `029f326`, `9abf075`, `8a8e56a`

## Objective

Make the existing scrape → score → notify pipeline reliable: no duplicate jobs, no inconsistent
scoring/notification state, and operational visibility into source and scoring-queue health — without
redesigning the architecture (Caveman Full: reuse, no AI, no new dependencies, deterministic).

## Implementation Summary

### Task 1-2 — Cross-source duplicate detection + title normalization
- `computeFingerprint(title, companyName, locationTags)` (sha256 of normalized title + canonical
  company + sorted location tags) is computed at write time in `SupabaseJobRepository`.
- `normalizeTitle.ts`: lowercases, strips punctuation, removes seniority tokens
  (senior/sr/junior/jr/lead/staff/principal/I-IV), expands ~15 common abbreviations (eng→engineer,
  swe→software engineer, etc.).
- `upsertMany` now splits each batch into: existing-key updates (unchanged), new-fingerprint inserts,
  and fingerprint-match duplicates (skipped from `jobs`, recorded to new `job_duplicates` table for
  provenance, canonical job's `last_seen_at` refreshed). `UpsertResult` gained `duplicates: number`.

### Task 3 — Company normalization
- `normalizeCompanyName.ts`: strips trailing legal-entity (LLC/Inc/Corp/...) and regional-office
  (India/Singapore/.../APAC) suffixes, re-capitalizes. Stored as `jobs.canonical_company_name`
  alongside the untouched original `company_name`.

### Task 4 — Notification idempotency/retry-safety verification
- Audited `sendNotification`/`sendDigest`/`sendDigestMvp`/`SupabaseNotificationRepository`/
  `TelegramBotSender` end to end. Confirmed exactly-once via `notifications_log UNIQUE(job_id)` +
  `on conflict do nothing`, and that every send site marks notified only after a successful send
  (failures retry next cron run).
- **Found and fixed a real gap:** `sendDigest`/`sendDigestMvp` send one Telegram message covering many
  jobs, but marked each notified in a per-item loop — a write failure partway through left the batch
  half-marked, contradicting the code's own "all unmarked for retry" comment. Added
  `NotificationRepository.markManyNotified()` (single batched upsert) and switched both digest senders
  to it.

### Task 5/7 — Source health improvements + failure classification + failed-source monitoring
- `classifyScrapeFailure.ts`: deterministic keyword/status-code classifier →
  `timeout | parsing | selector | captcha | blocked | authentication | rate_limited | not_found |
  empty_feed | unknown`. Wired into `scripts/scrape.ts`'s catch path and into the success path
  (`empty_feed` when a source returns zero raw jobs).
- `computeSourceHealthSummary`/`getSourceHealthReport`: per-source success rate, average latency,
  consecutive failures, last success/failure, recovery detection, and a deterministic recommendation
  string — computed from `scrape_runs`, so it covers **every** source including the three feed-based
  ones (wellfound/remoteok/mycareersfuture) that have no `companies` row and are therefore invisible
  to the existing probe-driven `companies.health_status` tracking.
- This is a second, independent health signal; it does not yet drive `listActiveHealthy`'s
  auto-disable/auto-skip decisions (that remains probe-based, unchanged, working).

### Task 6 — Pending-scoring monitoring
- `job_scores.retry_count`, incremented atomically by a new `upsert_job_score` RPC only when a write
  still leaves `ai_score` null (a plain client `.upsert()` can't express that conditional increment
  without a read-modify-write per job).
- `ScoreRepository.findAwaitingAi` + `computeScoringQueueSummary`/`getScoringQueueReport`: AI-retry
  queue depth, oldest-pending age, stuck jobs (default 48h threshold, `SCORING_STUCK_THRESHOLD_HOURS`),
  max/avg retry count. Logged by `scripts/score.ts` after every run.

## Files Modified

59 files changed across 4 commits, ~1,700 insertions. Highlights:
- New: `computeFingerprint.ts`, `normalizeTitle.ts`, `normalizeCompanyName.ts` (+tests), `classifyScrapeFailure.ts`, `computeSourceHealthSummary.ts`, `getSourceHealthReport.ts`, `computeScoringQueueSummary.ts`, `getScoringQueueReport.ts`, `scoringQueueConfig.ts` (+tests for all).
- Modified: `SupabaseJobRepository.ts` (dedup logic), `SupabaseNotificationRepository.ts` (`markManyNotified`), `SupabaseScoreRepository.ts` (RPC-based `insertScore`, `findAwaitingAi`), `SupabaseScrapeRunRepository.ts` (`listRecentBySource`, `failure_category`), `scripts/scrape.ts`, `scripts/score.ts`.
- New script: `scripts/backfill-fingerprints.ts` (+ `npm run backfill:fingerprints`).
- Docs: `design/{architecture,erd,scope,limitations,security,tech-stack,use-cases}.md`, `docs/decisions.md` (AD-16, AD-17, AD-18, AD-19), `docs/repositories.md`.
- Test fixes unrelated to this phase's scope but required for a green suite: two stale `buildDigestKeyboard.test.ts` assertions from a prior mailto-button-removal commit.

## Database Changes

Three new migrations (all forward-only, additive, no data loss):

| Migration | Change |
|---|---|
| `20260703000001_job_fingerprint_dedup.sql` | `jobs.fingerprint`, `jobs.canonical_company_name` (default `''`), index on `fingerprint`; new `job_duplicates` table + RLS; `scrape_runs.duplicate_count` |
| `20260703000002_scrape_run_failure_category.sql` | `scrape_runs.failure_category text` (nullable, plain text — fixed value set lives in TS, not a PG enum) |
| `20260703000003_job_scores_retry_tracking.sql` | `job_scores.retry_count integer default 0`; new `upsert_job_score(...)` RPC function |

**Post-deploy step required:** run `npm run backfill:fingerprints` once to populate `fingerprint`/
`canonical_company_name` for jobs ingested before the first migration (they default to `''`, which is
safe — never falsely matched, just not yet deduped against until backfilled).

## Architecture Decisions

Recorded in `docs/decisions.md` as AD-16 through AD-19 (each with rationale, alternatives considered,
and consequences):
- AD-16: fingerprint-based cross-source dedup, deterministic, no fuzzy/AI matching, app-level
  check-then-skip rather than a DB unique constraint.
- AD-17: notification pipeline verified; `markManyNotified` batching fix for digest senders.
- AD-18: source-level health summary from `scrape_runs`, independent of `companies.health_status`.
- AD-19: `retry_count` via atomic RPC rather than a read-modify-write or magic time-based estimate.

## Testing

- 513 tests passing (up from 483 pre-Phase-1), all new logic covered: pure-function unit tests
  (normalization, fingerprinting, classification, summary computation) following the existing
  `makeX()` factory + one-`describe`-per-unit pattern, and repository tests using the existing
  `queuedSupabaseClient`/`mockSupabaseClient` fakes.
- `npx tsc --noEmit` clean throughout.
- `npm run build` (Next.js production build) succeeds after every commit.
- `npm run check:service-role-boundary` passes (service-role key still only touched in `scripts/`).
- No live Supabase instance in this sandbox — migrations and the RPC function are unit-testable via
  mocks but not exercised against a real Postgres instance in this session. Recommend running
  `supabase db push` (or equivalent) and `npm run backfill:fingerprints` in the next real deploy,
  then spot-checking a `scrape.ts`/`score.ts` run.

## Performance Impact

- Dedup check adds one indexed `IN` query per scrape batch (bounded by batch size) plus, only when
  duplicates are found, one `job_duplicates` upsert and one `jobs.last_seen_at` touch — negligible at
  this project's scale (a few hundred jobs per source per run).
- `markManyNotified` reduces N round trips to 1 for digest sends (net faster, not slower).
- `upsert_job_score` RPC replaces a client-side upsert with a single Postgres function call — same
  round-trip count as before, no N+1 introduced.
- `getSourceHealthReport`/`getScoringQueueReport` are read-only, run once per script invocation
  (not per-job), and are bounded by a small `runWindow`/queue size.

## Risks

- Two independent source-health signals (`companies.health_status` vs. the new `scrape_runs`-derived
  summary) can disagree until reconciled or one drives the other — documented in `design/limitations.md`,
  not fixed this phase (would require an architect-level change to `JobSourceScraper.fetchJobs` per
  AD-13/AD-18).
- Seniority-token stripping in `normalizeTitle` is a deliberate but real tradeoff: a Senior and
  non-senior posting for the same title/company/location now fingerprint-match as one logical job.
- The narrow at-least-once (not exactly-once) notification window (send succeeds, the following
  `notifications_log` write throws) is documented, not closed — disproportionate fix for a personal tool.

## Future Improvements / Remaining Work (backlog, not this phase)

- Wire `getSourceHealthReport`/`getScoringQueueReport` into a dashboard (Phase 4 Task 13).
- Reconcile or merge the two source-health signals; consider having `scrape.ts` itself update
  `companies.health_status` on real scrape failures (requires the `JobSourceScraper.fetchJobs`
  interface change AD-13 flagged as architect-level).
- Phases 2-4 (career-site discovery, email/salary extraction, AI cost optimization, analytics) — see
  `phase-1-context.md` and the top-level mission brief for scope; not started.

## Sign-off

All Phase 1 tasks (1 through 7) complete. Build, typecheck, and full test suite green. Pushed to
`claude/job-scraper-stabilization-s8mzi5`.
