-- Career page discovery (Phase 2 Task 8). Keyed by canonical_company_name
-- (not companies.id) so an entry can exist for any company name seen in
-- jobs.company_name, regardless of whether it has a `companies` board-token
-- row. discovery_method/confidence are plain text (fixed value sets live in
-- TypeScript -- CareerPageDiscoveryMethod/CareerPageConfidence) -- same
-- convention as scrape_runs.failure_category, avoids an enum-alter
-- migration for future discovery methods.
create table company_career_pages (
  id                     uuid primary key default gen_random_uuid(),
  canonical_company_name text not null unique,
  career_page_url        text not null,
  website_url            text,
  discovery_method       text not null,
  confidence             text not null,
  discovered_at          timestamptz not null default now()
);

-- RLS: authenticated users can read; writes are service-role only
-- (scripts/discover-career-pages.ts), same pattern as role_packs/job_duplicates.
alter table company_career_pages enable row level security;

create policy "authenticated users can read company_career_pages"
  on company_career_pages for select
  to authenticated
  using (true);
