-- database-audit.md Finding #1: set_active_resume / set_active_role_selection
-- were declared `returns resumes` / `returns role_selections` (a single
-- composite row), but database.types.ts types Functions.*.Returns as
-- ResumeRow[] / RoleSelectionRow[], and both repositories
-- (SupabaseResumeRepository.create, SupabaseRoleRepository.setActiveSelection)
-- already consume the RPC result as an array via `data?.[0]`.
--
-- Fix: change both functions to `returns setof <table>` so PostgREST wraps
-- the single row in an array, matching the existing generated types and
-- repository code exactly (decisions.md AD-09 swap logic is unchanged).
--
-- `create or replace function` cannot change a function's return type, so
-- each function is dropped and recreated.

drop function if exists set_active_resume(text, text, text[]);

create function set_active_resume(
  p_file_path   text,
  p_parsed_text text,
  p_skills      text[]
)
returns setof resumes
language plpgsql
as $$
declare
  result resumes;
begin
  update resumes
    set is_active = false
    where is_active = true;

  insert into resumes (file_path, parsed_text, skills, is_active)
  values (p_file_path, p_parsed_text, p_skills, true)
  returning * into result;

  return query select * from resumes where id = result.id;
end;
$$;

drop function if exists set_active_role_selection(text, text[]);

create function set_active_role_selection(
  p_primary_role   text,
  p_expanded_roles text[]
)
returns setof role_selections
language plpgsql
as $$
declare
  result role_selections;
begin
  update role_selections
    set is_active = false
    where is_active = true;

  insert into role_selections (primary_role, expanded_roles, is_active)
  values (p_primary_role, p_expanded_roles, true)
  returning * into result;

  return query select * from role_selections where id = result.id;
end;
$$;
