# Project State

Snapshot of what this repository is and does, updated through the v1.4 production-verification-framework build and its v1.x operational-excellence follow-up pass (2026-07-05). This is the **first document to read** for a human or AI session picking this project up cold — it summarizes and cross-references the deeper docs rather than duplicating them. For a faster, terser AI-specific version, see `AI_HANDOFF.md`.

## 1. What This Is

A single-user, self-hosted job discovery platform. It scrapes postings from six job sources, filters them to a user's chosen geography and role, scores them against the user's resume (cheap keyword pass, then a gated AI pass), and pushes high-match alerts to Telegram. A Next.js web app provides the dashboard, resume/role/company configuration, and analytics.

Full product scope, actors, and use cases: `design/scope.md`, `design/use-cases.md`. Full user-facing walkthrough: `design/user-guide.md`.

## 2. Repository Layout

```
src/
  app/            Next.js App Router pages + server actions (composition root)
    (auth)/login, (protected)/{dashboard,roles,resume,settings,analytics,insights}
  features/       One folder per feature, each with domain/ application/ infrastructure/ (+ actions.ts)
    sources/ jobs/ filtering/ resume/ roles/ scoring/ notifications/ insights/ companies/ settings/ auth/
  shared/         HTTP utils, Supabase clients, skills dictionary, cross-feature domain primitives
  components/     shadcn/ui + feature-specific UI components
supabase/
  migrations/     36 forward-only SQL files (AD-11) — no down-migrations
  database.types.ts   Manually-kept-in-sync generated types (see §11 caveat)
  seed.sql        role_expansion_map seed rows
scripts/          13 standalone tsx entry points — cron pipeline + one-off/manual utilities
.github/workflows/  ci.yml, scrape.yml, validate-sources.yml, migrate.yml
design/           Canonical, actively-maintained technical design docs (architecture, ERD, API reference, security, scope, limitations, user guide, tech stack)
docs/             Historical decision log (decisions.md), operational deep-dives (scrapers/scoring/repositories), and point-in-time reports/reviews/research
docs/reviews/     Dated post-phase review reports (one subfolder per session)
```

The `design/` vs `docs/` split, and which files in each are current vs. historical, is documented in `docs/reviews/2026-07-04/repository-consolidation-report.md` (this session's audit).

## 3. Pipeline Overview

```
scrape.ts → score.ts → notify.ts     (GitHub Actions, scrape.yml)
```

1. **Scrape** — per active company (Greenhouse/Lever/Ashby) plus RemoteOK/Wellfound/MyCareersFuture feeds, normalize to `RawJob[]`, filter by the active role selection's expanded roles, tag geography (`tagLocations`), drop untagged jobs, dedup cross-source by deterministic fingerprint (`computeFingerprint.ts`), upsert into `jobs`.
2. **Score** — for each unscored job matching the active role: cheap keyword overlap score always; if it clears `KEYWORD_THRESHOLD`, one gated OpenRouter AI call for a 0–1 relevance score + reasoning.
3. **Notify** — jobs with `ai_score >= NOTIFY_THRESHOLD` not already in `notifications_log`, optionally narrowed by `NotificationPreferences` (include filters: role/skill/location/experience/source; exclude filters: blocked companies/employment types — v1.2), formatted as a Telegram message (individual or digest mode) with "why this job" highlight badges, sent, then marked notified.

Full diagrams: `design/architecture.md` §3–7. Full data-flow sequence diagrams: `design/technical-design.md` §6.

**⚠️ Current live cadence:** `scrape.yml`'s `schedule:` is **active** (`cron: "0 */6 * * *"`, every 6 hours) alongside `workflow_dispatch`. Several existing docs (`design/limitations.md` §1.3 "2 hours", `docs/deployment.md` §11 "commented out pending approval") describe an earlier, not-yet-live state that no longer matches the actual workflow file — this is flagged in this session's Technical Debt Register (`TECHNICAL_DEBT.md`) as a real doc/reality mismatch, not silently corrected, since whether 6h (vs. the originally-planned 2h) was a deliberate choice is not something this session can verify.

## 4. Supported Sources

| Source | Config | Notes |
|---|---|---|
| Greenhouse | per-company `board_token` in `companies` | |
| Lever | per-company `board_token` | |
| Ashby | per-company `board_token` | |
| Wellfound | `WELLFOUND_FEED_URL` env var (optional) | Degrades to zero jobs, not a failure, if unset (AD-10) |
| RemoteOK | none (public feed) | Near-zero yield for this project's geo filters — disabled via `REMOTEOK_DISABLED=true` in `scrape.yml`; see `docs/remoteok-evaluation.md` |
| MyCareersFuture | none (public API) | Singapore-specific, small but real volume |

Geography is hardcoded to `india \| singapore \| uae \| remote` (`location_tag` enum) — see `design/scope.md` §6 for what expanding this requires.

## 5. AI Pipeline

- **Role expansion** (`/roles`): static seed map + one-time OpenRouter call per distinct role string, cached permanently (AD-06).
- **Scoring** (`score.ts`): two-stage — free keyword overlap gate, then one OpenRouter call per job that clears the gate (15s timeout, 1 retry), with prompt truncation (`OPENROUTER_MAX_*_PROMPT_CHARS`, AD-23) to bound token cost. AI failures leave `ai_score` null and retry indefinitely on future runs (AD-14/AD-19) — never a permanent dead end.
- Everything else (salary, contact email, employment type/seniority/work arrangement/visa/relocation/clearance/urgency, career pages, source-health classification) is **deterministic regex/rule-based, not AI** — a deliberate project-wide bias (AD-16, AD-20, AD-21, AD-22, AD-25) to keep behavior explainable and cost near-zero.

## 6. Analytics

`/analytics` computes, in-memory from raw query results (no materialized views — accepted tradeoff at this scale, `design/limitations.md` §7.1): jobs-over-time, jobs-by-source, jobs-by-company, score histogram, status breakdown, salary stats, remote stats, source health (both the probe-based `companies.health_status` signal and the scrape_runs-derived signal, shown side by side, deliberately not merged — AD-18/AD-24), and scoring-queue depth/stuck-job visibility (AD-19).

## 7. Notification Flow

See §3 above and `design/user-guide.md` §9. Two live delivery modes (`individual` default, `digest` MVP with inline Telegram buttons); a third (`digest_legacy`) exists but is not the default and is not being actively enhanced. `NotificationPreferences` (JSON blob in `app_settings`) is now editable end-to-end via the `/settings` "Notification filters" card (v1.2 — previously backend-only).

## 8. Operational Scripts

See `OPERATIONS.md` for the full command reference and troubleshooting. Quick orientation: `npm run scrape/score/notify` (pipeline stages, also runnable manually), `npm run doctor` (env/connectivity preflight), `npm run health`/`diagnose`/`analytics`/`report:sources` (source-quality visibility), `npm run verify` (typecheck+test+build in one command), `npm run verify:production`/`diagnostics` (v1.4 production verification framework — 26 infrastructure/application/external/data-quality checks, health score, Ready/Needs Attention/Not Ready verdict; see `docs/operations/production-verification.md`), `npm run backfill:fingerprints`/`backfill:min-years` (one-off migrations-adjacent backfills), `npm run discover:career-pages`, `npm run setup:webhook`.

## 9. Deployment Flow

Vercel (Next.js web app) + Supabase (Postgres/Auth/Storage) + GitHub Actions (cron + CI + migration push). Full step-by-step: `docs/deployment.md`. `migrate.yml` auto-runs `supabase db push` on every push to `main` — schema migrations apply automatically on merge, they are not a manual step the operator must remember (see `OPERATIONS.md` §Migrations for the nuance this corrects relative to older docs).

## 10. Database Overview

11 core tables + `job_duplicates`/`digest_sessions`/`company_career_pages`/`app_settings`/`job_statuses`/`job_state`/`role_expansion_map`/`role_packs`/`role_pack_roles` (36 migrations total as of this session). Canonical, current schema reference: `design/erd.md`. **Do not use `docs/database.md`'s inline `create table` listing** — it predates several migrations and is marked stale at the top of that file as of this session.

## 11. Important Design Decisions

The full numbered decision log (28 entries, AD-01 through AD-28) is `docs/decisions.md` — read it before making any architectural change; it explains *why*, not just *what*. Highest-signal ones for a new session: AD-01 (single-user, no multi-tenancy), AD-03 (repository pattern, why), AD-04 (standalone cron scripts, not API routes), AD-07/AD-14 (two-stage scoring, threshold history), AD-16 (fingerprint dedup, not fuzzy/AI), AD-11/AD-12 (forward-only migrations, RLS model), AD-27/AD-28 (production verification framework + its severity/diagnostics refinement).

**A caveat that has applied to every schema-touching phase, including v1.2:** `supabase/database.types.ts` is a generated file **manually kept in sync** in this sandboxed environment (no live Supabase project to run `supabase gen types` against). Anyone applying migrations to a real project should regenerate it and diff against the manual edits.
