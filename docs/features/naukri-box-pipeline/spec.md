# Naukri & NaukriGulf Box Pipeline + Role/Telegram Redesign

## Problem Statement

Job discovery in `job-scraper` currently suffers from three coupled issues:

1. **Missing high-signal portals:** Naukri (India) and NaukriGulf (UAE/Gulf) are not integrated into the pipeline, even though they hold the highest concentration of matching 2+ year `.NET` / Full Stack roles. Running them from GitHub Actions risks datacenter-IP blocks.
2. **Dashboard & scoring bloat:** Role matching currently checks `expandedRoles` as substrings inside the full job `description` rather than the job `title`, and `minYears > 3` or off-stack roles still enter the database and consume AI scoring tokens. Meanwhile, switching `role_packs` inserts a brand-new `role_selections` UUID, orphaning prior `job_scores` and forcing an unnecessary full re-score.
3. **One-way notification UX:** Telegram sends a single text digest dump with `[Apply]` links only. Marking a job as `Applied`, `Skipped`, or `Closed` requires opening the web dashboard separately, and there are no automated alerts when portal cookies expire or scrapes return 0 jobs.

## Solution

Move daily scraping to a **08:30 IST DietPi box cron** (residential IP) with GitHub Actions `scrape.yml` kept disabled:

1. Add `naukri` and `naukrigulf` as **first-class `JobSource`s** (and rename `claude_routine` to `routine_agent`), while adding an **`enabled_sources`** toggle in `/settings` so existing ATS/feed scrapers stay in code but can be turned off in the UI.
2. Redesign the **role & pre-DB filtering** pipeline: reuse `role_selections` rows per pack (no orphan re-scoring), match roles against **job title only** (allowlist + denylist), hard-drop `minYears > 3` before DB insert/AI scoring, and purge/archive old untouched bloat while preserving active-status rows.
3. Upgrade **Telegram UX** to send up to **8 compact per-job cards/day** (with a `< 24h` freshness boost) featuring inline `[🔗 Apply]`, `[✅ Applied]`, `[⏭️ Skip]`, and `[🚫 Closed]` buttons wired through the Vercel `/api/telegram/webhook` to Supabase, plus instant operational alerts on cookie expiry (`401`/`403`/login redirect) or 0-job runs, paired with 1-command laptop and Termux/Tailnet SSH cookie refresh helpers.

## User Stories

1. As a job seeker, I want Naukri (India) and NaukriGulf (UAE/Gulf) added as first-class sources, so that I can filter, score, and track them alongside existing sources in the dashboard.
2. As a job seeker, I want `claude_routine` renamed to `routine_agent`, so that ad-hoc agent imports have a generic, future-proof source name.
3. As a job seeker, I want an `enabled_sources` checklist in `/settings`, so that I can enable `naukri` and `naukrigulf` and disable ATS/feed scrapers without deleting code or editing env vars.
4. As a job seeker, I want the daily scrape/score/notify run scheduled on my DietPi box at 08:30 IST on my residential IP, so that Naukri/NaukriGulf do not block datacenter IPs and I apply early in the recruiter queue.
5. As a job seeker, I want Naukri/NaukriGulf fetchers to use saved account cookies with 3–8s jitter and a strict daily page cap, so that fetching stays low-risk and mimics normal browsing.
6. As a job seeker, I want the box pipeline to stop immediately and send a Telegram alert on `401`/`403`, login redirects, or 0-job responses, so that I know right away when cookies expire or a portal blocks requests.
7. As a job seeker, I want a 1-command cookie sync script from my laptop Chrome and a Termux/Tailnet SSH refresh shortcut on my phone, so that I can refresh expired cookies in under a minute from anywhere.
8. As a job seeker, I want role matching to check only the job title against a title allowlist and denylist (never `description` substrings), so that Sales, Staff, Manager, Intern, QA, or Java-only roles do not pollute my feed.
9. As a job seeker, I want jobs with `minYears > 3` hard-dropped before database insertion and AI scoring, so that senior listings never bloat the dashboard or waste OpenRouter tokens.
10. As a job seeker, I want `activateRolePack` to reuse the existing `role_selections` row for that pack instead of generating a new UUID every time, so that switching role packs never invalidates existing `job_scores` or forces a full re-score.
11. As a job seeker, I want a one-time cleanup that preserves all jobs with active user statuses (`Applied`, `Interview`, `Saved`, etc.) and archives/purges old untouched bloat, so that my dashboard starts clean.
12. As a job seeker, I want AI scoring to boost postings published within the last 24 hours, so that fresh Naukri/NaukriGulf jobs rank at the top of my daily 8-job queue.
13. As a job seeker, I want Telegram to send up to 8 compact per-job cards per day instead of a single text dump, so that scanning matches on mobile is fast and readable.
14. As a job seeker, I want each Telegram job card to include `[🔗 Apply]`, `[✅ Applied]`, `[⏭️ Skip]`, and `[🚫 Closed]` inline buttons, so that I can open the job and update its status in Supabase without opening the web dashboard.
15. As a job seeker, I want tapping `[✅ Applied]`, `[⏭️ Skip]`, or `[🚫 Closed]` in Telegram to update `job_state` (or `jobs.is_active` for Closed) in Supabase and edit the card in place, so that I get immediate confirmation and never see the same job twice.

## Implementation Decisions

### 1. First-Class Sources & `routine_agent` Rename
- Extend the `job_source` Postgres enum and domain `JobSource` union with `naukri` and `naukrigulf`, and rename `claude_routine` to `routine_agent` (migrating existing `jobs` rows).
- Include `naukri` and `naukrigulf` in `JOB_SOURCES` and `sourceScrapers` so they participate in scrape health tracking, `ingestJobs` enrichment, `scoreJob` AI scoring, and dashboard `FilterBar` source filtering. Keep `careers_url` and `routine_agent` excluded from scheduled cron health checks.

### 2. Settings-Driven `enabled_sources`
- Add an `enabled_sources` configuration (array of `JobSource` values, persisted in the `settings` table) exposed via a Settings UI card under `/settings`.
- Default `enabled_sources` to `["naukri", "naukrigulf"]` after migration; `scripts/scrape.ts` filters `sourceScrapers` by `enabled_sources` before fetching so disabled scrapers are skipped without removing their code.

### 3. Naukri & NaukriGulf Scrapers + Cookie Auth
- Implement `NaukriScraper` and `NaukriGulfScraper` conforming to `JobSourceScraper` (`requiresCompanyConfig: false`).
- Both scrapers read session cookies from a local box cookie store (path configurable via env, gitignored), apply 3–8s random jitter between requests, and query target 1–3 year experience filters (`?experience=2`, `.NET` / `C#` / `Full Stack` / `Software Engineer`, India + Remote for Naukri; UAE/Gulf for NaukriGulf).
- Introduce a typed auth/block error (`SourceAuthExpiredError` / `SourceBlockedError`) when a portal returns `401`, `403`, a login redirect, or an unexpected 0-job payload; abort that source immediately without retrying and emit an operational Telegram alert.
- Provide two lightweight cookie-refresh utilities for the box:
  - Laptop sync script: extracts Naukri/NaukriGulf cookies from Chrome CDP or a `cookies.json` export and SCPs them to the DietPi box over Tailnet/LAN.
  - Phone Termux/SSH shortcut: prompts for or reads clipboard `Cookie` header over Tailnet SSH and updates the box cookie store.

### 4. Role Pack Reuse & Pre-DB Quality Gates
- **Role pack ID reuse:** Update `SupabaseRoleRepository.setActiveSelection` (and its Postgres RPC) so activating a `role_pack` looks up or upserts a deterministic `role_selections` row keyed by pack/normalized-role signature instead of inserting a fresh UUID every time. Existing `job_scores` remain valid across pack switches.
- **Title-only matching:** Update `roleMatch` and `buildRoleFilter` to evaluate against `job.title` only (never `description`). Combine a configurable Title Allowlist (e.g., `software engineer`, `sde`, `full stack`, `.net`, `c#`, `backend`, `developer`) with a Title Denylist (e.g., `senior`, `sr.`, `staff`, `principal`, `lead`, `manager`, `architect`, `intern`, `qa`, `tester`, `sales`, `support`, `devops`, `java`).
- **Pre-DB `minYears > 3` hard-drop:** Run title allowlist/denylist and `minYears > 3` checks inside `ingestJobs` *before* database upsert and AI scoring so mismatched jobs are dropped immediately.
- **One-time bloat cleanup:** Provide an idempotent maintenance script/migration that preserves all `jobs` rows linked to `job_state` (any user status such as `Applied`, `Saved`, `Interview`) or `applications`, and archives/deletes older untouched rows.

### 5. Freshness Boost & Daily Box Cron
- Add a `< 24h` freshness boost in scoring/ranking so recently posted Naukri/NaukriGulf jobs sort ahead of older listings when selecting the daily top 8.
- Add a DietPi box cron/systemd timer entry running at **08:30 IST** daily (`scrape` → `score` → `notify`), while keeping GitHub Actions `scrape.yml` disabled.

### 6. Interactive Telegram Card UX & Webhook Callbacks
- Replace the single-message text dump in `notify` with **up to 8 individual compact HTML job cards per day** (title, company, location, `minYears`, score, freshness badge, 1-line highlight) sent to the existing `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`.
- Attach an inline keyboard to each card:
  - `[🔗 Apply]` (`url`: `job.url`)
  - `[✅ Applied]` (`callback_data`: `st:applied:<jobId>`)
  - `[⏭️ Skip]` (`callback_data`: `st:skipped:<jobId>`)
  - `[🚫 Closed]` (`callback_data`: `st:closed:<jobId>`)
- Extend `/api/telegram/webhook` (hosted on Vercel) to handle `st:<action>:<jobId>` callbacks:
  - `applied` / `skipped`: upsert `job_state` status in Supabase (creating/mapping the corresponding `job_statuses` row).
  - `closed`: mark `jobs.is_active = false` (and `job_state` if applicable).
  - Edit the Telegram card message in place (`editMessageText` / `editMessageReplyMarkup`) to append the confirmed state and remove action buttons so duplicate clicks are prevented.

## Testing Decisions

Testing should verify external behavior at the highest practical seam, following existing repository patterns (Vitest unit/integration tests with repository doubles/mocks):

- **Pre-DB quality gates (`ingestJobs` + `roleMatch` + `buildRoleFilter`):** Test that title-only allowlist/denylist drops `Senior`/`Staff`/`Sales`/`Java` titles even when `description` contains `Software Engineer`, and drops `minYears > 3` before `upsertMany` is called. Prior art: `ingestJobs` and `roleMatch` unit tests.
- **Settings `enabled_sources` (`scrape` orchestration):** Test that only sources present in `enabled_sources` are invoked while disabled sources are skipped cleanly.
- **Role pack ID reuse (`activateRolePack` / `setActiveSelection`):** Test that switching between two packs and switching back reuses the same `role_selection_id` and preserves `job_scores`.
- **Naukri & NaukriGulf scrapers:** Test HTML/JSON fixture parsing, `minYears` extraction, and that `401`/`403`/login-redirect/empty responses throw `SourceAuthExpiredError` / `SourceBlockedError` and trigger the alert path. Prior art: `MyCareersFutureScraper.test.ts`, `AdzunaScraper.test.ts`.
- **Telegram card formatter & webhook (`st:` callbacks):** Test callback payload parsing, `401` secret rejection, Supabase state update for `applied`/`skipped`/`closed`, and in-place message edit calls. Prior art: existing Telegram webhook and `buildDigestKeyboard` tests.

## Out of Scope

- Automated browser submission ("auto Easy Apply") on Naukri or NaukriGulf.
- Re-enabling GitHub Actions `scrape.yml` for Naukri/NaukriGulf.
- Creating a new Telegram bot or migrating away from the existing Vercel-hosted webhook.
- Building a web UI editor for custom cookie strings inside the Next.js app.

## Further Notes

- Check existing `job_statuses` names in Supabase before wiring `st:applied` and `st:skipped` callbacks so the webhook maps to the exact status IDs/names configured in `/settings/workflow`.
- Keep `scripts/outreach/cdp_helper.py` intact for optional manual/semi-auto Chrome CDP sessions when applying to queued links.
