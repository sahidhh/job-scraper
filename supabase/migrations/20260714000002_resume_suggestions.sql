-- merge-workspace Phase 3: AI resume suggestions, stored as versioned rows
-- (decisions.md AD-33). One row per suggest() call, scoped to the resume
-- version it was generated against (resume_id). applied_as_resume_id is
-- set when the user applies a chosen subset -- it points at the NEW resume
-- version created by that apply (resumes.create() never overwrites an
-- existing version; see application/applyResumeSuggestions.ts).

create table resume_suggestions (
  id                    uuid primary key default gen_random_uuid(),
  resume_id             uuid not null references resumes(id) on delete cascade,
  target_role           text not null default '',
  suggestions           jsonb not null,
  model                 text not null,
  created_at            timestamptz not null default now(),
  applied_as_resume_id  uuid references resumes(id) on delete set null
);

create index resume_suggestions_resume_id_idx on resume_suggestions (resume_id);

alter table resume_suggestions enable row level security;

-- Same single-user "authenticated_full_access" shape as every other table
-- (20260612000005_rls.sql) -- this app has one authenticated owner, not
-- per-row multi-tenant ownership.
create policy "authenticated_full_access" on resume_suggestions
  for all to authenticated using (true) with check (true);
