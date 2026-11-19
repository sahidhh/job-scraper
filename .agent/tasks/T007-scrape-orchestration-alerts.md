---
id: T007
title: Update scripts/scrape.ts with enabled_sources filtering and instant Telegram alerts
status: pending
gate_level: 2
priority: high
agent: {role: backend, tier: sr, fallback: agent_default}
dependencies: [T004, T005, T006]
requirements: [REQ-F004, REQ-F006]
---
# Objective
Update `scripts/scrape.ts` (and extract a testable orchestration function if needed) to filter `sourceScrapers` by `settingsRepository.getEnabledSources()` and send an instant operational Telegram alert whenever a source throws `SourceAuthExpiredError` / `SourceBlockedError` or returns 0 jobs.

# Context
- `scripts/scrape.ts` currently loops all `sourceScrapers` unconditionally and only logs errors to `scrape_runs` + `console.error`.
- `TelegramBotSender` (`src/features/notifications/infrastructure/TelegramBotSender.ts`) sends HTML alerts using `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`.

# Inputs
- `scripts/scrape.ts`
- `src/features/settings/domain/SettingsRepository.ts` (from T005)
- `src/features/sources/domain/errors.ts` (from T006)
- `src/features/notifications/infrastructure/TelegramBotSender.ts`

# Scope
Included: Filtering `sourceScrapers` by `enabled_sources`, catching `SourceAuthExpiredError` / `SourceBlockedError` and 0-job responses to send an operational Telegram alert, and unit tests for the orchestration logic.
Excluded: Modifying `scripts/score.ts` or `scripts/notify.ts`.

# Implementation guidance
1. Extract `runScrapePipeline` (or similar pure/DI helper) from `scripts/scrape.ts` so it can be unit-tested with repository/scraper/telegram doubles without hitting live Supabase or Telegram.
2. Read `enabledSources = await settingsRepository.getEnabledSources()` and skip any scraper whose `scraper.source` is not in `enabledSources` (logging `[scrape] <source>: disabled in settings, skipping`).
3. If `scraper.fetchJobs` throws `SourceAuthExpiredError` or `SourceBlockedError`, record the failed `scrape_runs` row, send an immediate Telegram alert (e.g., `⚠️ <b>${scraper.source}</b> auth/block: ${err.message} — refresh cookies`), and continue to the next enabled source without retrying the failed one.
4. If `scraper.fetchJobs` returns `rawJobs.length === 0`, record `failureCategory: "empty_feed"` and send an operational Telegram alert (`⚠️ <b>${scraper.source}</b> returned 0 jobs — check cookies/selectors`).
5. Wrap Telegram alert sending in try/catch so a Telegram outage never aborts `scrape_runs` recording or remaining sources.

# Expected outputs
- Updated `scripts/scrape.ts` (and extracted helper if applicable)
- Unit tests covering `enabled_sources` filtering, auth/block Telegram alert, and 0-job Telegram alert

# Acceptance criteria
Blocking:
- [ ] AC-007-1: Disabled sources in `enabled_sources` are skipped and `fetchJobs` is never called on them.
- [ ] AC-007-2: `SourceAuthExpiredError`, `SourceBlockedError`, and 0-job responses trigger an operational Telegram alert and record the appropriate `scrape_runs` status/category.
Quality:
- [ ] Telegram alert failure is logged and does not crash the scrape loop.
Compatibility:
- [ ] `npm run scrape` CLI behavior and `markExpiredJobs` sweep remain intact.

# Verification
- `npx vitest run` (including new scrape orchestration test)
- `npm run typecheck`

# Constraints
- Do not change `JOB_EXPIRATION_DAYS` default behavior unless specified.

# Handoff
Return: status, summary, changed files, test results.

# Failure handling
- On test failure, fix orchestration or test doubles and re-run Vitest.
