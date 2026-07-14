-- merge-workspace Phase 1 (resume module): sha256-based parse-once cache
-- (decisions.md AD-30). Same file content (by hash) is never re-parsed via
-- pdf-parse/mammoth again -- see ResumeRepository.findByContentHash and
-- application/uploadResume.ts.

alter table resumes add column content_hash text;

-- Not unique: re-uploading identical content still creates a new version
-- row (consistent with set_active_resume's existing versioning semantics,
-- and job_scores.resume_version keys history off distinct version numbers)
-- -- this index only speeds up the cache lookup by hash.
create index resumes_content_hash_idx
  on resumes (content_hash)
  where content_hash is not null;

-- set_active_resume must now also persist the content hash of the file
-- backing each version. Drop first because CREATE OR REPLACE cannot change
-- the parameter list.
drop function if exists set_active_resume(text, text, text[]);

create or replace function set_active_resume(
  p_file_path    text,
  p_parsed_text  text,
  p_skills       text[],
  p_content_hash text
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

  insert into resumes (file_path, parsed_text, skills, is_active, version, content_hash)
  values (p_file_path, p_parsed_text, p_skills, true, next_version, p_content_hash)
  returning * into result;

  return result;
end;
$$;
