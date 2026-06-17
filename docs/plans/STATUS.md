# Roadmap Status — Handoff

Plan: [feature-roadmap.md](feature-roadmap.md). 6 requested features → 4 phases (P0–P3).

## ✅ Done (verified: tsc clean, vitest green, next build OK)

### P0 — Job status + bulk-select
- Migration `20260616000001_job_status.sql`: `job_statuses` + `job_state` + RLS. Seeds (New/Interested/Applied/Rejected/Archived) in `seed.sql`.
- jobs domain/app/infra: `JobStatus` type, `JobFilters.statusIds/includeArchived`, `listStatuses`, `setJobStatus`, dashboard status join + Archived-exclusion.
- Actions: `setJobStatusAction`. UI: per-row `JobStatusSelect`, bulk-select bar in `JobsTable`, FilterBar status filter + "show archived".

### P1 — Skill-gap ("level up") + in-demand
- `features/insights`: `SkillGap`/`SkillDemand` types, pure `computeSkillGaps`/`computeSkillDemand` (+tests), `MatchedJobsRepository` + `SupabaseMatchedJobsRepository`.
- Refactor: `buildRoleFilter` → `shared/infrastructure/roleFilter.ts` (shared by jobs + insights).
- UI: `/insights` page + nav item.
- Decision: **skills recomputed at read time** (NOT persisted) — see [phase-p1-insights.md](phase-p1-insights.md).

### P2 — Experience soft filter + editable settings
- Migration `20260616000002_experience.sql`: `jobs.min_years` (nullable) + `app_settings` table + RLS.
- `parseMinYears` pure fn → wired into `ingestJobs`; `JobFilters.maxYears` filter (NULL always passes, soft).
- `features/settings`: `SettingsRepository`, `setDesiredExperience` (+validation), `SupabaseSettingsRepository` (+tests).
- UI: `ExperienceCard` on /settings; dashboard default `maxYears` from setting; FilterBar max-years override.
- Details: [phase-p2-experience.md](phase-p2-experience.md).

### P3 — Analytics graphs
- `recharts` installed.
- Pure fns (+tests): `computeJobsOverTime`, `computeJobsBySource`, `bucketScores` — all in `features/insights/application/`.
- `MatchedJobsRepository` extended: `getScrapeRuns()`, `getAiScores(roleSelectionId)`, `getStatusBreakdown()` — implemented in `SupabaseMatchedJobsRepository` (+tests).
- UI: `/analytics` server page + `features/insights/ui/AnalyticsCharts.tsx` client component (4 recharts charts: jobs over time, by source, score histogram, status breakdown). Nav item added.
- Verified: tsc clean, 236 vitest tests pass (39 files), next build OK (`/analytics` 111 kB).

## ✅ All 4 phases complete

## ⚠️ Must-do before deploy
1. **DB not migrated** — Run `supabase db push` (applies `20260616000001_job_status.sql`, `20260616000002_experience.sql`).
2. **Seed statuses** — `supabase db seed` (New/Interested/Applied/Rejected/Archived).
3. **Regen types** — `supabase gen types typescript --linked > supabase/database.types.ts`.
4. **Flaky test fixed** — `TelegramBotSender` 429-retry was flaky (fetchWithRetry internal 2 s delay fought fake timers); fixed by passing `{ retries: 0 }` so TelegramBotSender owns 429 retry logic exclusively.

## Verify commands
`npx tsc --noEmit` · `npx vitest run` · `npm run build`
