# Source Health Migration — Rollback Guide

Migration: `supabase/migrations/20260619000010_source_health.sql`

## When to use this

If the source-health migration needs to be reversed (e.g., during an incident or failed deployment), apply the following SQL in your Supabase SQL editor or via migration.

## Rollback SQL

```sql
-- Remove source health columns from companies
ALTER TABLE companies
  DROP COLUMN IF EXISTS last_failure_at,
  DROP COLUMN IF EXISTS last_success_at,
  DROP COLUMN IF EXISTS consecutive_failures,
  DROP COLUMN IF EXISTS health_status;

-- Remove the index (dropped automatically with the column, but explicit for clarity)
DROP INDEX IF EXISTS companies_health_status_idx;

-- Remove the enum type (must be done AFTER the columns referencing it are dropped)
DROP TYPE IF EXISTS source_health_status;
```

## Notes

- Drop columns in reverse order of creation (or use `DROP COLUMN IF EXISTS` for safety)
- `health_status` must be dropped before `DROP TYPE source_health_status` — PostgreSQL will reject dropping a type that is still referenced by a column
- `DROP INDEX` is redundant when the column is dropped (indexes on that column are removed automatically), but is included for explicit documentation
- After rollback, `SupabaseCompanyRepository` and `Company` domain types will need their health fields reverted to compile without errors

## Re-applying the migration

Re-apply `20260619000010_source_health.sql` normally. The `CREATE TYPE` will fail if the type already exists — verify the type was dropped cleanly before re-running.
