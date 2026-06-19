-- Resume versioning: tracks which resume version each score was generated
-- against so that stale scores (from prior resume versions) can be
-- filtered out by the dashboard and the scoring pipeline can re-score
-- against the new active resume. Historical score rows are preserved.

-- 1. Add version column to resumes.
--    Existing rows are back-filled with sequential version numbers
--    ordered by upload time, so the oldest upload becomes version 1.
alter table resumes add column version integer not null default 1;

update resumes
set version = sub.rn
from (
  select id, row_number() over (order by uploaded_at asc) as rn
  from resumes
) sub
where resumes.id = sub.id;

-- 2. Add resume_version to job_scores so each score row records which
--    resume version it was computed against.
--    Existing rows are set to the current active resume's version
--    (they were scored against it), or 0 as a sentinel if no active
--    resume exists (those rows are treated as stale by the pipeline).
alter table job_scores add column resume_version integer not null default 0;

update job_scores
set resume_version = coalesce(
  (select version from resumes where is_active = true limit 1),
  0
);

-- 3. Replace the (job_id, role_selection_id) unique constraint with a
--    three-column key that includes resume_version.  This preserves all
--    historical score rows while making each (job, role, version) triple
--    its own idempotent upsert target.
alter table job_scores drop constraint job_scores_job_role_uq;

alter table job_scores
  add constraint job_scores_job_role_version_uq
  unique (job_id, role_selection_id, resume_version);

-- 4. Update set_active_resume to auto-increment version so each new
--    upload gets a monotonically increasing version number.
create or replace function set_active_resume(
  p_file_path   text,
  p_parsed_text text,
  p_skills      text[]
)
returns resumes
language plpgsql
as $$
declare
  result       resumes;
  next_version integer;
begin
  next_version := coalesce((select max(version) from resumes), 0) + 1;

  update resumes
    set is_active = false
    where is_active = true;

  insert into resumes (file_path, parsed_text, skills, is_active, version)
  values (p_file_path, p_parsed_text, p_skills, true, next_version)
  returning * into result;

  return result;
end;
$$;
