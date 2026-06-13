-- Row Level Security (decisions.md AD-12).
-- Single-user app: one policy per table grants full access to the
-- `authenticated` role (the one Supabase Auth user). GitHub Actions
-- scripts use the service role key, which bypasses RLS entirely and
-- needs no policy.

alter table companies          enable row level security;
alter table jobs               enable row level security;
alter table resumes            enable row level security;
alter table role_selections    enable row level security;
alter table role_expansion_map enable row level security;
alter table job_scores         enable row level security;
alter table notifications_log  enable row level security;
alter table scrape_runs        enable row level security;

create policy "authenticated_full_access" on companies
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on jobs
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on resumes
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on role_selections
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on role_expansion_map
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on job_scores
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on notifications_log
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on scrape_runs
  for all to authenticated using (true) with check (true);
