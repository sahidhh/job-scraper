-- Add jsearch, adzuna, and careers_url as supported job sources
-- (merge-workspace Phase 5). ALTER TYPE ... ADD VALUE is not transactional
-- in Postgres, but it is idempotent when using Supabase migrations (each
-- migration runs once) -- same pattern as 20260617000003_mycareersfuture_source.sql.
alter type job_source add value if not exists 'jsearch';
alter type job_source add value if not exists 'adzuna';
alter type job_source add value if not exists 'careers_url';
