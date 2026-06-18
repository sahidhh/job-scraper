# Resume Versioning and Background Re-Scoring

**Phase:** Phase 1  
**Status:** Implemented  
**Branch:** `feature/resume-versioning`

---

## Problem

When a user uploads a new resume, existing `job_scores` rows are not invalidated. The dashboard continues showing scores computed against the old resume's skills, giving the user misleading relevance rankings that don't reflect their current profile.

---

## Root Cause

`job_scores` rows have no reference to which resume they were scored against. The dashboard query filters scores only by `role_selection_id`. After a resume swap, old scores remain the "best match" for each job and are surfaced unchanged.

---

## Existing Score Flow (before this change)

```
1. User uploads resume
   └── set_active_resume() RPC
       ├── UPDATE resumes SET is_active = false  (previous)
       └── INSERT resumes (is_active = true)

2. Cron: scripts/score.ts
   ├── resumeRepository.getActive()            → active resume (skills[])
   ├── jobRepository.findUnscored(roleId, roles)
   │     └── SELECT job_scores WHERE role_selection_id = ? AND ai_score IS NOT NULL
   │         (excludes those job_ids from the result)
   └── scoreJob(job, resume, roleId)
       ├── keyword score (fast, free)
       ├── AI score if keyword_score >= threshold (expensive)
       └── scoreRepository.insertScore()
           └── UPSERT job_scores ON CONFLICT (job_id, role_selection_id)

3. Dashboard: findForDashboard(roleSelectionId, filters, limit)
   └── JOIN job_scores WHERE role_selection_id = ?
       (returns whichever score row exists — may be from old resume)
```

**Problem point:** Steps 2 and 3 have no awareness of which resume version the scores belong to.

---

## New Score Flow (after this change)

```
1. User uploads resume
   └── set_active_resume() RPC (updated)
       ├── next_version = MAX(version) + 1
       ├── UPDATE resumes SET is_active = false  (previous)
       └── INSERT resumes (is_active = true, version = next_version)

2. Cron: scripts/score.ts
   ├── resumeRepository.getActive()            → resume (skills[], version)
   ├── jobRepository.findUnscored(roleId, roles, resume.version)
   │     └── SELECT job_scores
   │           WHERE role_selection_id = ?
   │             AND resume_version = ?         ← NEW: version-scoped
   │             AND ai_score IS NOT NULL
   │         (only excludes fully-scored rows for CURRENT version)
   │         → jobs scored with old version are re-included
   └── scoreJob(job, resume, roleId)
       └── insertScore({ ..., resumeVersion: resume.version })
           └── UPSERT job_scores
               ON CONFLICT (job_id, role_selection_id, resume_version)
               (old-version rows are preserved; new row is inserted)

3. Dashboard: findForDashboard(roleSelectionId, filters, limit, resumeVersion)
   └── JOIN job_scores
         WHERE role_selection_id = ?
           AND resume_version = ?              ← NEW: version-scoped
       (jobs with only old-version scores appear as unscored / pending)
```

---

## Design Decisions

### D1 — Add `version` column to `resumes`, not a separate version table

Simpler schema. The existing `is_active` + partial unique index pattern already treats resumes as a versioned sequence. Adding `version integer` directly is the minimal change.

### D2 — Add `resume_version` to `job_scores` and change the unique key

The old `UNIQUE (job_id, role_selection_id)` constraint caused the upsert to overwrite existing score rows on re-runs. Expanding to `UNIQUE (job_id, role_selection_id, resume_version)` makes each (job, role, version) triple its own idempotent upsert target, and old rows are naturally preserved.

### D3 — Historical scores are never deleted

Score rows from prior resume versions remain in `job_scores`. They are invisible to the dashboard (filtered out by `resume_version`) but available for audit or future analytics queries.

### D4 — Backward compatibility: existing rows receive version 0 as sentinel, then back-filled

The migration sets `resume_version` on all existing `job_scores` rows to the current active resume's `version`. Existing scores are thus treated as valid for the current resume version and continue to surface on the dashboard immediately after migration, with no re-scoring required.

### D5 — Dashboard fetches active resume in `JobsSection` (not in the page root)

The resume fetch is co-located with the other per-session repository calls in `JobsSection`, keeping the outer `DashboardContent` unchanged and avoiding prop-drilling across the Suspense boundary.

---

## Alternatives Considered

| Alternative | Why not chosen |
|---|---|
| Soft-delete scores on resume upload (set `stale = true`) | Extra column; dashboard must filter on it; doesn't preserve clean historical separation |
| Separate `job_score_history` table | Higher schema complexity; no benefit over the natural multi-version row approach |
| Re-score synchronously on upload | Upload action would time out for large job sets; scoring is expensive and async by design |
| Notify background worker via queue | Over-engineered for a single-user cron-based system; the next 2-hour cron run is sufficient |

---

## Files Changed

| File | Change |
|---|---|
| `supabase/migrations/20260618000001_resume_versioning.sql` | New migration: adds `version` to `resumes`, `resume_version` to `job_scores`, updates unique constraint and `set_active_resume` RPC |
| `supabase/database.types.ts` | Updated generated types: `version` on `resumes`, `resume_version` on `job_scores`, updated RPC return type |
| `src/features/resume/domain/types.ts` | Added `version: number` to `Resume` interface |
| `src/features/resume/infrastructure/SupabaseResumeRepository.ts` | Maps `version` in `toResume()` |
| `src/features/scoring/domain/types.ts` | Added `resumeVersion: number` to `NewJobScore` |
| `src/features/scoring/infrastructure/SupabaseScoreRepository.ts` | Includes `resume_version` in upsert; conflict target updated |
| `src/features/scoring/application/scoreJob.ts` | Passes `resume.version` into `NewJobScore` |
| `src/features/jobs/domain/JobRepository.ts` | Updated `findUnscored` and `findForDashboard` signatures |
| `src/features/jobs/infrastructure/SupabaseJobRepository.ts` | Applies `resume_version` filter in both `findUnscored` and `findForDashboard` |
| `scripts/score.ts` | Passes `resume.version` to `findUnscored` |
| `src/app/(protected)/dashboard/page.tsx` | Fetches active resume in `JobsSection`; passes `resumeVersion` to `findForDashboard` |
| `design/erd.md` | Updated ERD: `version` on RESUMES, `resume_version` on JOB_SCORES, updated constraint table and RPC docs |
| `docs/tasks/resume-versioning.md` | This document |

---

## DB Changes

### Migration: `20260618000001_resume_versioning.sql`

1. `ALTER TABLE resumes ADD COLUMN version integer NOT NULL DEFAULT 1`  
   Back-filled with `ROW_NUMBER() OVER (ORDER BY uploaded_at ASC)`

2. `ALTER TABLE job_scores ADD COLUMN resume_version integer NOT NULL DEFAULT 0`  
   Back-filled to `(SELECT version FROM resumes WHERE is_active = true)`

3. Drop `job_scores_job_role_uq`, add `job_scores_job_role_version_uq (job_id, role_selection_id, resume_version)`

4. Replace `set_active_resume` function to compute `next_version = MAX(version) + 1` before insert

---

## Testing

All existing tests updated to pass `resumeVersion` where required. Key assertions added:

- `SupabaseScoreRepository`: upsert payload includes `resume_version`; conflict target is `job_id,role_selection_id,resume_version`
- `SupabaseJobRepository.findUnscored`: `scoredBuilder.eq` called with `("resume_version", 1)`
- `SupabaseJobRepository.findForDashboard`: `builder.eq` called with `("job_scores.resume_version", 1)`
- `SupabaseResumeRepository`: row fixture includes `version: 1`; mapped result includes `version: 1`
- `scoreJob`: `makeResume` fixture includes `version: 1`

Run: `npm test`

---

## Risks

| Risk | Mitigation |
|---|---|
| Migration back-fill sets wrong version for existing scores (no active resume) | Scores receive `resume_version = 0`; dashboard passes `version = 0` for no-active-resume case, so they still surface. User uploads a resume → version 1 → new scores generated correctly. |
| Large job set re-scores after first resume upload | Cron runs every 2 hours; each run picks up the remaining unscored jobs. No single run is bounded beyond the existing scoring loop. |
| `database.types.ts` diverges from real schema | Types are updated manually alongside the migration. Must regenerate via `supabase gen types` after applying migration to production. |

---

## Future Enhancements

- **Resume version picker UI (P2):** Allow user to view scores from a previous resume version by selecting it on the dashboard.
- **Stale banner (P2):** Show a dashboard banner "Scores are being updated for your new resume (X of N jobs re-scored)" during the re-scoring window.
- **Forced immediate re-score:** A "Re-score now" button on the resume page that triggers `scripts/score.ts` via a GitHub Actions workflow dispatch.

---

## Rollback Plan

1. Revert the TypeScript changes (revert the PR).
2. Apply a down-migration:
   ```sql
   ALTER TABLE job_scores DROP CONSTRAINT job_scores_job_role_version_uq;
   ALTER TABLE job_scores ADD CONSTRAINT job_scores_job_role_uq UNIQUE (job_id, role_selection_id);
   ALTER TABLE job_scores DROP COLUMN resume_version;
   ALTER TABLE resumes DROP COLUMN version;
   -- Restore set_active_resume to original (from 20260612000004_functions.sql)
   ```
3. Old scores with `ai_score IS NOT NULL` for the active `role_selection_id` will surface immediately on the dashboard again.
