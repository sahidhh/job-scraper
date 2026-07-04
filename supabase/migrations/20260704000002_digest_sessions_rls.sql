-- digest_sessions was created (20260621000001) without RLS -- unlike every
-- other application table (20260612000005_rls.sql), it was left fully
-- readable/writable via PostgREST to any anon/authenticated key holder,
-- since Postgres does not restrict a table's row visibility until RLS is
-- enabled on it. Close that gap with the same authenticated_full_access
-- pattern used everywhere else; app code (webhook route, notify.ts) uses
-- the service-role client, which bypasses RLS regardless, so this changes
-- nothing for the app itself.
alter table digest_sessions enable row level security;

create policy "authenticated_full_access" on digest_sessions
  for all to authenticated using (true) with check (true);
