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

## ⏳ Not done

### P3 — Analytics graphs (NOT STARTED)
- Add dep `recharts` (approved, not installed).
- Aggregations (pure, +tests): jobs_found over time (`scrape_runs`), jobs per source, status breakdown (`job_state`, P0), ai_score histogram (`job_scores`).
- Optional `InsightsRepository` aggregation methods.
- UI: `/analytics` route (or tab on `/insights`) + nav item.
- Plan detail: feature-roadmap.md Phase 4.

## ⚠️ Carryover / must-do before deploy
1. **DB not migrated locally** (no Docker/CLI). Run `supabase db push` to apply both migrations (`20260616000001`, `20260616000002`).
2. **Apply seed statuses** + **regenerate `supabase/database.types.ts`** (`supabase gen types ...`) — currently hand-edited to match migrations.
3. **Pre-existing flaky tests**: `TelegramBotSender` 429-retry timeouts (obs 87) — unrelated to P0–P2, not a regression.
4. Nothing committed yet — all P0–P2 work is uncommitted in working tree.

## Notes for next session
- Subagent orchestration failed this session (Anthropic API 500s on background agents) — work done inline. Retry agents next time.
- Verify commands: `npx tsc --noEmit`, `npx vitest run`, `npm run build`.
