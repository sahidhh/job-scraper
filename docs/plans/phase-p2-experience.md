# Phase P2 — Experience as a Soft Filter + Editable Settings

Status: ✅ complete. Verified: `tsc` clean, `vitest` green (84 jobs/insights/settings tests), `next build` OK.

## Goal
Let the user set a desired max years of experience; the dashboard then hides jobs that demand more. Original request #1 ("config experience in years so scraping only keeps relevant jobs"), reframed.

## Honest reframing (contradiction raised, accepted)
Original #1 wanted a hard filter at scrape time. ATS feeds have **no structured years field**; we'd regex free text — lossy. Dropping jobs at scrape on a bad parse = silent, unrecoverable data loss. So experience is a **soft signal**:
- Parsed best-effort at ingest into nullable `jobs.min_years`.
- `NULL` ("unknown") **always passes** — never excluded.
- Filtering happens at the dashboard, not at scrape.
- **No backfill** — existing rows stay `NULL` (always shown) until re-scraped.

## What changed
- **Migration `20260616000002_experience.sql`:** `jobs.min_years integer` (nullable); new `app_settings (key, value jsonb, updated_at)` table + RLS policy. (`database.types.ts` updated by hand — regenerate after `db push`; Docker/CLI unavailable locally.)
- **Parsing:** `features/jobs/application/parseMinYears.ts` (pure) — extracts the smallest plausible years tied to a years-word; clamps 0..20; returns `null` when unknown. Wired into `ingestJobs` (computes `minYears` per job before upsert); `toUpsertRow` writes `min_years`.
- **Filter:** `JobFilters.maxYears`; `findForDashboard` adds `min_years.is.null,min_years.lte.N`.
- **New feature `features/settings`:** `SettingsRepository` (`get/setDesiredExperienceYears`), `setDesiredExperience` use-case + `validateExperienceYears` (0..50 int or null), `SupabaseSettingsRepository` (key `desired_experience_years`; `null` deletes the row). Tests for use-case + repo.
- **UI:** `ExperienceCard` on `/settings` (numeric input → `setDesiredExperienceAction`, blank clears). Dashboard reads the setting as the default `maxYears`; `FilterBar` gained a max-years input that overrides per-view via the `maxYears` search param.

## Effect
- `/settings` → "Desired experience" card. Saving filters the dashboard to jobs requiring ≤ N years (plus all unknown-experience jobs).
- New scrapes populate `min_years`; until then most rows are `NULL` and always shown (soft by design).
- New `app_settings` table is reusable for future editable settings.

## Risks / limitations
- Parse coverage is partial — many postings won't state years in a parseable way → `min_years` stays `NULL` (shown). Acceptable for a soft filter.
- `database.types.ts` hand-edited; must be regenerated (`supabase gen types`) after the migration is pushed to keep it authoritative.

## Issues hit during build
- Background sonnet subagents (parseMinYears, settings) repeatedly failed with API 500s — completed inline instead. `parseMinYears.test.ts` from a crashed agent was kept and the implementation written to satisfy it.
- Discovered mid-session that P0/P1 and parts of P2 were already on disk from a prior (compacted) session; recovered by measuring disk state (`tsc`/`vitest`/`build`) rather than re-creating files.

## Deploy checklist
1. `supabase db push` (applies `20260616000001_job_status.sql` + `20260616000002_experience.sql`).
2. Apply seed statuses + regenerate `database.types.ts`.
3. Pre-existing flaky tests: `TelegramBotSender` 429-retry timeouts (unrelated, obs 87) — not caused by P0–P2.

## Follow-up
- Phase 3 (roadmap P3) = analytics graphs; needs `recharts` (approved) and benefits from P0 `job_state` data.
