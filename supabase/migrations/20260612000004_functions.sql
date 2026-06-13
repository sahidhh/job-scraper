-- Atomic "single active row" swap functions (decisions.md AD-09).
-- Each function deactivates the current active row, then inserts the
-- new row as active, in one transaction (implicit per function call) --
-- the partial unique indexes from 20260612000003_indexes.sql can never
-- see two active rows at once, even if a caller crashes mid-call
-- (worst case: zero active rows, never two).

-- ============================================================
-- set_active_resume: insert a new resume and make it the active one.
-- ============================================================
create or replace function set_active_resume(
  p_file_path   text,
  p_parsed_text text,
  p_skills      text[]
)
returns resumes
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

  return result;
end;
$$;

-- ============================================================
-- set_active_role_selection: insert a new role selection and make it active.
-- ============================================================
create or replace function set_active_role_selection(
  p_primary_role   text,
  p_expanded_roles text[]
)
returns role_selections
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

  return result;
end;
$$;
