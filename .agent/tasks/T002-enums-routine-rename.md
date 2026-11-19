---
id: T002
title: Update enums.ts, FilterBar, and rename claude_routine to routine_agent across codebase
status: pending
gate_level: 2
priority: high
agent: {role: backend, tier: sr, fallback: agent_default}
dependencies: [T001]
requirements: [REQ-F001, REQ-F002]
---
# Objective
Update `JobSource` and `JOB_SOURCES` in `src/shared/domain/enums.ts` to include `naukri` and `naukrigulf`, rename `claude_routine` to `routine_agent` across all TypeScript source, scripts, and tests, and ensure `careers_url` and `routine_agent` remain excluded from `JOB_SOURCES`.

# Context
- `src/shared/domain/enums.ts` is the single domain source of truth for `JobSource` and `JOB_SOURCES`.
- `JOB_SOURCES` drives `getSourceHealthReport`, `NotificationPreferences.sources`, and `FilterBar.tsx`.
- `claude_routine` appears in dashboard components (`JobCard.tsx`, `JobRow.tsx`, `OriginToggle.tsx`, `dashboard/page.tsx`), `SupabaseJobRepository.ts`, `SupabaseMatchedJobsRepository.ts`, `computeJobStats.ts`, `mapManualMatch.ts`, `scripts/import-manual-matches.ts`, `scripts/export-top-matches.ts`, `scripts/print-manual-matches-sql.ts`, and their tests.

# Inputs
- `src/shared/domain/enums.ts`
- `supabase/database.types.ts` (from T001)
- All files matching `claude_routine` in `src/` and `scripts/`

# Scope
Included: `src/shared/domain/enums.ts`, all `claude_routine` → `routine_agent` references in `src/` and `scripts/` and tests.
Excluded: Historical markdown docs/reports in `docs/` or `reports/`; `scripts/outreach/cdp_helper.py`.

# Implementation guidance
1. Add `"naukri"` and `"naukrigulf"` to `JobSource` and `JOB_SOURCES` in `src/shared/domain/enums.ts`.
2. Replace `"claude_routine"` with `"routine_agent"` in `JobSource` and across all `src/` and `scripts/` files and tests.
3. Verify `FilterBar.tsx` and `SupabaseJobRepository.ts` handle `naukri`, `naukrigulf`, and `origin === "routine_agent"` cleanly.

# Expected outputs
- Updated `src/shared/domain/enums.ts`
- Updated `src/` and `scripts/` files with zero remaining `claude_routine` code/test references

# Acceptance criteria
Blocking:
- [ ] AC-002-1: Zero occurrences of `claude_routine` remain in `src/` and `scripts/`.
- [ ] AC-002-2: `JobSource` includes `"naukri"`, `"naukrigulf"`, and `"routine_agent"`; `JOB_SOURCES` includes `"naukri"` and `"naukrigulf"` and excludes `"careers_url"` and `"routine_agent"`.
- [ ] AC-002-3: `npm run typecheck` and `npm run test` pass.
Quality:
- [ ] Existing comments/docstrings updated accurately where `claude_routine` was referenced.
Compatibility:
- [ ] `dashboard/page.tsx` and `OriginToggle.tsx` work seamlessly with `routine_agent`.

# Verification
- `npm run typecheck`
- `npm run test`
- Search `src/` and `scripts/` for `claude_routine` → 0 matches.

# Constraints
- Do not alter unrelated logic in `SupabaseJobRepository.ts` or `FilterBar.tsx`.

# Handoff
Return: status, summary, list of modified files, `typecheck` and `test` results.

# Failure handling
- If any test fails due to fixture mismatches, fix the fixture in the same task and re-run `npm run test`.
