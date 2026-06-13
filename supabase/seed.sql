-- Seed strategy (database.md §7):
--   - Applies only to role_expansion_map, source = 'seed'.
--   - `role` values are normalized lowercase, matching the lookup in
--     RoleRepository.getExpansion (lower(trim(primary_role))).
--   - `on conflict (role) do nothing` -- safe to re-run (supabase db reset
--     locally). NOT auto-applied to production; apply once manually or via
--     a one-off migration using the same on-conflict guard.
--   - AI fallback (role_expansion_map rows with source = 'ai') is written
--     at runtime by the app, never by this file.

insert into role_expansion_map (role, related_roles, source) values
  ('full stack developer', array[
    'Frontend Developer',
    'Backend Developer',
    'Software Engineer',
    'React Developer',
    '.NET Developer',
    'Node Developer',
    'Python Developer'
  ], 'seed'),

  ('frontend developer', array[
    'Full Stack Developer',
    'React Developer',
    'UI Developer',
    'JavaScript Developer',
    'Web Developer'
  ], 'seed'),

  ('backend developer', array[
    'Full Stack Developer',
    'Software Engineer',
    'Node Developer',
    'Python Developer',
    '.NET Developer',
    'Java Developer',
    'API Developer'
  ], 'seed'),

  ('software engineer', array[
    'Full Stack Developer',
    'Backend Developer',
    'Frontend Developer',
    'Software Developer',
    'Application Developer'
  ], 'seed'),

  ('react developer', array[
    'Frontend Developer',
    'Full Stack Developer',
    'JavaScript Developer',
    'UI Developer'
  ], 'seed'),

  ('node developer', array[
    'Backend Developer',
    'Full Stack Developer',
    'JavaScript Developer',
    'API Developer'
  ], 'seed'),

  ('.net developer', array[
    'Backend Developer',
    'Full Stack Developer',
    'C# Developer',
    'Software Engineer'
  ], 'seed'),

  ('python developer', array[
    'Backend Developer',
    'Full Stack Developer',
    'Software Engineer',
    'Data Engineer'
  ], 'seed'),

  ('devops engineer', array[
    'Site Reliability Engineer',
    'Cloud Engineer',
    'Infrastructure Engineer',
    'Platform Engineer'
  ], 'seed'),

  ('data engineer', array[
    'Backend Developer',
    'Python Developer',
    'Software Engineer',
    'Data Scientist'
  ], 'seed')

on conflict (role) do nothing;
