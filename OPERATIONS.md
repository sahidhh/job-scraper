# Operations

Runbook for deploying, migrating, and keeping this project healthy in production. For first-time setup, follow `docs/deployment.md` step by step — this document assumes a working deployment already exists and focuses on ongoing operation.

## 1. Deployment

- **Web app:** Vercel, auto-deploys on push to `main` (standard Next.js Vercel integration — no custom workflow needed).
- **Cron pipeline:** GitHub Actions, `scrape.yml`. **Live schedule: every 6 hours** (`cron: "0 */6 * * *"`), plus manual `workflow_dispatch`. Runs `scrape → score → notify` sequentially in one job, `concurrency: { group: scrape-pipeline, cancel-in-progress: false }` so overlapping runs queue instead of racing or being killed mid-pipeline.
- **Source validation:** `validate-sources.yml`, weekly (Sunday 06:00 UTC) + manual dispatch. Probes every configured Greenhouse/Lever/Ashby board token; auto-disables sources past `SOURCE_DISABLE_THRESHOLD` consecutive failures.
- **CI:** `ci.yml`, every push/PR — service-role-boundary check, typecheck, tests. Does not run a build (build correctness is validated by `npm run verify` locally/manually — see `design/tech-stack.md` §7 for the exact gap).

## 2. Migrations

- **Location:** `supabase/migrations/*.sql`, forward-only (AD-11) — 36 files as of this session. Never edit a merged migration; write a new one to undo/change something.
- **Auto-apply:** `migrate.yml` runs `supabase db push` on every push to `main`. **This means migrations apply automatically on merge** — they are not a manual "remember to run this" step for changes that reach `main`, correcting an assumption baked into several older docs (`docs/deployment.md` §2 documents the manual `supabase db push` command for the *initial* project setup only, before any CI/CD exists yet).
- **Types:** `supabase/database.types.ts` should be regenerated (`supabase gen types typescript --linked`) after every migration lands on a real project. In this sandboxed environment (no live Supabase project reachable), it has been **manually hand-edited to match each migration** — always diff a fresh `gen types` output against it after the first migration on a real project, since manual edits can drift.
- **Rollback:** there is no down-migration path by design (AD-11). To undo a change, write a new forward migration.

## 3. Backfills

One-off scripts for data that predates a migration (safe to re-run — idempotent by construction):

| Script | Purpose |
|---|---|
| `npm run backfill:fingerprints` | Populates `jobs.fingerprint` for rows inserted before cross-source dedup (AD-16) shipped |
| `npm run backfill:min-years` | Re-parses `min_years` for existing rows where it's null |

Neither is wired into any scheduled workflow — run manually, once, after the relevant migration lands on a project that has pre-existing data.

## 4. Health Checks

| Command | Checks |
|---|---|
| `npm run doctor` | Required/optional env vars present; live Supabase query + Telegram `getMe` call succeed. **Run this first** whenever a cron run fails with a missing-env-var-shaped error |
| `npm run health` (= `validate-sources`) | Every configured ATS board token is reachable |
| `npm run verify` | typecheck + full test suite + production build — the pre-merge/pre-deploy gate |

`/analytics` in the web app is the always-on visual health check: source health (both signals, AD-18), scoring queue depth/stuck jobs (AD-19), pipeline stats.

## 5. Diagnostics

| Command | Use when |
|---|---|
| `npm run diagnose` | A source's job count looks wrong — shows recent-run/failure history + the fetch→location-filter→ingest funnel per source |
| `npm run analytics` (= `source-analytics.ts`) | Deciding whether a source is worth keeping — 30-day keep-rate/low-performer report |
| `npm run report:sources` | Just the recent-run/failure view, without the funnel analysis |

## 6. Recovery Procedures

| Symptom | Cause | Recovery |
|---|---|---|
| A cron run fails with an env-var error | Missing/rotated secret | `npm run doctor` locally with the same env to confirm which var; fix in GitHub Actions secrets |
| A source stuck `disabled` in `companies.health_status` | `SOURCE_DISABLE_THRESHOLD` consecutive probe failures | Fix the board token / confirm the board still exists, then it self-heals on the next successful `validate-sources` probe (no manual re-enable needed — `health_status` resets to `active` automatically) |
| Jobs stuck with `ai_score` permanently null | OpenRouter outage/quota, or the job's `keyword_score` is below `KEYWORD_THRESHOLD` | Check `getScoringQueueReport`'s "stuck jobs" list (past `SCORING_STUCK_THRESHOLD_HOURS`, default 48h) on `/analytics`; retries happen automatically on the next `score.ts` run (AD-14) — nothing to manually re-trigger unless OpenRouter itself is down |
| A logically-duplicate job appears as two rows | Ingested before `backfill:fingerprints` was run, or a genuine title/company/location normalization miss | Run the backfill once if not yet done; otherwise this is a known limitation (`design/limitations.md` §1.7), not a bug to "fix" per row |
| Telegram notifications stop arriving entirely | Bot blocked/removed from chat, or `TELEGRAM_CHAT_ID` wrong | `npm run doctor` checks the bot token (`getMe`) but **not** whether the bot can still post to the configured chat — verify manually by sending a test message; there is no backoff/dead-letter for a permanently-failing chat (`design/limitations.md` §4.1), so a bad chat ID fails silently forever until fixed |
| Migration push fails in `migrate.yml` | A migration file has a syntax error or conflicts with prior schema state | Fix the migration file in a new PR — `migrate.yml` has no rollback; the failed push simply doesn't apply, main branch is unaffected until the corrected migration merges |

## 7. Monitoring

- **Recent scrape runs / notifications:** `/settings` page (`ScrapeRunsList`, `NotificationsLogList`).
- **Source health, scoring queue, pipeline stats:** `/analytics` page.
- **CI status:** GitHub Actions tab, `ci.yml` badge in `README.md`.
- **No external alerting/paging exists** — this is a personal-scale tool; monitoring is "check `/analytics` when curious," not push-based alerting. If a source silently degrades, the first signal is a lower job count on `/dashboard`, not a notification.

## 8. Troubleshooting

See `design/user-guide.md` §11 for the user-facing troubleshooting table (dashboard empty, no AI scores, Telegram silent, etc.) — not duplicated here. This section covers operator-level issues not in that table:

| Problem | Fix |
|---|---|
| `npm run verify` fails on a fresh clone | Run `npm install` first — `node_modules` is not committed |
| Cron pipeline hasn't run in >6h and no manual dispatch was made | Check the Actions tab for a `scrape-pipeline` concurrency-group backlog — a stuck run (rare; only possible if a step hangs past GitHub's own job timeout) will queue, not skip, subsequent scheduled runs |
| `check:service-role-boundary` fails in CI | A new file under `src/app/` or `src/features/` imports `createSupabaseServiceClient` or references `SUPABASE_SERVICE_ROLE_KEY` directly — move that logic into `scripts/` or use the anon-key server client instead (AD-12) |
