# Architecture

This is a lifecycle- and extension-point-focused companion to `design/architecture.md` (which owns the component/sequence diagrams — not repeated here to avoid the doc duplication this session's audit specifically flagged). Read `design/architecture.md` first for the visual model; read this for "how do I extend X" and "what happens when Y runs, end to end."

## 1. Major Components

| Component | Where | Talks to |
|---|---|---|
| Web app (Next.js 15, App Router) | `src/app/`, `src/features/*/actions.ts` | Supabase (anon key + session, RLS enforced) |
| Cron scripts | `scripts/*.ts` | Supabase (service role key, RLS bypassed), OpenRouter, Telegram, ATS/board APIs |
| Database | Supabase Postgres | Sole source of truth — no secondary cache |
| AI | OpenRouter (model configurable) | Called only from `score.ts` (scoring) and `roles/actions.ts` (role expansion fallback) |
| Notifications | Telegram Bot API | Called only from `notify.ts` and the inbound webhook route |

Every feature (`src/features/<name>/`) is internally layered `domain/ → application/ → infrastructure/`, dependencies flowing inward only (AD-02, AD-03). The composition root — where concrete infrastructure gets wired into application use-cases — is always presentation-layer code: a page, a server action, or a `scripts/*.ts` entry point. Never the reverse.

## 2. Scraper Lifecycle

1. `scrape.ts` loads the active role selection; **if none exists, the entire run is skipped** (AD-15) — this is deliberate, not a bug, to avoid ingesting unfiltered noise before a role is configured.
2. For each source: fetch (ATS API call or feed pull) → normalize to `RawJob[]` → filter by role match (`features/sources/domain/roleMatch.ts`) → tag geography (`tagLocations.ts`) → drop untagged.
3. For each surviving job not already known by `(source, source_job_id)`: compute a cross-source fingerprint (`computeFingerprint.ts`) and check it against every existing job; a match records provenance in `job_duplicates` and skips the insert (AD-16) — otherwise upsert into `jobs`, enriched at write time with best-effort salary/contact-email/job-attribute extraction (`extractSalary.ts`/`extractContactEmail.ts`/`extractJobAttributes.ts`, all deterministic regex, AD-21/22/25).
4. Every source's outcome (found/kept/inserted/updated/duplicate counts, timing, failure category) is logged to `scrape_runs`, independent of whether the source's own probe-based health status (`companies.health_status`) exists — this is what makes `getSourceHealthReport` work uniformly across board-token and feed-based sources (AD-18).
5. Per-source failures are isolated — one source throwing never blocks the others (AD-04's sibling concern).

## 3. Scoring Lifecycle

1. `score.ts` loads the active resume + role selection; finds jobs matching the active role with no `job_scores` row, or an existing row with `ai_score IS NULL` (retryable, AD-14).
2. Per job: `computeKeywordScore` (skill-dictionary overlap, always free, always runs) → if `>= KEYWORD_THRESHOLD`, one OpenRouter call (15s timeout, 1 retry) for `ai_score`/`ai_reasoning`.
3. Every write goes through the `upsert_job_score` RPC (atomic, also increments `retry_count` when a write still leaves `ai_score` null — AD-19), never a plain client-side upsert.
4. After the run, `getScoringQueueReport()` logs queue depth / oldest-pending age / stuck-job visibility — informational only, does not change retry behavior.

## 4. Notification Lifecycle

1. `notify.ts` queries jobs with `ai_score >= NOTIFY_THRESHOLD` and no `notifications_log` row.
2. Loads `NotificationPreferences` (optional; absent = notify all) and applies include filters (role/skill/location/experience/source) then exclude filters (blocked companies/employment types, v1.2) — `filterMatches.ts`, unit-tested against the exact same title+description text source `scoreJob.ts` uses (a real bug fixed in v1.2, see `docs/decisions.md`/`docs/reviews/2026-07-04/technical-debt.md`).
3. Formats a Telegram message (`formatMatchMessage.ts` individual / `formatDigestMvp.ts` digest), including "why this job" highlight badges (`buildJobHighlights.ts`) derived from data already computed at ingest — no extra AI calls, no extra queries.
4. Sends via `TelegramBotSender`; marks `notifications_log` **only after** a successful send (per-job for individual mode, batched via `markManyNotified` for digest mode — AD-17), so a failed send retries next run rather than being silently dropped or falsely marked sent.

## 5. Health Monitoring

Two independent, deliberately-not-merged signals (AD-18, documented disagreement risk in `design/limitations.md` §8):
- **Probe-based** (`companies.health_status`) — board-token sources only, updated by the separate `validate-sources.ts` cron (weekly, `validate-sources.yml`), drives auto-disable (`listActiveHealthy`) for actual scrape runs.
- **Scrape-run-derived** (`computeSourceHealthSummary`) — every source including feed-based ones, computed from `scrape_runs` on every `scrape.ts` run, informational only (does not currently drive scraper selection).

Both are surfaced side by side on `/analytics`.

## 6. Extension Points

These are the places this codebase was built to grow from, each already exercised at least once by a real prior change — meaning the pattern is proven, not speculative:

| To add... | Do this | Precedent to copy |
|---|---|---|
| A new job source | Implement `JobSourceScraper` (`features/sources/domain`), add a new `JobSource` enum value + migration, register in the source registry | Any existing adapter in `features/sources/infrastructure/` |
| A new deterministic job-posting signal (salary-like) | One pure function in `features/jobs/domain/`, own migration for new column(s), wire into `ingestJobs.ts` | `extractSalary.ts`, `extractContactEmail.ts`, `extractJobAttributes.ts` (AD-21/22/25) — **not** a shared "misc extractors" file |
| An AI improvement | Only via `AiScoreProvider`'s existing interface (`features/scoring/domain`) or a genuinely new gated stage — AD-07/AD-14 establish the "keyword gate before AI" pattern as load-bearing, don't bypass it | `OpenRouterAiScoreProvider` |
| A new notification channel | New `infrastructure/` implementation of the notification-send interface; `TelegramSender`'s interface already abstracts "format → send → mark" | `TelegramBotSender.ts` |
| A new analytics metric | One pure `computeX(rows) -> DTO[]` function in `features/insights/application/`, one narrow repository query method, one UI component on `/analytics` — never a generic aggregation framework | `computeJobsByCompany.ts`, `computeSalaryStats.ts` (AD-24) |
| Resume intelligence beyond skill tagging | New pure function in `features/resume/application/`, called from the existing upload flow — the skill dictionary (`shared/config/skills-dictionary.ts`) is the single point of truth to extend first | `parseMinYears.ts`'s "parse one more signal from text" shape |
| A new production verification check | One file under `features/verification/infrastructure/checks/<category>/` implementing the `Check` interface; wire it into `buildChecks()` in `scripts/verify-production.ts`. Return `SKIPPED_NO_SUPABASE_CLIENT` when a Supabase client is required but unavailable; populate `probableCause`/`suggestedFix`/`affectedSubsystem`/`docReference` on every non-pass branch | Any existing check under `features/verification/infrastructure/checks/` — see `docs/operations/production-verification.md` §1.1 for the full checklist |

**Verified simple:** every extension point above is "one new file following an existing file's shape," not "add an abstraction layer." That's intentional (CLAUDE.md: no new architecture without approval) and this session's review confirms it still holds after four completed phases — no extension point has needed a new abstraction yet.
