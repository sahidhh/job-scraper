# Analytics Page Fix: `scrape_runs.jobs_found` Schema Mismatch

**Date:** 2026-06-20  
**Severity:** Production error — analytics page fully down  
**Error digest:** 3886291955

---

## Root Cause

Migration `20260619000001_scrape_run_metrics.sql` renamed the column `scrape_runs.jobs_found` → `found_count`, but the repository layer was never updated to reflect this rename. The analytics page called `getScrapeRuns()`, which SELECT'd the old column name, causing the runtime PostgreSQL error.

**This is Case B: Column renamed. Code not updated.**

---

## Evidence

### Migration — rename applied

`supabase/migrations/20260619000001_scrape_run_metrics.sql` line 6:
```sql
ALTER TABLE scrape_runs
  RENAME COLUMN jobs_found TO found_count;
```

### Design doc — already reflected rename

`design/erd.md` line 113:
```
integer found_count
```

The ERD was updated when the migration was written, confirming the schema intent.

### Stale application code (before fix)

`src/features/insights/infrastructure/SupabaseMatchedJobsRepository.ts`:
- Line 15: `jobs_found: number;` (interface `ScrapeRunRow`)
- Line 62: `.select("run_at, jobs_found, source")`
- Line 70: `jobsFound: row.jobs_found`

`src/features/insights/infrastructure/SupabaseMatchedJobsRepository.test.ts`:
- Lines 39–40: mock data used `jobs_found` key

---

## Files Investigated

| File | Purpose |
|---|---|
| `supabase/migrations/20260612000002_tables.sql` | Original table definition with `jobs_found` |
| `supabase/migrations/20260619000001_scrape_run_metrics.sql` | Migration that renamed to `found_count` |
| `src/features/insights/infrastructure/SupabaseMatchedJobsRepository.ts` | Repository with stale column references (**fixed**) |
| `src/features/insights/infrastructure/SupabaseMatchedJobsRepository.test.ts` | Test with stale mock data (**fixed**) |
| `design/erd.md` | Already correct — shows `found_count` |
| `docs/plans/feature-roadmap.md` | References `jobs_found` in planning prose — not runtime code |
| `docs/frontend.md` | References `jobs_found` in documentation prose — not runtime code |
| `docs/scrapers.md` | References `jobs_found` in documentation prose — not runtime code |
| `docs/architecture.md` | References `jobs_found` in documentation prose — not runtime code |
| `docs/sources/wellfound.md` | References `jobs_found` in documentation prose — not runtime code |

---

## Fix Implemented

### `src/features/insights/infrastructure/SupabaseMatchedJobsRepository.ts`

```diff
 interface ScrapeRunRow {
   run_at: string;
-  jobs_found: number;
+  found_count: number;
   source: string;
 }

-      .select("run_at, jobs_found, source")
+      .select("run_at, found_count, source")

-      jobsFound: row.jobs_found,
+      jobsFound: row.found_count,
```

### `src/features/insights/infrastructure/SupabaseMatchedJobsRepository.test.ts`

```diff
-  { run_at: "2026-06-01T10:00:00Z", jobs_found: 12, source: "greenhouse" },
-  { run_at: "2026-06-02T10:00:00Z", jobs_found: 8, source: "lever" },
+  { run_at: "2026-06-01T10:00:00Z", found_count: 12, source: "greenhouse" },
+  { run_at: "2026-06-02T10:00:00Z", found_count: 8, source: "lever" },
```

Domain type `ScrapeRunDataPoint.jobsFound` was **not changed** — it is the application-layer field name and was always correct.

---

## Validation Results

**Remaining `jobs_found` references in `src/`:** 0

```
grep -rn "jobs_found" src/  → (no output)
```

**TypeScript check:** No errors in `SupabaseMatchedJobsRepository.ts` related to this fix. Remaining TS errors in the environment are pre-existing (`@types/node` missing, `vitest` not installed locally, JSX intrinsic elements) and unrelated to this change.

**Build:** `next` CLI not installed in this remote container. Build infrastructure is expected to run in CI, not locally in this environment.

---

## Risk Assessment

- **Minimal blast radius.** The only change is the column name in the SELECT string and the row-accessor key. The public domain interface (`ScrapeRunDataPoint.jobsFound`) is unchanged, so all callers and UI components are unaffected.
- **No migration required.** The rename migration already exists and was applied. This is purely a code sync.
- **Docs not updated.** References to `jobs_found` in `docs/` prose files (`frontend.md`, `scrapers.md`, `architecture.md`, `docs/sources/wellfound.md`, `docs/plans/feature-roadmap.md`) are documentation-only and do not cause runtime errors. Updating them is a separate documentation cleanup task.
