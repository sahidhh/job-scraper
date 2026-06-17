-- Add mycareersfuture as a supported job source.
-- ALTER TYPE ... ADD VALUE is not transactional in Postgres, but it is
-- idempotent when using Supabase migrations (each migration runs once).
alter type job_source add value if not exists 'mycareersfuture';
