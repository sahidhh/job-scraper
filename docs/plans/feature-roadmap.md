# Feature Roadmap Plan — Status, Insights, Experience Filter, Analytics

Scope decided with user (2026-06-16): six requested features collapsed to **four**, built P0→P3.

| Phase | Feature | Original items |
|---|---|---|
| P0 (Phase 1) | Job status + bulk-select | #4 multi-select archive/remove + #5 per-job status dropdown |
| P1 (Phase 2) | Skill-gap / level-up + demand view | #2 level-up list + #3 "trend" feed (reframed) |
| P2 (Phase 3) | Experience as **soft** filter | #1 experience-years config |
| P3 (Phase 4) | Analytics graphs | #6 |

Decisions:
- **Statuses:** ship **seeded defaults** (New / Interested / Applied / Rejected / Archived) with mild colors; full add/edit/delete/recolor CRUD deferred to a later phase.
- **Experience:** **soft** — parse nullable `min_years`, filter at dashboard/score-display time. Never drop scraped data.
- **"Trend" reframed:** there is no external market data; insights are computed over *your scraped + role-matched jobs only*. Label honestly as "demand among your matching jobs."

Hard architectural rules carried from `CLAUDE.md` + `docs/architecture.md`:
- Layer order per feature: **domain → application → infrastructure → tests → UI**.
- `domain` zero deps; `application` depends only on `domain` (repos injected); `infrastructure` only place that touches Supabase; `app/` + `scripts/` are the only composition roots.
- No new top-level architecture without approval. Status work **extends the existing `jobs` feature**; insights/analytics go in a **new `insights` feature module** (feature modules are the approved pattern — confirm with user before Phase 2 if treated as new architecture).
- No `any`, no duplicated DTOs/types. Supabase + Repository Pattern + Server Actions only.
- Migrations: `supabase/migrations/<timestamp>_<desc>.sql`, forward-only. Every new table gets an `authenticated_full_access` RLS policy (see `20260612000005_rls.sql`). Regenerate `supabase/database.types.ts` after each migration.

---

## Phase 0 — Documentation Discovery (DONE, consolidated)

**Sources read:** `docs/architecture.md`, `docs/database.md`, `docs/scoring.md`, `docs/frontend.md`; `src/features/jobs/domain/{types,JobRepository,validation}.ts`, `src/features/jobs/infrastructure/SupabaseJobRepository.ts`, `src/app/(protected)/dashboard/page.tsx`, `src/features/scoring/application/{scoreJob,computeKeywordScore}.ts`, `src/shared/domain/skills.ts`, `package.json`, migrations dir.

**Allowed APIs / existing patterns to COPY (do not invent):**
- Skill extraction: `extractSkills(text: string, dictionary: readonly SkillDictionaryEntry[]): string[]` — `src/shared/domain/skills.ts:14`. Already used in `scoreJob.ts:30`. Reuse verbatim for both job-skill and gap computation.
- Keyword overlap math: `computeKeywordScore(resumeSkills, jobSkills)` — `src/features/scoring/application/computeKeywordScore.ts:10`. Reference for set-arithmetic style.
- Dashboard query + join shape: `SupabaseJobRepository.findForDashboard` — `SupabaseJobRepository.ts:194-225` (PostgREST `!left` join, `.returns<RowType[]>()`, `limit+1` hasMore pattern). Copy for status join.
- Role/title `.or()` filter builder with char sanitizing: `buildRoleFilter` + `sanitizeRoleForFilter` — `SupabaseJobRepository.ts:83-97`. Reuse, do not re-derive.
- Server action result shape: `{ ok: true, data } | { ok: false, error }` — `src/shared/actionResult.ts`, used in every `features/*/actions.ts`. Copy.
- Repository composition in pages: instantiate `new SupabaseXRepository(client)` inside the server component / action only (`dashboard/page.tsx:62`).
- RLS per-table policy template: `20260612000005_rls.sql:16-17`.
- shadcn primitives already installed: `@radix-ui/react-select`, `react-dialog`, `react-collapsible`, `react-label`, `react-progress`, `react-slot`, `class-variance-authority`. **No chart library installed** — Phase 4 must add one.

**Anti-patterns to avoid:**
- Do NOT `DELETE` jobs for "remove" — scrape upserts on `(source, source_job_id)` (`SupabaseJobRepository.ts:113`) and re-inserts next cron. Removal = a status (`Archived`).
- Do NOT add `user_id` columns — single-user app (`database.md:3`).
- Do NOT drop jobs at scrape time on experience parse (`architecture.md:3.1` step 5 only drops on empty location tags). Experience stays soft.
- Do NOT select `description` into the dashboard payload — it was deliberately removed (`types.ts:51`, comment). Insights queries that need text run their own scoped query.
- Do NOT put repository instantiation in `application/` (rule 2).

---

## Phase 1 (P0) — Job Status + Bulk Select

**Goal:** turn the scraper into a tracker. Each job carries one user status; statuses are seeded with mild colors. Dashboard shows a per-row status dropdown and a multi-select bar for bulk apply (Archive = setting status to `Archived`, which hides by default).

### 1a. Migration — `supabase/migrations/<ts>_job_status.sql`
COPY table + RLS shape from `database.md:2` and `20260612000005_rls.sql`.
```sql
create table job_statuses (
  id          uuid primary key default gen_random_uuid(),
  label       text not null unique,
  color       text not null,              -- mild hex, e.g. '#E5E7EB'
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create table job_state (
  job_id     uuid primary key references jobs(id) on delete cascade,
  status_id  uuid references job_statuses(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index job_state_status_idx on job_state (status_id);

alter table job_statuses enable row level security;
alter table job_state    enable row level security;
create policy "authenticated_full_access" on job_statuses for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on job_state    for all to authenticated using (true) with check (true);
```
Seed (in `supabase/seed.sql`, `on conflict do nothing`): New(#E5E7EB), Interested(#DBEAFE), Applied(#DCFCE7), Rejected(#FEE2E2), Archived(#F3F4F6) with `sort_order` 0..4. Jobs with no `job_state` row render as "New" / unset.
Then: `supabase db push` and regenerate `supabase/database.types.ts`.

### 1b. Domain (`features/jobs/domain`)
- New `JobStatus` interface (`id, label, color, sortOrder`) in `types.ts`.
- Extend `JobWithScore` with `statusId: string | null`, `statusLabel: string | null`, `statusColor: string | null` — single source, no duplicate DTO.
- New `JobStatusFilter` field on `JobFilters` (e.g. `statusIds?: string[]`, `includeArchived?: boolean`).
- Extend `JobRepository` interface: `listStatuses(): Promise<JobStatus[]>`, `setJobStatus(jobIds: string[], statusId: string): Promise<void>`.
- `validateSetJobStatus(jobIds, statusId)` in `validation.ts` (non-empty array, uuid shape) — reuse `assertNonEmpty`.

### 1c. Application (`features/jobs/application`)
- `setJobStatus(jobIds, statusId, deps: { jobRepository })` use-case (validates then delegates). Pure orchestration; repo injected.
- No business logic beyond validation — keep thin.

### 1d. Infrastructure (`SupabaseJobRepository`)
- `listStatuses()` → select from `job_statuses` ordered by `sort_order`.
- `setJobStatus(jobIds, statusId)` → `upsert` into `job_state` (onConflict `job_id`), set `updated_at`.
- Extend `findForDashboard` select to `job_state!left(status_id)` + a join to `job_statuses`, mapping into the new `JobWithScore` fields (COPY the `!left` + `.returns<>()` pattern, `SupabaseJobRepository.ts:194`).
- Default dashboard filter excludes `Archived` unless `filters.includeArchived`.

### 1e. Tests (`*.test.ts`, vitest, mock repo via `supabaseQueryMock`)
- `setJobStatus.test.ts`: validation rejects empty `jobIds`; delegates correct args.
- `SupabaseJobRepository.test.ts`: add cases for `listStatuses`, `setJobStatus` upsert, dashboard mapping includes status fields, Archived excluded by default. **Update existing mock `JobRepository` implementations** anywhere they're constructed in tests to add the two new methods (compile gate — see prior breakages obs #98–99).

### 1f. Server actions (`features/jobs/actions.ts` — new file)
- `setJobStatusAction(jobIds: string[], statusId: string)`: composition root, `new SupabaseJobRepository(client)`, call use-case, `revalidatePath('/dashboard')`, return `actionResult`.
- `listStatusesAction()` if needed client-side (or pass from server component).

### 1g. UI
- New client component `JobStatusSelect` (shadcn `Select`, colored `Badge`) per row in `JobsTable` → calls `setJobStatusAction`.
- Multi-select: add a checkbox column + a `BulkActionBar` (appears when ≥1 selected) with a status `Select` + Apply + an Archive shortcut. Client component holds selection state (local `useState` — no Zustand/Redux per CLAUDE.md).
- Add status filter to `FilterBar` (`Select` of statuses + "show archived" toggle), wired through `DashboardSearchParams` like existing `location`/`source` params (`dashboard/page.tsx:25-42`).

### 1h. Verification
- `npm test` green; `tsc` clean.
- Grep: no `DELETE`/`.delete()` added against `jobs`.
- Manual: assign status, reload — persists; archive a job — disappears unless "show archived"; bulk-apply to multiple.
- Update `docs/database.md` (new tables), `docs/repositories.md` (new methods), `docs/frontend.md` (new components/action).

---

## Phase 2 (P1) — Skill-Gap / Level-Up + Demand View

**Goal:** "learn these to raise compatibility" + "what's in demand among your matching jobs." Pure set arithmetic over data you already have. No AI in v1.

> Honest framing baked into UI copy: demand = frequency across *your role-matched scraped jobs*, not the global market.

### 2a. Decision — where job skills come from
**IMPLEMENTED: recompute at read time** (reversed the earlier "persist" approval). Seeing the write path (scrape.ts → tagLocations → ingestJobs → upsertMany), persisting `jobs.skills` meant churning `NormalizedJob`, the upsert mapper, scrape.ts, and a one-off backfill script — high blast radius for marginal gain at single-user scale. The `/insights` page selects `title, description` for role-matched jobs and runs `extractSkills` per load. Zero migration, reversible. If Phase 4 needs historical snapshots, add the persisted column then (or draw on `scrape_runs`/`job_scores` time-series instead).

### 2b. New feature module `features/insights` (confirm "new module" OK)
- **domain/types.ts:** `SkillGap { skill: string; demandCount: number; coveredByResume: boolean }`, `SkillDemand { skill: string; count: number }`. No new repo if reading via `jobs`/`resume`/`scoring` domain types; otherwise an `InsightsRepository` interface.
- **application/computeSkillGaps.ts (pure fn):** inputs `resumeSkills: string[]`, `jobsSkills: string[][]` (optionally weighted by `aiScore`). Output: skills demanded across jobs but missing from resume, ranked by demand (weight high-`aiScore` jobs more). COPY set-style from `computeKeywordScore.ts`.
- **application/computeSkillDemand.ts (pure fn):** frequency map of all job skills among matched jobs → ranked list. Drives the "demand" view (replaces standalone trend feed).

### 2c. Infrastructure
- Query helper on `SupabaseJobRepository` (or new `InsightsRepository`): `findRoleMatchedJobSkills(expandedRoles, roleSelectionId)` → returns `{ skills: string[]; aiScore: number | null }[]` for jobs matching the active role (reuse `buildRoleFilter`, join `job_scores`). If using persisted `jobs.skills`, select it directly.

### 2d. Tests
- `computeSkillGaps.test.ts`, `computeSkillDemand.test.ts`: deterministic fixtures (resume covers A,B; jobs demand A,C,C,D → gap = C(2),D(1)).
- Repo query test for `findRoleMatchedJobSkills`.

### 2e. UI — new route `/insights` (add to `navItems.ts`)
- "Level up" card: ranked missing-skill chips with demand counts ("Kubernetes — wanted by 7 of your matches").
- "In demand" card: top skills among matching jobs (bar list using existing `Progress`, no chart lib needed here).
- Server component fetches via composition root.

### 2f. Verification
- `npm test` green, `tsc` clean; manual `/insights` shows sensible ranking.
- Update `docs/architecture.md` (new feature + boundary row), `docs/scoring.md` (skill-gap reuse of extractor), `docs/frontend.md`, `docs/database.md` (if `jobs.skills` added).

---

## Phase 3 (P2) — Experience as Soft Filter

**Goal:** user sets desired experience (years) in settings; dashboard can filter to jobs whose parsed `min_years` is null OR ≤ desired. Never drops scraped data.

### 3a. Migration
- `jobs.min_years integer` (nullable) — parsed best-effort from description.
- A settings store for desired experience. Reuse existing config approach: if there's a settings/config table use it; otherwise add `app_settings (key text pk, value jsonb)` single-row style OR an env/config value. Confirm with user where "settings" live (current `ThresholdsCard` is read-only env per `frontend.md:46`). **Likely needs a small `app_settings` table** since this is user-editable, unlike env thresholds.

### 3b. Parsing (infrastructure / ingest)
- Pure fn `parseMinYears(text): number | null` in `features/jobs/application` (or `sources/infrastructure/normalize.ts` neighborhood). Regex for patterns like `\b(\d{1,2})\+?\s*(?:years|yrs)\b`, take min plausible (0–20). Heavily-tested pure function; null when absent/ambiguous.
- Populate `jobs.min_years` during ingest (same place as Phase 2 skills). Backfill one-off update.

### 3c. Domain/Application/Infra
- `JobFilters.maxYears?: number`. `findForDashboard` adds `.or('min_years.is.null,min_years.lte.<n>')`.
- Settings read/write use-case + repo if `app_settings` table added.

### 3d. Tests
- `parseMinYears.test.ts`: "5+ years"→5, "3-5 years"→3, "Senior"→null, none→null, "10 years"→10.
- Repo filter test.

### 3e. UI
- Settings: numeric input for desired years (server action persists).
- `FilterBar`: optional max-years filter via search param.

### 3f. Verification + docs update (`database.md`, `frontend.md`, `scrapers.md` if normalize touched).

---

## Phase 4 (P3) — Analytics Graphs

**Goal:** visualize what's collected: runs over time, jobs found per run/source, score distribution, status breakdown.

### 4a. Add chart dependency
- Install **recharts** (standard with shadcn, not on CLAUDE.md ban list). Confirm with user before adding the dep. Keep charts in client leaf components only.

### 4b. Data (read-only aggregations)
- Reuse `scrape_runs` (`jobs_found`, `status`, `run_at`), `job_scores` (`ai_score` histogram), Phase 1 `job_state` (status counts).
- Aggregation queries on existing repos or a small `InsightsRepository` method; pure transforms in `application` for bucketing (e.g. `bucketScores`).

### 4c. Tests
- Pure aggregation/bucketing functions unit-tested.

### 4d. UI — `/analytics` route (or tab on `/insights`)
- Line: `jobs_found` per `run_at`. Bar: jobs per source, status breakdown, score histogram.

### 4e. Verification + docs (`frontend.md`, `architecture.md`).

---

## Phase 5 — Final Verification (run after each phase + at end)

1. `npm test` (vitest) fully green — including updated mock repositories.
2. `tsc --noEmit` clean — no `any`, no duplicated types.
3. `npm run check:service-role-boundary` still passes.
4. Grep guards:
   - no `.delete()` / `DELETE` against `jobs`.
   - no `user_id` columns added.
   - no banned libs (`prisma|drizzle|zustand|redux|react-query|@tanstack/react-query`) in `package.json`.
   - repositories not instantiated inside `application/`.
5. `supabase/database.types.ts` regenerated and committed for every migration.
6. All affected docs updated (`database.md`, `repositories.md`, `frontend.md`, `architecture.md`, `scoring.md`).
7. Manual smoke per phase (status persist/archive; insights ranking; experience filter; charts render).

---

## Confirmations — RESOLVED (approved 2026-06-16)
1. New `insights` feature module — **approved**.
2. Persist `jobs.skills text[]`, populate at ingest — **approved**.
3. Add `app_settings` table for editable settings — **approved**.
4. Add `recharts` for Phase 4 — **approved**.
