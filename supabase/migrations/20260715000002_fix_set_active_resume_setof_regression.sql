-- Bug fix (real-world testing, MERGE_PLAN.md Bug 2): restoring a resume
-- version threw "set_active_resume returned no row" even though the row was
-- actually inserted.
--
-- Root cause: 20260612000006_fix_rpc_return_types.sql changed
-- set_active_resume to `returns setof resumes` so PostgREST wraps the
-- result in a JSON array, matching database.types.ts's `Returns: ...[]` and
-- SupabaseResumeRepository.create's `data?.[0]`. But both
-- 20260618000002_resume_versioning.sql and
-- 20260710000001_resumes_content_hash.sql redeclared the function as
-- `returns resumes` (a single composite row) while adding the versioning/
-- content-hash columns, silently undoing that fix -- neither migration's
-- own comments mention the return type, so the regression went unnoticed.
-- A non-setof function's result is serialized by PostgREST as a single JSON
-- *object*, not an array, so `data?.[0]` is always undefined even though
-- the INSERT itself commits successfully (verified locally: `select
-- proretset from pg_proc where proname = 'set_active_resume'` was `f`
-- before this migration; the row was present in `resumes` after the "no
-- row" error was thrown, confirming the insert succeeds and only the
-- return-shape/JS-parsing step fails).
--
-- Fix: redeclare with `returns setof resumes` again, keeping the current
-- (4-arg, content-hash-aware) signature and body otherwise unchanged.
-- `create or replace` cannot change a function's return type, so it must be
-- dropped and recreated (AD-11 forward-only).

drop function if exists set_active_resume(text, text, text[], text);

create function set_active_resume(
  p_file_path    text,
  p_parsed_text  text,
  p_skills       text[],
  p_content_hash text
)
returns setof resumes
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

  return query select * from resumes where id = result.id;
end;
$$;
