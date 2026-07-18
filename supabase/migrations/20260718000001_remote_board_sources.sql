-- Add remotive and himalayas as supported job sources (remote-global boards
-- with public JSON APIs, refocus on remote/visa-sponsoring roles). Same
-- idempotent ALTER TYPE ... ADD VALUE pattern as
-- 20260715000001_jsearch_adzuna_careers_url_sources.sql.
alter type job_source add value if not exists 'remotive';
alter type job_source add value if not exists 'himalayas';
