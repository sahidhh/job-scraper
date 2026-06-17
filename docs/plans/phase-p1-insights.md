# Phase P1 — Skill-Gap ("Level Up") + In-Demand Insights

Status: ✅ complete. Verified: `tsc` clean, `vitest` green (insights suites), `next build` OK (`/insights` route).

## Goal
From scraped, role-matched jobs, surface (a) skills the resume lacks but jobs want ("level up"), and (b) most-demanded skills. Merges original requests #2 (level-up) and #3 (trend feed).

## Honest reframing (contradiction raised, accepted)
Original #3 asked for "tech market trends". We only scrape the user's roles + 4 locations + configured companies — a biased, narrow sample, NOT the market. So "demand" is scoped and labelled in the UI as "among your matching jobs", and there is no external news/feed. #3 folded into #2 (same engine).

## Key decision — recompute vs persist skills
Roadmap originally approved persisting `jobs.skills`. **Reversed during build:** persisting meant churning `NormalizedJob`, ingest, upsert mapper, `scrape.ts`, plus a backfill script — high blast radius. Instead, **skills are recomputed at read time** in the insights query via the shared `extractSkills` dictionary. Cheap at single-user scale; zero pipeline change; reversible. Trade-off: no historical skill snapshots (Phase 4 trends can use `scrape_runs`/`job_scores` time-series instead).

## What changed
- **New feature `features/insights`:**
  - `domain/types.ts` — `SkillGap {skill, demandCount}`, `SkillDemand {skill, count}`.
  - `domain/MatchedJobsRepository.ts` — port returning `MatchedJob {title, description, aiScore}`.
  - `application/computeSkillGaps.ts`, `application/computeSkillDemand.ts` — pure functions (set arithmetic over per-job skill lists), + tests.
  - `infrastructure/SupabaseMatchedJobsRepository.ts` — role-matched jobs + scoped `ai_score`, + test.
- **Shared refactor:** extracted `buildRoleFilter`/`sanitizeRoleForFilter` from `SupabaseJobRepository` into `shared/infrastructure/roleFilter.ts` so `insights` infra reuses it without importing another feature's infrastructure (architecture rule 5).
- **UI:** `/insights` page (server component) — extracts skills per job, calls the two pure fns, renders "Level up" + "In demand" cards with proportion bars. Added `Insights` to `navItems`.

## Effect
- New read-only `/insights` page. No schema change, no write-path change, no new dependency.
- `buildRoleFilter` now shared (single source) — jobs repo behavior unchanged (tests still green).

## Risks / limitations
- Bounded by the static `skills-dictionary.ts` — only detects listed skills.
- Recompute runs `extractSkills` per matched job per page load (fine at current volume; revisit if job count grows large).

## Follow-ups / suggestions
- If Phase 4 wants skill trends over time, add the persisted `jobs.skills` column then (populate at ingest + one-off backfill).
- Consider weighting demand by `aiScore` (high-fit jobs count more) — data already fetched (`MatchedJob.aiScore`), not yet used.
