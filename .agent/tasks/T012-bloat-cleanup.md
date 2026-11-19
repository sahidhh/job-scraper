---
id: T012
title: Idempotent one-time bloat cleanup script preserving active-status and application rows
status: pending
gate_level: 4
priority: medium
agent: {role: database, tier: sr, fallback: agent_default}
dependencies: [T004]
requirements: [REQ-F011]
---
# Objective
Create an idempotent one-time bloat cleanup script (`scripts/cleanup-bloat.ts`) with `--dry-run` (default) and `--execute` modes that preserves all `jobs` rows linked to `job_state` (any user status) or `applications`, and archives/deletes older untouched bloat rows (e.g., `min_years > 3` or non-matching titles).

# Context
- `jobs` has `on delete cascade` FKs from `job_state`, `job_scores`, `notifications_log`, `applications`, etc. Deleting a `jobs` row without filtering out `job_state` or `applications` would destroy user tracking history.
- Gate G4: Destructive/irreversible data operation — requires mandatory human approval before running `--execute` against production.

# Inputs
- `supabase/migrations/20260612000002_tables.sql`
- `supabase/migrations/20260616000001_job_status.sql`
- `supabase/migrations/20260714000003_applications.sql`
- `src/features/sources/domain/roleMatch.ts` (from T004)

# Scope
Included: `scripts/cleanup-bloat.ts`, testable pure selection/partition helper, and unit tests verifying preservation of `job_state` and `applications` rows.
Excluded: Executing `--execute` against production without explicit human approval.

# Implementation guidance
1. Default to `--dry-run` (logs counts of total jobs, preserved via `job_state`/`applications`, and candidate bloat rows to delete/archive); require explicit `--execute` flag to mutate DB.
2. Fetch IDs in `job_state` (where `status_id is not null` or any `job_state` row) and `applications` (`job_id`) and exclude them unconditionally from deletion.
3. Identify untouched bloat rows: jobs not in preserved set AND (`min_years > 3` OR `!jobMatchesRoles(job, ...)` OR older than configurable `CLEANUP_MAX_AGE_DAYS`, e.g., 14 days).
4. Delete in bounded batches (e.g., 100 IDs per batch) when `--execute` is passed, and print summary counts.

# Expected outputs
- `scripts/cleanup-bloat.ts`
- Unit test verifying preservation logic (`job_state` and `applications` rows are never selected for deletion)

# Acceptance criteria
Blocking:
- [ ] AC-012-1: Script defaults to `--dry-run` (zero DB writes) and only mutates when `--execute` is explicitly passed.
- [ ] AC-012-2: Rows with `job_state` or `applications` references are 100% preserved in all test cases; only untouched bloat rows are targeted.
Quality:
- [ ] Idempotent: running twice produces 0 deletions on the second run.
Compatibility:
- [ ] `npm run typecheck` and unit tests pass.

# Verification
- `npx vitest run` on cleanup unit tests
- `npm run typecheck`
- Human approval gate before any `--execute` run on production.

# Constraints
- **MANDATORY HUMAN APPROVAL (Gate G4)** before running `--execute` against production Supabase.

# Handoff
Return: status, summary, changed files, unit test results, and `--dry-run` instructions for human review.

# Failure handling
- If FK constraints block deletion on a child table, inspect schema and report before retrying.
