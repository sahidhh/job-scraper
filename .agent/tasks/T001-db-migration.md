---
id: T001
title: DB migration for enum rename/add, enabled_sources default, and deterministic set_active_role_selection
status: pending
gate_level: 3
priority: high
agent: {role: database, tier: sr, fallback: agent_default}
dependencies: []
requirements: [REQ-F001, REQ-F003, REQ-F008]
---
# Objective
Add a single idempotent Supabase migration and updated `supabase/database.types.ts` that: (1) renames `job_source` `'claude_routine'` to `'routine_agent'` and adds `'naukri'` and `'naukrigulf'`, (2) seeds `app_settings` key `enabled_sources` = `["naukri","naukrigulf"]` if absent, and (3) updates `set_active_role_selection` RPC to reuse an existing `role_selections` row matching the normalized role signature instead of inserting a new UUID.

# Context
- Postgres enum `job_source` is defined in `supabase/migrations/20260612000001_enums.sql` and extended in `20260803000001_manual_job_matches.sql`.
- `app_settings` stores key/value JSONB settings (`SupabaseSettingsRepository.ts`).
- `set_active_role_selection` RPC (`supabase/migrations/20260612000004_functions.sql`) currently deactivates active rows and always inserts a new `role_selections` row, orphaning `job_scores`.

# Inputs
- `supabase/migrations/20260612000004_functions.sql`
- `supabase/migrations/20260803000001_manual_job_matches.sql`
- `supabase/database.types.ts`

# Scope
Included: New timestamped migration file in `supabase/migrations/`, updated `supabase/database.types.ts`.
Excluded: Running migrations against production DB; changing TypeScript repository code (T002, T003, T005).

# Implementation guidance
1. Use `ALTER TYPE job_source RENAME VALUE 'claude_routine' TO 'routine_agent';` (guarded or standard Postgres 10+ syntax; note `RENAME VALUE` cannot run inside the same transaction as `ADD VALUE` in older PG versions if used in the same enum, so check PG/Supabase transaction rules or separate statements cleanly).
2. Add `'naukri'` and `'naukrigulf'` with `ALTER TYPE job_source ADD VALUE IF NOT EXISTS ...`.
3. Insert `('enabled_sources', '["naukri","naukrigulf"]'::jsonb)` into `app_settings` with `ON CONFLICT (key) DO NOTHING`.
4. Add a `role_signature` column (or deterministic lookup by `lower(trim(p_primary_role))` + sorted normalized `p_expanded_roles`) to `role_selections` and update `set_active_role_selection(p_primary_role text, p_expanded_roles text[])` to deactivate current active row, check for an existing matching row, reactivate + return it if found, else insert + return a new row.
5. Update `supabase/database.types.ts` `job_source` enum union/array and `role_selections` row types if a column was added.

# Expected outputs
- `supabase/migrations/20261119000001_naukri_box_pipeline.sql`
- Updated `supabase/database.types.ts`

# Acceptance criteria
Blocking:
- [ ] AC-001-1: Migration renames `claude_routine` → `routine_agent` and adds `naukri` and `naukrigulf` to `job_source`.
- [ ] AC-001-2: `app_settings` receives default `enabled_sources = ["naukri", "naukrigulf"]` with `ON CONFLICT (key) DO NOTHING`.
- [ ] AC-001-3: `set_active_role_selection` reuses an existing `role_selections` row when given the same normalized primary role + expanded roles, preserving its `id` and linked `job_scores`.
Quality:
- [ ] Migration is idempotent and includes rollback notes in comments.
Compatibility:
- [ ] `supabase/database.types.ts` compiles cleanly with `npm run typecheck` (or alongside T002).

# Verification
- Inspect SQL syntax and transaction safety (Postgres `ALTER TYPE ... ADD VALUE` vs `RENAME VALUE` transaction rules).
- Verify `supabase/database.types.ts` matches migration columns and enum values.

# Constraints
- Do NOT execute `supabase db push` or modify production data directly.
- Do NOT drop or truncate `job_scores` or `jobs`.

# Handoff
Return: status, summary, changed files, SQL verification notes, assumptions, risks, and notes for T002/T003.

# Failure handling
- Ambiguity in Postgres transaction rules for `ALTER TYPE`: split into two sequential migration files if PG rejects `RENAME VALUE` + `ADD VALUE` in one transaction.
- On judge FAIL (G3): one bounded `sr` or `pro` fix cycle per policy.
