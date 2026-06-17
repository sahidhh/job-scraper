-- Experience soft filter + editable app settings (P2,
-- docs/plans/feature-roadmap.md Phase 3).
--
-- min_years is a SOFT signal: parsed best-effort from job text at ingest,
-- nullable. NULL means "unknown" and is never filtered out (the dashboard
-- filter keeps `min_years is null or min_years <= desired`). No backfill --
-- existing rows stay NULL (always pass) until re-scraped.

alter table jobs add column min_years integer;

-- ============================================================
-- app_settings: editable key/value config (unlike the read-only env
-- thresholds). Single-user app, so a flat key/value store is enough.
-- ============================================================
create table app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;
create policy "authenticated_full_access" on app_settings
  for all to authenticated using (true) with check (true);
